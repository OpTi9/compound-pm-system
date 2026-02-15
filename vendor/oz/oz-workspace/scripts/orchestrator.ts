import crypto from "node:crypto"

import { prisma } from "../lib/prisma"
import { invokeAgent } from "../lib/invoke-agent"
import {
  truncate,
  safeJsonParse,
  envInt,
  envStr,
  parseReviewOutcome,
  parseDecomposePlan,
  parseLearnings,
} from "../lib/orchestrator-parsing"
import type { DecomposeTask } from "../lib/orchestrator-parsing"

process.on("unhandledRejection", (reason) => {
  // Keep the orchestrator alive; log loudly so a supervisor/ops can alert.
  // eslint-disable-next-line no-console
  console.error("[orchestrator] unhandledRejection", reason)
})

process.on("uncaughtException", (err) => {
  // Keep the orchestrator alive; log loudly so a supervisor/ops can alert.
  // eslint-disable-next-line no-console
  console.error("[orchestrator] uncaughtException", err)
})

type WorkStatus = "QUEUED" | "CLAIMED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED"

type WorkItemRow = Awaited<ReturnType<typeof prisma.workItem.findUnique>>

const ORCH_INSTANCE_ID = (process.env.OZ_ORCH_INSTANCE_ID || "").trim() || `orch_${crypto.randomUUID()}`

function now(): Date {
  return new Date()
}

function newRunId(workItemId: string): string {
  // Prefer inv_ prefix because other subsystems assume invocation ids look like this.
  const h = crypto.createHash("sha1").update(workItemId).digest("hex").slice(0, 16)
  return `inv_work_${h}`
}

async function writeHeartbeat() {
  await prisma.agentCallback.upsert({
    where: { id: "orch:last_tick" },
    update: { response: now().toISOString() },
    create: { id: "orch:last_tick", response: now().toISOString() },
  }).catch(() => {})
}

async function ensureChainId(item: { id: string; chainId: string | null }): Promise<string> {
  if (item.chainId) return item.chainId
  // First item in a chain: use its own id.
  await prisma.workItem.updateMany({
    where: { id: item.id, chainId: null },
    data: { chainId: item.id },
  })
  return item.id
}

async function resolveRexAgentId(roomId: string, payload: any): Promise<string> {
  const fromPayload = typeof payload?.reviewAgentId === "string" ? payload.reviewAgentId.trim() : ""
  if (fromPayload) return fromPayload

  const fromEnv = (envStr("OZ_ORCH_REX_AGENT_ID") || "").trim()
  if (fromEnv) return fromEnv

  const rexName = (envStr("OZ_ORCH_REX_AGENT_NAME") || "Rex").trim().toLowerCase()
  const agents = await prisma.roomAgent.findMany({
    where: { roomId },
    include: { agent: { select: { id: true, name: true } } },
  })
  const match = agents.map((ra) => ra.agent).find((a) => (a?.name || "").trim().toLowerCase() === rexName)
  if (match?.id) return match.id
  throw new Error(`Rex agent not found in room ${roomId}. Set OZ_ORCH_REX_AGENT_ID or add an Agent named "${rexName}".`)
}

async function lastAgentMessageText(roomId: string, agentId: string): Promise<string | null> {
  const msg = await prisma.message.findFirst({
    where: { roomId, authorType: "agent", authorId: agentId },
    orderBy: { timestamp: "desc" },
    select: { content: true },
  })
  const text = (msg?.content || "").trim()
  return text ? text : null
}

async function isAgentInRoom(roomId: string, agentId: string): Promise<boolean> {
  const m = await prisma.roomAgent.findUnique({
    where: { roomId_agentId: { roomId, agentId } },
    select: { id: true },
  })
  return Boolean(m)
}

async function computeDefaultImplAgentId(roomId: string): Promise<string | null> {
  const roomAgents = await prisma.roomAgent.findMany({
    where: { roomId },
    include: { agent: { select: { id: true, name: true } } },
  })
  const pick = roomAgents
    .map((ra) => ra.agent)
    .find((a) => {
      const n = (a?.name || "").trim().toLowerCase()
      return n && n !== "rex" && n !== "avery"
    })
  return pick?.id || null
}

async function resolveAveryAgentId(roomId: string): Promise<string | null> {
  const roomAgents = await prisma.roomAgent.findMany({
    where: { roomId },
    include: { agent: { select: { id: true, name: true } } },
  })
  const avery = roomAgents.map((ra) => ra.agent).find((a) => (a?.name || "").trim().toLowerCase() === "avery")
  return avery?.id || null
}

async function enqueueLearningsForPrd(prdId: string) {
  const prd = await prisma.prd.findUnique({ where: { id: prdId }, select: { id: true, title: true, content: true, roomId: true } }).catch(() => null)
  if (!prd) return

  const existing = await prisma.workItem.findFirst({
    where: { chainId: prdId, type: "learnings", status: { in: ["QUEUED", "CLAIMED", "RUNNING", "SUCCEEDED"] } },
    select: { id: true },
  })
  if (existing) return

  const averyId = await resolveAveryAgentId(prd.roomId)
  if (!averyId) return

  // Collect a compact trace of task/review outputs for this PRD.
  const chainItems = await prisma.workItem.findMany({
    where: { chainId: prdId, type: { in: ["task", "review"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, type: true, runId: true, status: true, agentId: true, payload: true, lastError: true },
    take: 80,
  }).catch(() => [])

  const excerpts: string[] = []
  for (const w of chainItems) {
    const payload = safeJsonParse<any>(w.payload, {})
    const taskTitle = typeof payload?.title === "string" ? payload.title.trim() : ""
    const taskPrompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : ""
    let msgText = ""
    if (w.runId) {
      const msg = await prisma.message.findUnique({ where: { id: w.runId }, select: { content: true } }).catch(() => null)
      msgText = (msg?.content || "").trim()
    }
    const header = `${w.type.toUpperCase()} ${taskTitle ? `(${taskTitle}) ` : ""}[${w.status}]`
    const body = [
      taskPrompt ? `Prompt:\n${truncate(taskPrompt, 1200)}` : "",
      msgText ? `Output:\n${truncate(msgText, 1600)}` : "",
      w.lastError ? `Error:\n${truncate(w.lastError, 600)}` : "",
    ].filter(Boolean).join("\n\n")
    if (body) excerpts.push(`${header}\n${body}`)
    if (excerpts.join("\n\n---\n\n").length > 24_000) break
  }

  const learningsPrompt = [
    "You are Avery. Extract durable knowledge from this PRD execution so future work is faster and safer.",
    "",
    "OUTPUT FORMAT (mandatory): return a single JSON object, prefer a ```json code fence```.",
    "Schema:",
    "{",
    '  "learnings": [',
    '    { "kind": "pattern|gotcha|decision|learning", "title": "...", "content": "...", "tags": ["optional"] }',
    "  ]",
    "}",
    "",
    "Rules:",
    "- Only include items that are reusable beyond this PRD (patterns, gotchas, decisions, conventions).",
    "- Keep each content entry concise but actionable (include commands, paths, or invariants when relevant).",
    "- Avoid repeating the PRD itself; focus on what we learned while executing it.",
    "",
    `PRD: ${prd.title}`,
    "",
    "PRD content:",
    truncate(prd.content || "(empty)", 10_000),
    "",
    excerpts.length ? "Execution trace excerpts:\n\n" + excerpts.join("\n\n---\n\n") : "Execution trace excerpts: (none)",
  ].join("\n")

  await prisma.workItem.create({
    data: {
      type: "learnings",
      status: "QUEUED",
      payload: JSON.stringify({
        roomId: prd.roomId,
        agentId: averyId,
        prompt: learningsPrompt,
        prdId,
      }),
      chainId: prdId,
      sourceItemId: null,
      roomId: prd.roomId,
      agentId: averyId,
    },
  })
}

async function maybeMarkPrdCompleted(prdId: string) {
  const prd = await prisma.prd.findUnique({ where: { id: prdId }, select: { id: true, status: true } }).catch(() => null)
  if (!prd) return
  if (prd.status !== "ACTIVE") return

  const [tasksTotal, tasksNotSucceeded, inFlight] = await Promise.all([
    prisma.workItem.count({ where: { chainId: prdId, type: "task" } }),
    prisma.workItem.count({ where: { chainId: prdId, type: "task", status: { not: "SUCCEEDED" } } }),
    prisma.workItem.count({
      where: {
        chainId: prdId,
        type: { in: ["task", "review"] },
        status: { in: ["QUEUED", "CLAIMED", "RUNNING"] },
      },
    }),
  ])

  if (tasksTotal === 0) return
  if (tasksNotSucceeded !== 0) return
  if (inFlight !== 0) return

  const updated = await prisma.prd.updateMany({ where: { id: prdId, status: "ACTIVE" }, data: { status: "COMPLETED" } })
  if (updated.count === 1) {
    await enqueueLearningsForPrd(prdId).catch(() => {})
  }
}

async function scheduleReviewForTask(item: WorkItemRow, payload: any, promptText: string) {
  if (!item) return
  if (item.type !== "task" || item.status !== "SUCCEEDED") return
  if (!item.roomId || !item.agentId) return

  const chainId = await ensureChainId({ id: item.id, chainId: item.chainId })

  // Dedupe: only one review per task work item.
  const existing = await prisma.workItem.findFirst({
    where: { type: "review", sourceItemId: item.id },
    select: { id: true },
  })
  if (existing) return

  const rexAgentId = await resolveRexAgentId(item.roomId, payload)

  // Best-effort: include the agent's last message, but keep prompts bounded.
  const implOutput = await lastAgentMessageText(item.roomId, item.agentId).catch(() => null)
  const reviewPrompt = [
    "You are Rex. Review the implementation against the original task.",
    "",
    "Respond with exactly one of:",
    "- APPROVED",
    "- CHANGES_NEEDED: <details>",
    "",
    "Original task:",
    truncate(promptText, 8000),
    "",
    implOutput ? "Implementation output:\n" + truncate(implOutput, 12000) : "Implementation output: (not found)",
    "",
    "Checklist: correctness, edge cases, security issues, tests, and any regressions.",
  ].join("\n")

  await prisma.workItem.create({
    data: {
      type: "review",
      status: "QUEUED",
      payload: JSON.stringify({
        roomId: item.roomId,
        agentId: rexAgentId,
        prompt: reviewPrompt,
        userId: payload?.userId ?? null,
        sourceWorkItemId: item.id,
      }),
      chainId,
      sourceItemId: item.id,
      iteration: item.iteration,
      maxIterations: item.maxIterations,
      roomId: item.roomId,
      agentId: rexAgentId,
      sourceTaskId: item.sourceTaskId,
      epicId: item.epicId,
    },
  })
}

async function scheduleReworkFromReview(reviewItem: WorkItemRow, reviewPayload: any, reviewText: string) {
  if (!reviewItem || reviewItem.type !== "review") return
  if (!reviewItem.roomId) return

  const parsed = parseReviewOutcome(reviewText)
  if (!parsed) {
    await prisma.workItem.update({
      where: { id: reviewItem.id },
      data: { status: "FAILED", leaseExpiresAt: null, lastError: "Invalid review format (expected APPROVED or CHANGES_NEEDED)" },
    })
    return
  }

  if (parsed.outcome === "APPROVED") {
    // Review already marked SUCCEEDED by the caller; nothing else to do.
    return
  }

  // CHANGES_NEEDED
  const parentId = (reviewPayload?.sourceWorkItemId || reviewPayload?.source_item_id || reviewItem.sourceItemId || "").toString()
  if (!parentId) {
    await prisma.workItem.update({
      where: { id: reviewItem.id },
      data: { status: "FAILED", leaseExpiresAt: null, lastError: "Missing sourceWorkItemId for rework" },
    })
    return
  }

  const parent = await prisma.workItem.findUnique({ where: { id: parentId } })
  if (!parent || parent.type !== "task") {
    await prisma.workItem.update({
      where: { id: reviewItem.id },
      data: { status: "FAILED", leaseExpiresAt: null, lastError: "Invalid sourceWorkItemId (parent task not found)" },
    })
    return
  }
  if (!parent.roomId || !parent.agentId) {
    await prisma.workItem.update({
      where: { id: reviewItem.id },
      data: { status: "FAILED", leaseExpiresAt: null, lastError: "Parent task missing roomId/agentId" },
    })
    return
  }

  const nextIteration = parent.iteration + 1
  const maxIterations = parent.maxIterations
  if (nextIteration > maxIterations) {
    await prisma.workItem.update({
      where: { id: reviewItem.id },
      data: { status: "FAILED", leaseExpiresAt: null, lastError: `Max iterations exceeded (${maxIterations})` },
    })
    return
  }

  // Dedupe: only one rework task per review work item.
  const existing = await prisma.workItem.findFirst({
    where: { type: "task", sourceItemId: reviewItem.id },
    select: { id: true },
  })
  if (existing) return

  const parentPayload = safeJsonParse<any>(parent.payload, {})
  const originalPrompt = typeof parentPayload?.prompt === "string" ? parentPayload.prompt : ""

  const reworkPrompt = [
    "You implemented a task and Rex requested changes.",
    "",
    "Apply the requested changes, then reply with what changed and why.",
    "",
    "Original task:",
    truncate(originalPrompt || "(missing)", 8000),
    "",
    "Rex review (CHANGES_NEEDED):",
    truncate(parsed.details, 12000),
  ].join("\n")

  await prisma.workItem.create({
    data: {
      type: "task",
      status: "QUEUED",
      payload: JSON.stringify({
        roomId: parent.roomId,
        agentId: parent.agentId,
        prompt: reworkPrompt,
        userId: reviewPayload?.userId ?? parentPayload?.userId ?? null,
      }),
      chainId: parent.chainId || parent.id,
      sourceItemId: reviewItem.id,
      iteration: nextIteration,
      maxIterations: maxIterations,
      roomId: parent.roomId,
      agentId: parent.agentId,
      sourceTaskId: parent.sourceTaskId,
      epicId: parent.epicId,
    },
  })
}

async function handleDecomposeSucceeded(item: WorkItemRow, payload: any, decomposeText: string) {
  if (!item.roomId) throw new Error("Missing roomId")

  const prdId = typeof payload?.prdId === "string" ? payload.prdId.trim() : (item.chainId || "").trim()
  if (!prdId) throw new Error("Missing prdId")

  const plan = parseDecomposePlan(decomposeText)
  if (!plan) throw new Error("No plan parsed from decomposer output")

  let defaultAgentId: string | null =
    typeof payload?.defaultAgentId === "string" ? payload.defaultAgentId.trim() : null
  if (defaultAgentId && !(await isAgentInRoom(item.roomId, defaultAgentId))) {
    defaultAgentId = null
  }
  if (!defaultAgentId) defaultAgentId = await computeDefaultImplAgentId(item.roomId)
  if (!defaultAgentId) throw new Error("No default implementation agent available in room")

  const userId = payload?.userId ?? null

  const enqueueTask = async (t: DecomposeTask, opts: { epicId?: string | null; epicKey?: string | null }) => {
    let agentId = t.agentId || ""
    if (agentId && !(await isAgentInRoom(item.roomId!, agentId))) agentId = ""
    agentId = agentId || defaultAgentId!

    const prompt = [t.prompt.trim(), "", "(This task was generated from PRD decomposition.)"].join("\n")

    const stableKeyInput = opts.epicKey
      ? `${prdId}\nEPIC:${opts.epicKey}\n${t.title}\n${t.prompt}`
      : `${prdId}\n${t.title}\n${t.prompt}`
    const stableKey = crypto.createHash("sha1").update(stableKeyInput).digest("hex")
    const markerId = `decompose:${prdId}:${stableKey}`
    const marker = await prisma.agentCallback.findUnique({ where: { id: markerId }, select: { id: true } }).catch(() => null)
    if (marker) return
    await prisma.agentCallback.create({ data: { id: markerId, response: "1" } }).catch(() => null)

    await prisma.workItem.create({
      data: {
        type: "task",
        status: "QUEUED",
        payload: JSON.stringify({
          roomId: item.roomId,
          agentId,
          prompt,
          userId,
          title: t.title,
          prdId,
        }),
        chainId: prdId,
        sourceItemId: item.id,
        iteration: 0,
        maxIterations: 3,
        roomId: item.roomId,
        agentId,
        ...(opts.epicId ? { epicId: opts.epicId } : {}),
      },
    })
  }

  if (plan.epics) {
    for (let i = 0; i < plan.epics.length; i++) {
      const e = plan.epics[i]
      const epicTitle = e.title.trim()
      if (!epicTitle) continue

      const epicKey = crypto.createHash("sha1").update(`${prdId}\n${epicTitle}`).digest("hex")
      const epicMarkerId = `epic:${prdId}:${epicKey}`
      let epicId: string | null = null

      const marker = await prisma.agentCallback.findUnique({ where: { id: epicMarkerId }, select: { response: true } }).catch(() => null)
      if (marker?.response) {
        const existing = await prisma.epic.findUnique({ where: { id: marker.response }, select: { id: true } }).catch(() => null)
        if (existing?.id) epicId = existing.id
      }

      if (!epicId) {
        const created = await prisma.epic.create({
          data: { prdId, title: epicTitle, status: "ACTIVE", order: i },
          select: { id: true },
        })
        epicId = created.id
        await prisma.agentCallback.upsert({
          where: { id: epicMarkerId },
          update: { response: epicId },
          create: { id: epicMarkerId, response: epicId },
        }).catch(() => null)
      } else {
        // Best-effort sync if the decomposer changed ordering/titles.
        await prisma.epic.updateMany({ where: { id: epicId }, data: { title: epicTitle, order: i } }).catch(() => null)
      }

      for (const t of e.tasks) {
        await enqueueTask(t, { epicId, epicKey })
      }
    }
  } else if (plan.tasks) {
    // Enqueue tasks (dedupe best-effort by title+prompt hash in chain).
    for (const t of plan.tasks) {
      await enqueueTask(t, { epicId: null, epicKey: null })
    }
  } else {
    throw new Error("No tasks parsed from decomposer output")
  }

  await prisma.prd.updateMany({ where: { id: prdId }, data: { status: "ACTIVE" } })
}

async function claimNext(opts: {
  leaseMs: number
}): Promise<null | { id: string; attempts: number; maxAttempts: number }> {
  const next = await prisma.workItem.findFirst({
    where: {
      status: "QUEUED",
    },
    orderBy: [{ createdAt: "asc" }],
    select: { id: true, attempts: true, maxAttempts: true },
  })
  if (!next) return null

  const leaseExpiresAt = new Date(Date.now() + opts.leaseMs)
  const updated = await prisma.workItem.updateMany({
    where: { id: next.id, status: "QUEUED" },
    data: {
      status: "CLAIMED",
      claimedAt: now(),
      leaseExpiresAt,
      leaseOwner: ORCH_INSTANCE_ID,
      attempts: { increment: 1 },
      lastError: null,
    },
  })
  if (updated.count !== 1) return null

  const claimed = await prisma.workItem.findUnique({
    where: { id: next.id },
    select: { id: true, attempts: true, maxAttempts: true },
  })
  if (!claimed) return null

  return claimed
}

async function requeueExpired(opts: { leaseMs: number }) {
  const expired = await prisma.workItem.findMany({
    where: {
      status: { in: ["CLAIMED", "RUNNING"] as WorkStatus[] },
      leaseExpiresAt: { lt: now() },
    },
    select: { id: true, attempts: true, maxAttempts: true, runId: true, status: true },
    take: 200,
  })
  if (expired.length === 0) return

  for (const w of expired) {
    // If we have a runId, attempt to reconcile the final state from persisted runs/messages.
    if (w.runId) {
      try {
        const run = await prisma.agentRun.findUnique({
          where: { id: w.runId },
          select: { state: true, errorMessage: true },
        })
        if (run?.state === "SUCCEEDED" || run?.state === "FAILED" || run?.state === "CANCELLED") {
          await prisma.workItem.updateMany({
            where: { id: w.id, status: { in: ["CLAIMED", "RUNNING"] } },
            data: {
              status: run.state as WorkStatus,
              leaseExpiresAt: null,
              leaseOwner: null,
              lastError: run.state === "FAILED" ? (run.errorMessage || "Run failed") : null,
            },
          })
          continue
        }
      } catch {
        // Ignore reconciliation errors; fall back to lease-based requeue/fail below.
      }

      try {
        const msg = await prisma.message.findUnique({
          where: { id: w.runId },
          select: { content: true },
        })
        if (msg?.content && msg.content.trim()) {
          await prisma.workItem.updateMany({
            where: { id: w.id, status: { in: ["CLAIMED", "RUNNING"] } },
            data: { status: "SUCCEEDED", leaseExpiresAt: null, leaseOwner: null, lastError: null },
          })
          continue
        }
      } catch {
        // ignore
      }
    }

    const shouldFail = w.attempts >= w.maxAttempts
    await prisma.workItem.updateMany({
      where: { id: w.id, status: { in: ["CLAIMED", "RUNNING"] } },
      data: shouldFail
        ? {
            status: "FAILED",
            leaseExpiresAt: null,
            leaseOwner: null,
            lastError: "Lease expired too many times",
          }
        : {
            status: "QUEUED",
            claimedAt: null,
            leaseExpiresAt: null,
            leaseOwner: null,
            runId: null,
            lastError: "Lease expired; requeued",
          },
    })
  }
}

async function reconcileFinalizedRuns(opts: { excludeIds: string[] }) {
  const exclude = (opts.excludeIds || []).filter(Boolean)
  const running = await prisma.workItem.findMany({
    where: {
      status: "RUNNING",
      leaseOwner: ORCH_INSTANCE_ID,
      runId: { not: null },
      ...(exclude.length ? { id: { notIn: exclude } } : {}),
    },
    select: { id: true, runId: true, status: true },
    take: 50,
  })
  if (running.length === 0) return

  const runIds = Array.from(new Set(running.map((w) => w.runId).filter(Boolean) as string[]))
  if (runIds.length === 0) return

  const [runs, messages] = await Promise.all([
    prisma.agentRun.findMany({
      where: { id: { in: runIds } },
      select: { id: true, state: true, errorMessage: true },
    }).catch(() => [] as Array<{ id: string; state: string; errorMessage: string | null }>),
    prisma.message.findMany({
      where: { id: { in: runIds } },
      select: { id: true, content: true },
    }).catch(() => [] as Array<{ id: string; content: string }>),
  ])

  const runById = new Map(runs.map((r) => [r.id, r]))
  const msgById = new Map(messages.map((m) => [m.id, m]))

  for (const w of running) {
    const runId = w.runId || ""
    if (!runId) continue

    const run = runById.get(runId)
    if (run?.state === "SUCCEEDED" || run?.state === "FAILED" || run?.state === "CANCELLED") {
      await prisma.workItem.updateMany({
        where: { id: w.id, status: "RUNNING", leaseOwner: ORCH_INSTANCE_ID },
        data: {
          status: run.state as WorkStatus,
          leaseExpiresAt: null,
          leaseOwner: null,
          lastError: run.state === "FAILED" ? (run.errorMessage || "Run failed") : null,
        },
      }).catch(() => {})
      continue
    }

    const msg = msgById.get(runId)
    if (msg?.content && msg.content.trim()) {
      await prisma.workItem.updateMany({
        where: { id: w.id, status: "RUNNING", leaseOwner: ORCH_INSTANCE_ID },
        data: { status: "SUCCEEDED", leaseExpiresAt: null, leaseOwner: null, lastError: null },
      }).catch(() => {})
    }
  }
}

async function bumpLeases(ids: string[], leaseMs: number) {
  const uniq = Array.from(new Set((ids || []).filter(Boolean)))
  if (uniq.length === 0) return
  await prisma.workItem.updateMany({
    where: { id: { in: uniq }, status: "RUNNING", leaseOwner: ORCH_INSTANCE_ID },
    data: { leaseExpiresAt: new Date(Date.now() + leaseMs) },
  }).catch(() => {})
}

async function handleWorkItem(workItemId: string, opts: { leaseMs: number }) {
  const item = await prisma.workItem.findUnique({ where: { id: workItemId } })
  if (!item) return
  if (item.status !== "CLAIMED") return
  if ((item.leaseOwner || "") !== ORCH_INSTANCE_ID) return

  const payload = safeJsonParse<any>(item.payload, {})
  const roomId: string | null = (payload.roomId ?? item.roomId ?? null) as any
  const agentId: string | null = (payload.agentId ?? item.agentId ?? null) as any
  const prompt: string | null = (payload.prompt ?? null) as any
  const userId: string | null = (payload.userId ?? null) as any

  if (!roomId || !agentId || !prompt || typeof prompt !== "string") {
    await prisma.workItem.updateMany({
      where: { id: item.id, status: "CLAIMED", leaseOwner: ORCH_INSTANCE_ID },
      data: { status: "FAILED", leaseExpiresAt: null, leaseOwner: null, lastError: "Invalid payload (requires roomId, agentId, prompt)" },
    })
    return
  }

  const runId = item.runId || newRunId(item.id)
  const chainId = await ensureChainId({ id: item.id, chainId: item.chainId })
  const started = await prisma.workItem.updateMany({
    where: { id: item.id, status: "CLAIMED", leaseOwner: ORCH_INSTANCE_ID },
    data: {
      status: "RUNNING",
      runId,
      chainId,
      // Extend the lease for the duration of execution; it can be bumped again on each tick.
      leaseExpiresAt: new Date(Date.now() + opts.leaseMs),
    },
  })
  if (started.count !== 1) return

  try {
    const res = await invokeAgent({
      roomId,
      agentId,
      prompt,
      depth: 0,
      userId,
      invocationId: runId,
    })

    if (!res.success) {
      await prisma.workItem.updateMany({
        where: { id: item.id, status: "RUNNING", leaseOwner: ORCH_INSTANCE_ID },
        data: { status: "FAILED", leaseExpiresAt: null, leaseOwner: null, lastError: truncate(res.error || "invokeAgent failed", 4000) },
      })
      return
    }

    await prisma.workItem.updateMany({
      where: { id: item.id, status: "RUNNING", leaseOwner: ORCH_INSTANCE_ID },
      data: { status: "SUCCEEDED", leaseExpiresAt: null, leaseOwner: null, lastError: null },
    })

    // Completion hooks:
    // - task success => enqueue review
    // - review success => parse outcome; if changes needed enqueue rework task
    // - decompose success => parse JSON tasks and enqueue work
    if (item.type === "task") {
      await scheduleReviewForTask({ ...item, status: "SUCCEEDED", chainId }, payload, prompt).catch(async (e) => {
        const msg = e instanceof Error ? e.message : String(e)
        await prisma.workItem.updateMany({
          where: { id: item.id, status: "SUCCEEDED" },
          data: { lastError: truncate(`review_enqueue_failed: ${msg}`, 4000) },
        })
      })

      if (chainId) {
        // Best-effort: may complete PRD if this was the last pending item and all reviews are done.
        await maybeMarkPrdCompleted(chainId).catch(() => {})
      }
  } else if (item.type === "review") {
      const reviewText = (res.message as any)?.content || (res.message as any)?.message?.content || ""
      const parsed = parseReviewOutcome(reviewText)
      if (parsed?.outcome === "APPROVED") {
        // no-op (review succeeded and approved)
      } else if (parsed?.outcome === "CHANGES_NEEDED") {
        await scheduleReworkFromReview({ ...item, status: "SUCCEEDED", chainId }, payload, reviewText).catch(async (e) => {
          const msg = e instanceof Error ? e.message : String(e)
          await prisma.workItem.updateMany({
            where: { id: item.id, status: "SUCCEEDED" },
            data: { lastError: truncate(`rework_enqueue_failed: ${msg}`, 4000) },
          })
        })
      } else {
        // Invalid format: treat the review work item as failed so it is visible.
        await prisma.workItem.updateMany({
          where: { id: item.id, status: "SUCCEEDED" },
          data: { status: "FAILED", lastError: "Invalid review format (expected APPROVED or CHANGES_NEEDED)" },
        })
      }

      if (chainId) {
        await maybeMarkPrdCompleted(chainId).catch(() => {})
      }
    } else if (item.type === "decompose") {
      const decomposeText = (res.message as any)?.content || ""
      try {
        await handleDecomposeSucceeded({ ...item, status: "SUCCEEDED", chainId }, payload, decomposeText)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        await prisma.workItem.updateMany({
          where: { id: item.id, status: "SUCCEEDED" },
          data: { status: "FAILED", lastError: truncate(`decompose_parse_failed: ${msg}`, 4000) },
        })
        const prdId = typeof payload?.prdId === "string" ? payload.prdId.trim() : chainId
        if (prdId) {
          await prisma.prd.updateMany({ where: { id: prdId, status: "DECOMPOSING" }, data: { status: "DRAFT" } }).catch(() => {})
        }
      }
    } else if (item.type === "learnings") {
      const learningsText = (res.message as any)?.content || ""
      const prdId = typeof payload?.prdId === "string" ? payload.prdId.trim() : chainId
      const roomIdForKnowledge = roomId

      const parsed = parseLearnings(learningsText)
      if (!parsed || parsed.length === 0 || !prdId) {
        await prisma.workItem.updateMany({
          where: { id: item.id, status: "SUCCEEDED" },
          data: { status: "FAILED", lastError: "Invalid learnings format (expected JSON with learnings[])" },
        })
      } else {
        for (const l of parsed) {
          const stableKey = crypto.createHash("sha1").update(`${prdId}\n${l.kind || ""}\n${l.title}\n${l.content}`).digest("hex")
          const markerId = `learn:${prdId}:${stableKey}`
          const marker = await prisma.agentCallback.findUnique({ where: { id: markerId }, select: { id: true } }).catch(() => null)
          if (marker) continue
          await prisma.agentCallback.create({ data: { id: markerId, response: "1" } }).catch(() => null)

          await prisma.knowledgeItem.create({
            data: {
              roomId: roomIdForKnowledge,
              kind: (l.kind || "learning").slice(0, 40),
              title: l.title.slice(0, 200),
              content: l.content,
              tagsJson: JSON.stringify((l.tags || []).slice(0, 20)),
              sourcePrdId: prdId,
              sourceWorkItemId: item.id,
              createdByUserId: null,
              createdByAgentId: agentId,
            },
          }).catch(() => {})
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await prisma.workItem.updateMany({
      where: { id: item.id, status: "RUNNING", leaseOwner: ORCH_INSTANCE_ID },
      data: { status: "FAILED", leaseExpiresAt: null, leaseOwner: null, lastError: truncate(msg, 4000) },
    })

    if (item.type === "decompose") {
      const prdId = typeof payload?.prdId === "string" ? payload.prdId.trim() : (item.chainId || "").trim()
      if (prdId) {
        await prisma.prd.updateMany({ where: { id: prdId, status: "DECOMPOSING" }, data: { status: "DRAFT" } }).catch(() => {})
      }
    }
  }
}

async function tick(opts: { pollMs: number; leaseMs: number }) {
  await requeueExpired({ leaseMs: opts.leaseMs })

  // Back-compat: kept for older call sites. The main loop below now handles concurrency/in-flight.
  const claimed = await claimNext({ leaseMs: opts.leaseMs })
  if (!claimed) return
  if (claimed.attempts > claimed.maxAttempts) {
    await prisma.workItem.updateMany({
      where: { id: claimed.id, status: "CLAIMED", leaseOwner: ORCH_INSTANCE_ID },
      data: { status: "FAILED", leaseExpiresAt: null, leaseOwner: null, lastError: "Max attempts exceeded" },
    })
    return
  }
  await handleWorkItem(claimed.id, { leaseMs: opts.leaseMs })
}

async function main() {
  const pollMs = Math.max(250, envInt("OZ_ORCH_POLL_MS", 2000))
  const leaseMs = Math.max(10_000, envInt("OZ_ORCH_LEASE_MS", 10 * 60_000))
  const concurrency = Math.max(1, Math.min(16, envInt("OZ_ORCH_CONCURRENCY", 1)))

  // eslint-disable-next-line no-console
  console.log("[orchestrator] starting", { pollMs, leaseMs, concurrency, instanceId: ORCH_INSTANCE_ID })

  const inFlight = new Map<string, Promise<void>>()

  // Simple polling loop.
  // Note: Next.js request handlers are not a safe place for this; run this script separately.
  for (;;) {
    await writeHeartbeat()
    await reconcileFinalizedRuns({ excludeIds: Array.from(inFlight.keys()) }).catch(() => {})
    await requeueExpired({ leaseMs }).catch(() => {})
    await bumpLeases(Array.from(inFlight.keys()), leaseMs).catch(() => {})

    while (inFlight.size < concurrency) {
      const claimed = await claimNext({ leaseMs }).catch(() => null)
      if (!claimed) break

      if (claimed.attempts > claimed.maxAttempts) {
        await prisma.workItem.updateMany({
          where: { id: claimed.id, status: "CLAIMED", leaseOwner: ORCH_INSTANCE_ID },
          data: { status: "FAILED", leaseExpiresAt: null, leaseOwner: null, lastError: "Max attempts exceeded" },
        }).catch(() => {})
        continue
      }

      const p = handleWorkItem(claimed.id, { leaseMs })
        .catch((e) => {
          // eslint-disable-next-line no-console
          console.error("[orchestrator] handleWorkItem failed", { id: claimed.id, err: e })
        })
        .finally(() => {
          inFlight.delete(claimed.id)
        })
      inFlight.set(claimed.id, p)
    }

    await new Promise((r) => setTimeout(r, pollMs))
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[orchestrator] fatal", e)
  process.exit(1)
})
