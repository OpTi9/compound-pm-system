import { prisma } from "../prisma.js"
import { isRateLimitError, RateLimitError } from "./errors.js"
import {
  earliestResetForCandidates,
  getProviderCandidatesForHarness,
  handleProviderError,
  providerSaturated,
  queueEnabled,
  queueMaxWaitSeconds,
  recordProviderCallStart,
} from "./router.js"
import { runOpenAICompatibleChat, runOpenAICompatibleChatStream } from "./openai_compatible.js"
import { runAnthropicMessages, runAnthropicMessagesStream } from "./providers/anthropic.js"
import { runCliProvider } from "./providers/cli.js"

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function streamingEnabled(): boolean {
  const raw = (process.env.OZ_CONTROL_PLANE_STREAMING || "1").toLowerCase()
  return raw !== "0" && raw !== "false" && raw !== "off"
}

export async function runLocalAgent(opts: {
  runId: string
  prompt: string
  harness: string
}): Promise<void> {
  const existing = await prisma.agentRun.findUnique({ where: { id: opts.runId }, select: { state: true } })
  if (!existing) throw new Error("Run not found")
  if (existing.state === "CANCELLED") return

  await prisma.agentRun.updateMany({
    where: { id: opts.runId, state: { in: ["QUEUED"] } },
    data: { state: "INPROGRESS", startedAt: new Date() },
  })

  const system = `You are an AI agent. Respond helpfully and concisely. The chat UI supports Markdown.`
  const candidates = await getProviderCandidatesForHarness(opts.harness)

  let response: string | null = null
  let lastErr: unknown = null

  // Streaming persistence (throttled).
  let streamed = ""
  let lastFlushAt = 0
  const flushEveryMs = 250
  const flush = async (force = false) => {
    const now = Date.now()
    if (!force && now - lastFlushAt < flushEveryMs) return
    lastFlushAt = now

    const runState = await prisma.agentRun.findUnique({ where: { id: opts.runId }, select: { state: true } })
    if (runState?.state === "CANCELLED") return
    await prisma.agentRun.update({
      where: { id: opts.runId },
      data: { output: streamed },
    })
  }

  while (response === null) {
    const runState = await prisma.agentRun.findUnique({ where: { id: opts.runId }, select: { state: true } })
    if (runState?.state === "CANCELLED") return

    for (const candidate of candidates) {
      if (await providerSaturated(candidate)) continue

      await prisma.agentRun.updateMany({
        where: { id: opts.runId, state: { notIn: ["CANCELLED"] } },
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

        await recordProviderCallStart(candidate)
        break
      } catch (err) {
        lastErr = err
        await handleProviderError(candidate, err)
        if (isRateLimitError(err)) continue
        throw err
      }
    }

    if (response !== null) break

    if (!queueEnabled()) {
      const msg = lastErr instanceof Error ? lastErr.message : "All providers saturated"
      await prisma.agentRun.updateMany({
        where: { id: opts.runId },
        data: { state: "FAILED", errorMessage: msg, completedAt: new Date() },
      })
      throw new RateLimitError(msg)
    }

    const resetMs = await earliestResetForCandidates(candidates)
    const maxWaitMs = queueMaxWaitSeconds() * 1000
    const waitMs = Math.min((resetMs ?? 5000) + 250, maxWaitMs)

    await prisma.agentRun.updateMany({
      where: { id: opts.runId, state: { notIn: ["CANCELLED"] } },
      data: { state: "QUEUED" },
    })
    await sleep(waitMs)
  }

  const finalState = await prisma.agentRun.findUnique({ where: { id: opts.runId }, select: { state: true } })
  if (finalState?.state === "CANCELLED") return

  if (streamed) await flush(true).catch(() => {})
  const output = (response ?? streamed).trim()

  await prisma.agentRun.updateMany({
    where: { id: opts.runId, state: { notIn: ["CANCELLED"] } },
    data: { state: "SUCCEEDED", completedAt: new Date(), errorMessage: null, output },
  })
}
