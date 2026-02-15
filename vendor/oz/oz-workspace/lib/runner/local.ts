import { prisma } from "@/lib/prisma"
import { runOpenAICompatibleChat } from "@/lib/runner/openai_compatible"
import { runAnthropicMessages } from "@/lib/runner/providers/anthropic"
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

export async function runLocalAgent(opts: {
  taskId: string
  roomId: string
  agentId: string
  userId: string | null
  prompt: string
}): Promise<void> {
  const agent = await prisma.agent.findUnique({
    where: { id: opts.agentId },
    select: { id: true, name: true, harness: true, systemPrompt: true },
  })
  if (!agent) throw new Error("Agent not found")

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

  // If we're completely saturated and queueing is enabled, mark QUEUED while waiting.
  while (response === null) {
    let attemptedAny = false
    for (const candidate of candidates) {
      if (await providerSaturated(candidate)) continue
      attemptedAny = true

      await prisma.agentRun.updateMany({
        where: { id: opts.taskId },
        data: {
          providerKey: candidate.providerKey,
          providerType: candidate.type,
          model: candidate.model,
          state: "INPROGRESS",
          startedAt: new Date(),
        },
      })

      try {
        await recordProviderCallStart(candidate)

        if (candidate.type === "anthropic") {
          if (!candidate.apiKey) throw new Error("Missing API key for Anthropic provider (set OZ_PROVIDER_CLAUDE_API_KEY or OZ_PROVIDER_API_KEY)")
          response = await runAnthropicMessages({
            apiKey: candidate.apiKey,
            model: candidate.model,
            system,
            messages: [{ role: "user", content: opts.prompt }],
            temperature: 0.2,
            maxTokens: 2048,
            baseUrl: candidate.baseUrl,
          })
        } else if (candidate.type === "cli") {
          response = await runCliProvider({
            providerKey: candidate.providerKey,
            prompt: `${system}\n\n${opts.prompt}`,
            model: candidate.model,
          })
        } else {
          if (!candidate.baseUrl) throw new Error(`Missing provider base URL for ${candidate.providerKey}`)
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
      where: { id: opts.taskId },
      data: { state: "QUEUED" },
    })
    await sleep(waitMs)
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
    where: { id: opts.taskId },
    data: { state: "SUCCEEDED", completedAt: new Date(), errorMessage: null },
  })
}
