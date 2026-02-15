import crypto from "node:crypto"

import { prisma } from "../lib/prisma"
import { invokeAgent } from "../lib/invoke-agent"

type WorkStatus = "QUEUED" | "CLAIMED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED"

function envInt(key: string, fallback: number): number {
  const raw = (process.env[key] || "").trim()
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
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
  await prisma.workItem.updateMany({
    where: { id: item.id, status: "CLAIMED" },
    data: {
      status: "RUNNING",
      runId,
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
