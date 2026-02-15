import { prisma } from "@/lib/prisma"

function inferHarness(modelId?: string | null): string {
  const m = (modelId || "").toLowerCase()
  if (m.includes("claude")) return "claude-code"
  if (m.includes("codex")) return "codex"
  if (m.includes("glm")) return "glm"
  if (m.includes("kimi")) return "kimi"
  if (m.includes("gemini")) return "gemini-cli"
  return (process.env.OZ_OZAPI_DEFAULT_HARNESS || "custom").toLowerCase()
}

export async function ensureOzApiRoom(): Promise<string> {
  const id = "ozapi_room"
  await prisma.room.upsert({
    where: { id },
    create: { id, name: "Oz API", description: "Runs created via /api/v1/agent/run", userId: null },
    update: {},
  })
  return id
}

export async function ensureOzApiAgent(harness: string): Promise<string> {
  const roomId = await ensureOzApiRoom()
  const key = harness.toLowerCase().replace(/[^a-z0-9]+/g, "_")
  const id = `ozapi_agent_${key}`
  const name = `ozapi-${key}`

  await prisma.agent.upsert({
    where: { id },
    create: {
      id,
      name,
      color: "#64748B",
      icon: "robot",
      repoUrl: "",
      harness,
      environmentId: "",
      systemPrompt: `You are an API-run agent (harness=${harness}). Reply in Markdown.`,
      skills: "[]",
      mcpServers: "[]",
      scripts: "[]",
      status: "idle",
      userId: null,
    },
    update: { harness },
  })

  await prisma.roomAgent.upsert({
    where: { roomId_agentId: { roomId, agentId: id } },
    create: { roomId, agentId: id },
    update: {},
  })

  return id
}

export function harnessFromAgentRunRequest(body: any): string {
  return inferHarness(body?.config?.model_id ?? null)
}

