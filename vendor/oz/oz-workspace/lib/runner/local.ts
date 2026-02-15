import { prisma } from "@/lib/prisma"
import { eventBroadcaster } from "@/lib/event-broadcaster"
import { runOpenAICompatibleChat, runOpenAICompatibleChatStream } from "@/lib/runner/openai_compatible"
import { runAnthropicMessages, runAnthropicMessagesStream } from "@/lib/runner/providers/anthropic"
import { runCliProvider } from "@/lib/runner/providers/cli"
import { RateLimitError, isRateLimitError } from "@/lib/runner/errors"
import {
  earliestResetForCandidates,
  getProviderCandidatesForHarness,
  handleProviderError,
  providerSaturated,
  queueEnabled,
  queueMaxWaitSeconds,
  recordProviderCallStart,
} from "@/lib/runner/router"

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function streamingEnabled(): boolean {
  const raw = (process.env.OZ_LOCAL_STREAMING || "1").toLowerCase()
  return raw !== "0" && raw !== "false" && raw !== "off"
}

export async function runLocalAgent(opts: {
  taskId: string
  roomId: string
  agentId: string
  userId: string | null
  prompt: string
}): Promise<void> {
  const existingRun = await prisma.agentRun.findUnique({
    where: { id: opts.taskId },
    select: { state: true },
  })
  if (existingRun?.state === "CANCELLED") return

  const agent = await prisma.agent.findUnique({
    where: { id: opts.agentId },
    select: { id: true, name: true, harness: true, systemPrompt: true, color: true, icon: true, status: true, activeRoomId: true },
  })
  if (!agent) throw new Error("Agent not found")

  // Create a placeholder message early so the UI can start rendering streamed deltas.
  await prisma.message
    .upsert({
      where: { id: opts.taskId },
      create: {
        id: opts.taskId,
        content: "",
        authorType: "agent",
        sessionUrl: null,
        userId: opts.userId,
        roomId: opts.roomId,
        authorId: opts.agentId,
      },
      update: {},
    })
    .catch(() => {})

  // Update run state -> INPROGRESS.
  await prisma.agentRun.updateMany({
    where: { id: opts.taskId, state: { in: ["QUEUED"] } },
    data: { state: "INPROGRESS", startedAt: new Date() },
  })

  const system =
    agent.systemPrompt?.trim() ||
    `You are an AI agent named ${agent.name}. Respond helpfully and concisely. The chat UI supports Markdown.`

  const candidates = await getProviderCandidatesForHarness(agent.harness)
  let response: string | null = null
  let lastErr: unknown = null

  // Streaming persistence + broadcast (throttled).
  let streamed = ""
  let lastFlushAt = 0
  const flushEveryMs = 250
  const flush = async (force = false) => {
    const now = Date.now()
    if (!force && now - lastFlushAt < flushEveryMs) return
    lastFlushAt = now

    const runState = await prisma.agentRun.findUnique({ where: { id: opts.taskId }, select: { state: true } })
    if (runState?.state === "CANCELLED") return

    const message = await prisma.message.update({
      where: { id: opts.taskId },
      data: { content: streamed },
    })

    eventBroadcaster.broadcast({
      type: "message",
      roomId: opts.roomId,
      data: {
        ...message,
        author: {
          id: agent.id,
          name: agent.name,
          color: agent.color,
          icon: agent.icon,
          status: agent.status,
          activeRoomId: agent.activeRoomId,
        },
      },
    })
  }

  // If we're completely saturated and queueing is enabled, mark QUEUED while waiting.
  while (response === null) {
    const runState = await prisma.agentRun.findUnique({ where: { id: opts.taskId }, select: { state: true } })
    if (runState?.state === "CANCELLED") return

    for (const candidate of candidates) {
      if (await providerSaturated(candidate)) continue

      await prisma.agentRun.updateMany({
        where: { id: opts.taskId, state: { notIn: ["CANCELLED"] } },
        data: {
          providerKey: candidate.providerKey,
          providerType: candidate.type,
          model: candidate.model,
          state: "INPROGRESS",
          startedAt: new Date(),
        },
      })

      try {
        if (candidate.type === "anthropic") {
          if (!candidate.apiKey) throw new Error("Missing API key for Anthropic provider (set OZ_PROVIDER_CLAUDE_API_KEY or OZ_PROVIDER_API_KEY)")
          if (streamingEnabled()) {
            streamed = ""
            response = await runAnthropicMessagesStream({
              apiKey: candidate.apiKey,
              model: candidate.model,
              system,
              messages: [{ role: "user", content: opts.prompt }],
              temperature: 0.2,
              maxTokens: 2048,
              baseUrl: candidate.baseUrl,
              onDelta: (t) => {
                streamed += t
                // Best-effort fire-and-forget; runner still persists final content below.
                flush(false).catch(() => {})
              },
            })
          } else {
            response = await runAnthropicMessages({
              apiKey: candidate.apiKey,
              model: candidate.model,
              system,
              messages: [{ role: "user", content: opts.prompt }],
              temperature: 0.2,
              maxTokens: 2048,
              baseUrl: candidate.baseUrl,
            })
          }
        } else if (candidate.type === "cli") {
          response = await runCliProvider({
            providerKey: candidate.providerKey,
            prompt: `${system}\n\n${opts.prompt}`,
            model: candidate.model,
          })
        } else {
          if (!candidate.baseUrl) throw new Error(`Missing provider base URL for ${candidate.providerKey}`)
          if (streamingEnabled()) {
            streamed = ""
            response = await runOpenAICompatibleChatStream({
              baseUrl: candidate.baseUrl,
              apiKey: candidate.apiKey,
              model: candidate.model,
              messages: [
                { role: "system", content: system },
                { role: "user", content: opts.prompt },
              ],
              temperature: 0.2,
              onDelta: (t) => {
                streamed += t
                flush(false).catch(() => {})
              },
            })
          } else {
            response = await runOpenAICompatibleChat({
              baseUrl: candidate.baseUrl,
              apiKey: candidate.apiKey,
              model: candidate.model,
              messages: [
                { role: "system", content: system },
                { role: "user", content: opts.prompt },
              ],
              temperature: 0.2,
            })
          }
        }

        // Only count usage against quotas once the provider call succeeds.
        await recordProviderCallStart(candidate)
        break
      } catch (err) {
        lastErr = err
        await handleProviderError(candidate, err)

        // On rate limit, try the next provider; otherwise fail fast.
        if (isRateLimitError(err)) continue
        throw err
      }
    }

    if (response !== null) break

    // No candidates available (all saturated) or all attempts rate-limited.
    if (!queueEnabled()) {
      const msg = lastErr instanceof Error ? lastErr.message : "All providers saturated"
      await prisma.agentRun.updateMany({
        where: { id: opts.taskId },
        data: { state: "FAILED", errorMessage: msg, completedAt: new Date() },
      })
      throw new RateLimitError(msg)
    }

    // Queue until earliest reset (bounded).
    const resetMs = await earliestResetForCandidates(candidates)
    const maxWaitMs = queueMaxWaitSeconds() * 1000
    const waitMs = Math.min((resetMs ?? 5000) + 250, maxWaitMs)

    await prisma.agentRun.updateMany({
      where: { id: opts.taskId, state: { notIn: ["CANCELLED"] } },
      data: { state: "QUEUED" },
    })
    await sleep(waitMs)
  }

  const finalState = await prisma.agentRun.findUnique({ where: { id: opts.taskId }, select: { state: true } })
  if (finalState?.state === "CANCELLED") return

  // Ensure any trailing streamed content is persisted/broadcast.
  if (streamed && !response) {
    response = streamed
  }
  if (streamed) {
    // Force one last flush (don’t care if it fails).
    await flush(true).catch(() => {})
  }

  // Persist the agent response as if it came from the callback handler.
  await prisma.message.upsert({
    where: { id: opts.taskId },
    create: {
      id: opts.taskId,
      content: response,
      authorType: "agent",
      sessionUrl: null,
      userId: opts.userId,
      roomId: opts.roomId,
      authorId: opts.agentId,
    },
    update: {
      content: response,
    },
  })

  await prisma.agentRun.updateMany({
    where: { id: opts.taskId, state: { notIn: ["CANCELLED"] } },
    data: { state: "SUCCEEDED", completedAt: new Date(), errorMessage: null },
  })
}
