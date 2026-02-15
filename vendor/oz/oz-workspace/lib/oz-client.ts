import OzAPI from "oz-agent-sdk"
import type { ArtifactItem, RunItem } from "oz-agent-sdk/resources/agent/runs"
import { prisma } from "@/lib/prisma"
import { runLocalAgent } from "@/lib/runner/local"

// Re-export SDK types so consumers don't need to import from the SDK directly.
export type { ArtifactItem }

export type RunnerMode = "local" | "remote"

function getRunnerMode(): RunnerMode {
  const raw = (process.env.OZ_RUNNER_MODE || "local").toLowerCase()
  return raw === "remote" ? "remote" : "local"
}

async function getApiKey(userId?: string | null): Promise<string> {
  let apiKey: string | undefined
  if (userId) {
    const [oz, warp] = await Promise.all([
      prisma.setting.findUnique({ where: { userId_key: { userId, key: "oz_api_key" } } }),
      prisma.setting.findUnique({ where: { userId_key: { userId, key: "warp_api_key" } } }),
    ])
    apiKey = oz?.value ?? warp?.value
  }
  apiKey = apiKey || process.env.OZ_API_KEY || process.env.WARP_API_KEY
  if (!apiKey) {
    throw new Error("API key is not configured. Set OZ_API_KEY (preferred) or WARP_API_KEY (deprecated), or store it in Settings.")
  }
  return apiKey
}

function getOzClient(apiKey: string): OzAPI {
  // Prefer OZ_API_BASE_URL (must include /api/v1). Support legacy WARP_API_URL as a root.
  const baseURL = process.env.OZ_API_BASE_URL
    ? process.env.OZ_API_BASE_URL.replace(/\/+$/, "")
    : process.env.WARP_API_URL
      ? `${process.env.WARP_API_URL.replace(/\/+$/, "")}/api/v1`
      : undefined

  return new OzAPI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    maxRetries: 3,
  })
}

interface RunAgentOptions {
  prompt: string
  environmentId?: string
  userId?: string | null
  /**
   * Stable id for this invocation. In the Warp/Oz workflow, this is the value that is used as
   * `task_id` when the agent posts back to `/api/agent-response`.
   */
  taskId?: string
  roomId?: string
  agentId?: string
}

export interface TaskStatus {
  taskId: string
  state: "pending" | "running" | "completed" | "failed"
  title?: string
  sessionLink?: string
  statusMessage?: string
  conversationId?: string
  artifacts?: ArtifactItem[]
}

function mapRunState(state: RunItem["state"]): TaskStatus["state"] {
  switch (state) {
    case "INPROGRESS":
    case "CLAIMED":
      return "running"
    case "PENDING":
    case "QUEUED":
      return "pending"
    case "SUCCEEDED":
      return "completed"
    case "FAILED":
    case "CANCELLED":
      return "failed"
    default:
      return "pending"
  }
}

function mapRunItemToTaskStatus(data: RunItem): TaskStatus {
  return {
    taskId: data.run_id || data.task_id,
    state: mapRunState(data.state),
    title: data.title,
    sessionLink: data.session_link,
    statusMessage: data.status_message?.message,
    conversationId: data.conversation_id,
    artifacts: data.artifacts,
  }
}

export async function runAgent(options: RunAgentOptions): Promise<string> {
  const mode = getRunnerMode()

  // Local mode: run in-process and persist the response immediately.
  if (mode === "local") {
    if (!options.taskId || !options.roomId || !options.agentId) {
      throw new Error("Local runner requires taskId, roomId, and agentId")
    }
    await runLocalAgent({
      taskId: options.taskId,
      roomId: options.roomId,
      agentId: options.agentId,
      userId: options.userId ?? null,
      prompt: options.prompt,
    })
    return options.taskId
  }

  // Remote mode: dispatch to the Oz Agent API.
  const apiKey = await getApiKey(options.userId)
  const client = getOzClient(apiKey)

  const config: OzAPI.AmbientAgentConfig = {}
  if (options.environmentId) config.environment_id = options.environmentId

  const response = await client.agent.run({
    prompt: options.prompt,
    ...(Object.keys(config).length > 0 ? { config } : {}),
  })

  return response.run_id || response.task_id
}

export async function getTaskStatus(taskId: string, userId?: string | null): Promise<TaskStatus> {
  const mode = getRunnerMode()

  if (mode === "local") {
    // Local runner is synchronous from the perspective of callers; by the time a taskId exists,
    // the message has been persisted.
    return { taskId, state: "completed" }
  }

  const apiKey = await getApiKey(userId)
  const client = getOzClient(apiKey)
  const data = await client.agent.runs.retrieve(taskId)
  return mapRunItemToTaskStatus(data)
}

export async function pollForCompletion(
  taskId: string,
  options: { maxAttempts?: number; intervalMs?: number; userId?: string | null } = {}
): Promise<TaskStatus> {
  const mode = getRunnerMode()
  if (mode === "local") return { taskId, state: "completed" }

  const { maxAttempts = 60, intervalMs = 10000, userId } = options

  // Resolve API key and client once for the entire polling loop.
  const apiKey = await getApiKey(userId)
  const client = getOzClient(apiKey)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const data = await client.agent.runs.retrieve(taskId)
    const status = mapRunItemToTaskStatus(data)

    if (status.state === "completed" || status.state === "failed") {
      return status
    }

    // Add jitter (±20%) to prevent synchronized polling across concurrent agents
    const jitter = intervalMs * (0.8 + Math.random() * 0.4)
    await new Promise((resolve) => setTimeout(resolve, jitter))
  }

  throw new Error(`Task ${taskId} did not complete within timeout`)
}

