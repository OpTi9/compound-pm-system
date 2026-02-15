import crypto from "node:crypto"

import { prisma } from "../lib/prisma"
import { invokeAgent } from "../lib/invoke-agent"

type WorkStatus = "QUEUED" | "CLAIMED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED"

type WorkItemRow = Awaited<ReturnType<typeof prisma.workItem.findUnique>>

function envInt(key: string, fallback: number): number {
  const raw = (process.env[key] || "").trim()
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

function envStr(key: string): string | undefined {
  const raw = (process.env[key] || "").trim()
  return raw ? raw : undefined
}

function now(): Date {
  return new Date()
}

function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + `\n\n[truncated ${s.length - max} chars]`
}

function newRunId(workItemId: string): string {
  // Prefer inv_ prefix because other subsystems assume invocation ids look like this.
  const h = crypto.createHash("sha1").update(workItemId).digest("hex").slice(0, 16)
  return `inv_work_${h}`
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

function parseReviewOutcome(text: string): { outcome: "APPROVED" | "CHANGES_NEEDED"; details: string } | null {
  const t = (text || "").trim()
  if (!t) return null
  const firstLine = t.split(/\r?\n/, 1)[0]?.trim() || ""
  const head = (firstLine || t.slice(0, 40)).trim().toUpperCase()

  if (head.startsWith("APPROVED")) return { outcome: "APPROVED", details: t }
  if (head.startsWith("CHANGES_NEEDED")) return { outcome: "CHANGES_NEEDED", details: t }

  // Fallback: anywhere in the response, but prefer CHANGES_NEEDED if both appear.
  const upper = t.toUpperCase()
  if (upper.includes("CHANGES_NEEDED")) return { outcome: "CHANGES_NEEDED", details: t }
  if (upper.includes("APPROVED")) return { outcome: "APPROVED", details: t }
  return null
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
    },
  })
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
            data: { status: "SUCCEEDED", leaseExpiresAt: null, lastError: null },
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
            lastError: "Lease expired too many times",
          }
        : {
            status: "QUEUED",
            claimedAt: null,
            leaseExpiresAt: null,
            runId: null,
            lastError: "Lease expired; requeued",
          },
    })
  }
}

async function handleWorkItem(workItemId: string, opts: { leaseMs: number }) {
  const item = await prisma.workItem.findUnique({ where: { id: workItemId } })
  if (!item) return
  if (item.status !== "CLAIMED") return

  const payload = safeJsonParse<any>(item.payload, {})
  const roomId: string | null = (payload.roomId ?? item.roomId ?? null) as any
  const agentId: string | null = (payload.agentId ?? item.agentId ?? null) as any
  const prompt: string | null = (payload.prompt ?? null) as any
  const userId: string | null = (payload.userId ?? null) as any

  if (!roomId || !agentId || !prompt || typeof prompt !== "string") {
    await prisma.workItem.update({
      where: { id: item.id },
      data: {
        status: "FAILED",
        leaseExpiresAt: null,
        lastError: "Invalid payload (requires roomId, agentId, prompt)",
      },
    })
    return
  }

  const runId = item.runId || newRunId(item.id)
  const chainId = await ensureChainId({ id: item.id, chainId: item.chainId })
  await prisma.workItem.updateMany({
    where: { id: item.id, status: "CLAIMED" },
    data: {
      status: "RUNNING",
      runId,
      chainId,
      // Extend the lease for the duration of execution; it can be bumped again on each tick.
      leaseExpiresAt: new Date(Date.now() + opts.leaseMs),
    },
  })

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
      await prisma.workItem.update({
        where: { id: item.id },
        data: {
          status: "FAILED",
          leaseExpiresAt: null,
          lastError: truncate(res.error || "invokeAgent failed", 4000),
        },
      })
      return
    }

    await prisma.workItem.update({
      where: { id: item.id },
      data: {
        status: "SUCCEEDED",
        leaseExpiresAt: null,
        lastError: null,
      },
    })

    // Completion hooks:
    // - task success => enqueue review
    // - review success => parse outcome; if changes needed enqueue rework task
    if (item.type === "task") {
      await scheduleReviewForTask({ ...item, status: "SUCCEEDED", chainId }, payload, prompt).catch(async (e) => {
        const msg = e instanceof Error ? e.message : String(e)
        await prisma.workItem.updateMany({
          where: { id: item.id, status: "SUCCEEDED" },
          data: { lastError: truncate(`review_enqueue_failed: ${msg}`, 4000) },
        })
      })
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
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await prisma.workItem.update({
      where: { id: item.id },
      data: {
        status: "FAILED",
        leaseExpiresAt: null,
        lastError: truncate(msg, 4000),
      },
    })
  }
}

async function tick(opts: { pollMs: number; leaseMs: number }) {
  await requeueExpired({ leaseMs: opts.leaseMs })

  // One-at-a-time for now (single instance). Increase concurrency later if needed.
  const claimed = await claimNext({ leaseMs: opts.leaseMs })
  if (!claimed) return

  if (claimed.attempts > claimed.maxAttempts) {
    await prisma.workItem.update({
      where: { id: claimed.id },
      data: { status: "FAILED", leaseExpiresAt: null, lastError: "Max attempts exceeded" },
    })
    return
  }

  await handleWorkItem(claimed.id, { leaseMs: opts.leaseMs })
}

async function main() {
  const pollMs = Math.max(250, envInt("OZ_ORCH_POLL_MS", 2000))
  const leaseMs = Math.max(10_000, envInt("OZ_ORCH_LEASE_MS", 10 * 60_000))

  // eslint-disable-next-line no-console
  console.log("[orchestrator] starting", { pollMs, leaseMs })

  // Simple polling loop.
  // Note: Next.js request handlers are not a safe place for this; run this script separately.
  for (;;) {
    await tick({ pollMs, leaseMs }).catch((e) => {
      // eslint-disable-next-line no-console
      console.error("[orchestrator] tick failed", e)
    })
    await new Promise((r) => setTimeout(r, pollMs))
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[orchestrator] fatal", e)
  process.exit(1)
})
