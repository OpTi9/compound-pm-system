/**
 * In-process smoke test for the same codepath used by the workspace UI:
 * DB seed -> invokeAgent() -> local runner -> AgentRun + Message persistence.
 *
 * Prereqs:
 * - Prisma migrations applied for oz-workspace DB
 * - .env.local (or env) contains provider config for at least one harness
 *
 * Usage:
 *   npx tsx scripts/smoke-ui-path.ts
 *
 * Optional env:
 * - OZ_SMOKE_HARNESS=glm|kimi|custom|claude-code|codex|gemini-cli
 * - OZ_SMOKE_PROMPT="..."
 */

import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"

import { prisma } from "@/lib/prisma"
import { invokeAgent } from "@/lib/invoke-agent"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

dotenv.config({ path: path.resolve(__dirname, "../.env") })
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true })

function env(key: string): string | undefined {
  const v = process.env[key]
  return v && v.trim() ? v.trim() : undefined
}

function pickHarness(): string {
  const explicit = env("OZ_SMOKE_HARNESS")
  if (explicit) return explicit

  const hasOpenAICompat = (key: string) => !!env(`OZ_PROVIDER_${key}_BASE_URL`) && !!env(`OZ_PROVIDER_${key}_MODEL`)
  const hasAnthropic = () => !!env("OZ_PROVIDER_CLAUDE_MODEL") && (!!env("OZ_PROVIDER_CLAUDE_API_KEY") || !!env("OZ_PROVIDER_API_KEY"))

  if (hasOpenAICompat("GLM")) return "glm"
  if (hasOpenAICompat("KIMI")) return "kimi"
  if (hasOpenAICompat("CUSTOM")) return "custom"
  if (hasAnthropic()) return "claude-code"
  if (hasOpenAICompat("CODEX")) return "codex"
  if (hasOpenAICompat("GEMINI")) return "gemini-cli"

  throw new Error(
    "No OZ_SMOKE_HARNESS provided and no obvious provider config found. Set OZ_SMOKE_HARNESS and the matching OZ_PROVIDER_* env vars."
  )
}

async function main() {
  // Force local runner for this smoke test.
  process.env.OZ_RUNNER_MODE = "local"

  const harness = pickHarness()
  const prompt =
    env("OZ_SMOKE_PROMPT") ||
    "Write a 5-bullet plan for adding a /health endpoint to an Express app."

  const now = Date.now()
  const email = `smoke_${now}@local.test`

  const user = await prisma.user.create({
    data: {
      name: "Smoke User",
      email,
      passwordHash: "smoke",
    },
  })

  const room = await prisma.room.create({
    data: {
      name: `Smoke Room ${now}`,
      description: "Smoke test room (in-process).",
      userId: user.id,
    },
  })

  const agent = await prisma.agent.create({
    data: {
      name: `Smoke Agent ${now}`,
      harness,
      systemPrompt: "You are a helpful assistant. Keep responses concise.",
      userId: user.id,
    },
  })

  await prisma.roomAgent.create({
    data: {
      roomId: room.id,
      agentId: agent.id,
    },
  })

  const result = await invokeAgent({
    roomId: room.id,
    agentId: agent.id,
    prompt,
    depth: 0,
    userId: user.id,
  })

  const run = await prisma.agentRun.findUnique({ where: { id: result.message?.id || "" } })
  const msg = result.message?.id ? await prisma.message.findUnique({ where: { id: result.message.id } }) : null

  console.log("harness:", harness)
  console.log("roomId:", room.id)
  console.log("agentId:", agent.id)
  console.log("invocationId:", result.message?.id)
  console.log("success:", result.success)
  console.log("agentRunState:", run?.state)
  console.log("messagePersisted:", !!msg)
  console.log("messagePreview:", (msg?.content || "").slice(0, 200))

  if (!result.success) {
    throw new Error(result.error || "invokeAgent returned success=false")
  }
  if (!run) throw new Error("AgentRun not found (expected id=invocationId)")
  if (run.state !== "SUCCEEDED") throw new Error(`AgentRun state expected SUCCEEDED, got ${run.state}`)
  if (!msg) throw new Error("Message not persisted (expected Message.id=invocationId)")
}

main()
  .then(() => {
    console.log("OK")
    process.exit(0)
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })

