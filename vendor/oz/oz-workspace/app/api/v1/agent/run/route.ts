import { NextResponse, after } from "next/server"
import { requireOzApiAuth } from "@/lib/oz-api-auth"
import { harnessFromAgentRunRequest, ensureOzApiAgent, ensureOzApiRoom } from "@/lib/oz-api-model"
import { prisma } from "@/lib/prisma"
import { runLocalAgent } from "@/lib/runner/local"
import crypto from "node:crypto"

export const maxDuration = 300

export async function POST(request: Request) {
  const auth = requireOzApiAuth(request)
  if (auth) return auth

  const body = await request.json().catch(() => null)
  const prompt = body?.prompt
  if (typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 })
  }

  const harness = harnessFromAgentRunRequest(body)
  const roomId = await ensureOzApiRoom()
  const agentId = await ensureOzApiAgent(harness)

  const runId = `run_${crypto.randomUUID()}`
  const now = new Date()

  await prisma.agentRun.create({
    data: {
      id: runId,
      roomId,
      agentId,
      userId: null,
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
      await runLocalAgent({ taskId: runId, roomId, agentId, userId: null, prompt })
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

