import { prisma } from "@/lib/prisma"
import { runOpenAICompatibleChat } from "@/lib/runner/openai_compatible"

function providerKeyFromHarness(harness: string): string {
  switch (harness) {
    case "codex":
      return "codex"
    case "claude-code":
      return "claude"
    case "gemini-cli":
      return "gemini"
    case "glm":
      return "glm"
    case "kimi":
      return "kimi"
    case "custom":
      return "custom"
    case "oz":
    default:
      return (process.env.OZ_DEFAULT_PROVIDER || "custom").toLowerCase()
  }
}

function env(key: string): string | undefined {
  const v = process.env[key]
  if (!v) return undefined
  return v
}

function providerEnvName(providerKey: string, suffix: string): string {
  return `OZ_PROVIDER_${providerKey.toUpperCase()}_${suffix}`
}

function getProviderConfig(providerKey: string): { baseUrl: string; apiKey?: string; model: string } {
  const baseUrl =
    env(providerEnvName(providerKey, "BASE_URL")) ||
    env("OZ_PROVIDER_BASE_URL") ||
    env("OZ_API_BASE_URL") // convenience for single-provider setups
  const apiKey =
    env(providerEnvName(providerKey, "API_KEY")) ||
    env("OZ_PROVIDER_API_KEY") ||
    env("OZ_API_KEY")
  const model =
    env(providerEnvName(providerKey, "MODEL")) ||
    env("OZ_PROVIDER_MODEL") ||
    env("OZ_MODEL")

  if (!baseUrl) throw new Error(`Missing provider base URL. Set ${providerEnvName(providerKey, "BASE_URL")} (or OZ_PROVIDER_BASE_URL).`)
  if (!model) throw new Error(`Missing provider model. Set ${providerEnvName(providerKey, "MODEL")} (or OZ_PROVIDER_MODEL/OZ_MODEL).`)

  return { baseUrl, apiKey, model }
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

  const providerKey = providerKeyFromHarness(agent.harness)
  const cfg = getProviderConfig(providerKey)

  const response = await runOpenAICompatibleChat({
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    model: cfg.model,
    messages: [
      {
        role: "system",
        content:
          agent.systemPrompt?.trim() ||
          `You are an AI agent named ${agent.name}. Respond helpfully and concisely. The chat UI supports Markdown.`,
      },
      { role: "user", content: opts.prompt },
    ],
    temperature: 0.2,
  })

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
}

