import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOzApiAuth } from "@/lib/oz-api-auth"
import { harnessFromAgentRunRequest, ensureOzApiAgentForUser, ensureOzApiRoomForUser } from "@/lib/oz-api-model"
import { runLocalAgent } from "@/lib/runner/local"
import { after } from "next/server"
import crypto from "node:crypto"

export async function GET(request: Request) {
  const auth = await requireOzApiAuth(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "50"), 1), 200)
  const cursor = (url.searchParams.get("cursor") || "").trim()

  const whereBase = auth.ctx.isAdmin ? undefined : { userId: auth.ctx.userId }
  let where: any = whereBase
  if (cursor) {
    const cursorRun = await prisma.agentRun.findUnique({ where: { id: cursor } })
    if (cursorRun && (auth.ctx.isAdmin || cursorRun.userId === auth.ctx.userId)) {
      where = {
        AND: [
          whereBase ?? {},
          {
            OR: [
              { queuedAt: { lt: cursorRun.queuedAt } },
              { AND: [{ queuedAt: cursorRun.queuedAt }, { id: { lt: cursorRun.id } }] },
            ],
          },
        ],
      }
    }
  }

  const runs = await prisma.agentRun.findMany({
    where,
    orderBy: [{ queuedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  })
  const hasMore = runs.length > limit
  const page = hasMore ? runs.slice(0, limit) : runs
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null

  return NextResponse.json({
    items: page.map((run) => ({
      created_at: run.queuedAt.toISOString(),
      updated_at: run.updatedAt.toISOString(),
      prompt: run.prompt,
      run_id: run.id,
      task_id: run.id,
      title: run.title || "Run",
      state: run.state,
      session_link: null,
      artifacts: [],
      conversation_id: null,
      agent_config: {
        model_id: run.model,
        name: run.title || undefined,
        environment_id: null,
      },
      source: "LOCAL",
    })),
    next_cursor: nextCursor,
  })
}

// SDK compatibility: accept POST /api/v1/agent/runs in addition to /api/v1/agent/run.
export async function POST(request: Request) {
  const auth = await requireOzApiAuth(request)
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  const prompt = body?.prompt
  if (typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 })
  }

  const harness = harnessFromAgentRunRequest(body)
  const roomId = await ensureOzApiRoomForUser(auth.ctx.userId)
  const agentId = await ensureOzApiAgentForUser(harness, auth.ctx.userId)

  const runId = `run_${crypto.randomUUID()}`
  const now = new Date()

  await prisma.agentRun.create({
    data: {
      id: runId,
      roomId,
      agentId,
      userId: auth.ctx.userId,
      title: body?.config?.name || "API run",
      prompt,
      harness,
      providerKey: "pending",
      providerType: "pending",
      model: body?.config?.model_id || process.env.OZ_MODEL || process.env.OZ_PROVIDER_MODEL || "pending",
      remoteRunId: null,
      state: "QUEUED",
      queuedAt: now,
      startedAt: null,
      completedAt: null,
      errorMessage: null,
    },
  })

  after(async () => {
    try {
      await runLocalAgent({ taskId: runId, roomId, agentId, userId: auth.ctx.userId, prompt })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.agentRun.updateMany({
        where: { id: runId, state: { notIn: ["SUCCEEDED", "FAILED", "CANCELLED"] } },
        data: { state: "FAILED", errorMessage: msg, completedAt: new Date() },
      })
    }
  })

  return NextResponse.json({ run_id: runId, task_id: runId })
}
