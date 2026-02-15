import type http from "node:http"
import { WebSocketServer } from "ws"
import { URL } from "node:url"
import crypto from "node:crypto"

import { prisma } from "./prisma.js"
import { requireAuth } from "./auth.js"
import { log } from "./log.js"

const connectedWorkers = new Map<string, any>()

export function sendCancelToWorker(workerId: string, taskId: string): boolean {
  const ws = connectedWorkers.get(workerId)
  if (!ws) return false
  try {
    ws.send(JSON.stringify({ type: "task_cancel", data: { task_id: taskId } }))
    return true
  } catch {
    return false
  }
}

export type WorkerWsAttachment = {
  close: () => Promise<void>
}

type WorkerMessage =
  | { type: "task_claimed"; data: { task_id: string; worker_id: string } }
  | { type: "task_failed"; data: { task_id: string; message: string; output?: string; artifacts?: any; session_link?: string } }
  | {
      type: "task_completed"
      data: { task_id: string; worker_id: string; output: string; exit_code: number; artifacts?: any; session_link?: string }
    }

function safeJsonParse(input: string): any | null {
  try { return JSON.parse(input) } catch { return null }
}

function linesFromText(text: string | null | undefined): string[] {
  return (text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function attachWorkerWebSocket(server: http.Server) {
  const wss = new WebSocketServer({ noServer: true })

  const upgradeHandler = (req: any, socket: any, head: any) => {
    const u = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
    if (u.pathname !== "/api/v1/selfhosted/worker/ws") return

    const auth = requireAuth({ headers: req.headers as any })
    if (!auth.ok) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
      socket.destroy()
      return
    }
    // Worker connections must use the admin key.
    if (!auth.isAdmin) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n")
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req)
    })
  }

  server.on("upgrade", upgradeHandler)

  wss.on("connection", (ws, req) => {
    const u = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
    const workerId = (u.searchParams.get("worker_id") || "").trim() || `worker_${crypto.randomUUID()}`
    const wlog = log.child({ subsystem: "worker-ws", worker_id: workerId })

    wlog.info("worker.connected")

    connectedWorkers.set(workerId, ws)

    let closed = false
    const close = () => {
      if (closed) return
      closed = true
      try { ws.close() } catch { /* ignore */ }
    }

    ws.on("close", () => {
      closed = true
      connectedWorkers.delete(workerId)
      wlog.info("worker.disconnected")

      // Requeue tasks that were claimed but never started; fail in-progress tasks to avoid duplicates.
      prisma.agentRun
        .updateMany({
          where: { workerId, state: "CLAIMED" },
          data: { state: "PENDING", workerId: null, startedAt: null, providerKey: "pending", providerType: "pending" },
        })
        .catch(() => {})
      prisma.agentRun
        .updateMany({
          where: { workerId, state: "INPROGRESS" },
          data: { state: "FAILED", completedAt: new Date(), errorMessage: "Worker disconnected" },
        })
        .catch(() => {})
    })

    ws.on("message", async (buf) => {
      const raw = typeof buf === "string" ? buf : buf.toString("utf8")
      const parsed = safeJsonParse(raw) as WorkerMessage | null
      if (!parsed || typeof (parsed as any).type !== "string") return

      try {
        if (parsed.type === "task_claimed") {
          const taskId = parsed.data?.task_id
          if (!taskId) return
          wlog.info("task.claimed", { task_id: taskId })
          // Only advance tasks this worker actually owns. This prevents one worker from
          // accidentally or maliciously "claiming" tasks assigned to a different worker.
          await prisma.agentRun.updateMany({
            where: { id: taskId, workerId, state: "CLAIMED" },
            data: { state: "INPROGRESS", startedAt: new Date() },
          })
        } else if (parsed.type === "task_failed") {
          const taskId = parsed.data?.task_id
          const msg = parsed.data?.message || "Task failed"
          const output = parsed.data?.output
          const artifacts = parsed.data?.artifacts
          const sessionLink = typeof parsed.data?.session_link === "string" ? parsed.data.session_link : null
          if (!taskId) return
          wlog.warn("task.failed", { task_id: taskId, message: msg, output_length: (output || "").length })
          await prisma.agentRun.updateMany({
            where: { id: taskId, workerId, state: { notIn: ["SUCCEEDED", "FAILED", "CANCELLED"] } },
            data: {
              state: "FAILED",
              errorMessage: msg,
              output: output || "",
              artifactsJson: artifacts ? JSON.stringify(artifacts) : undefined,
              sessionLink: sessionLink || undefined,
              completedAt: new Date(),
            },
          })
        } else if (parsed.type === "task_completed") {
          const taskId = parsed.data?.task_id
          const output = parsed.data?.output || ""
          const exitCode = Number(parsed.data?.exit_code ?? 0)
          const artifacts = parsed.data?.artifacts
          const sessionLink = typeof parsed.data?.session_link === "string" ? parsed.data.session_link : null
          if (!taskId) return

          wlog.info("task.completed", { task_id: taskId, exit_code: exitCode, output_length: output.length })
          await prisma.agentRun.updateMany({
            where: { id: taskId, workerId, state: { notIn: ["SUCCEEDED", "FAILED", "CANCELLED"] } },
            data: {
              state: exitCode === 0 ? "SUCCEEDED" : "FAILED",
              output,
              errorMessage: exitCode === 0 ? null : `Worker exit code ${exitCode}`,
              artifactsJson: artifacts ? JSON.stringify(artifacts) : undefined,
              sessionLink: sessionLink || undefined,
              completedAt: new Date(),
            },
          })
        }
      } catch (e) {
        wlog.error("worker.message_handling_error", undefined, e)
      }
    })

    const assignmentLoop = setInterval(async () => {
      if (closed) return

      // Claim one pending run and send it to this worker.
      const claimed = await prisma.agentRun.findFirst({
        where: { state: "PENDING", workerId: null },
        orderBy: { queuedAt: "asc" },
        select: {
          id: true,
          title: true,
          prompt: true,
          environmentId: true,
          model: true,
        },
      })
      if (!claimed) return

      // If no sidecar is configured, don't assign (keeps run pending).
      const sidecarImage = (process.env.OZ_WORKER_SIDECAR_IMAGE || "").trim()
      if (!sidecarImage) return

      let dockerImage = "ubuntu:22.04"
      let envRepos: string[] = []
      let envSetup: string[] = []
      let envVarsLines: string[] = []

      if (claimed.environmentId) {
        const env = await prisma.environment.findUnique({ where: { id: claimed.environmentId } }).catch(() => null)
        if (env) {
          dockerImage = env.dockerImage
          envRepos = linesFromText(env.reposText)
          envSetup = linesFromText(env.setupCommandsText)
          envVarsLines = linesFromText(env.envVarsText)
        } else {
          // Back-compat: environment_id may be a Docker image string.
          dockerImage = claimed.environmentId
        }
      }

      // Atomically claim.
      const updated = await prisma.agentRun.updateMany({
        where: { id: claimed.id, state: "PENDING", workerId: null },
        data: { state: "CLAIMED", workerId, providerKey: "worker", providerType: "worker", startedAt: new Date() },
      })
      if (updated.count !== 1) return

      const msg = {
        type: "task_assignment",
        data: {
          task_id: claimed.id,
          // Extra field: safe to include even if the worker ignores it.
          trace_id: claimed.id,
          task: {
            id: claimed.id,
            title: claimed.title,
            task_definition: { prompt: claimed.prompt },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            agent_config_snapshot: {
              environment_id: claimed.environmentId ?? undefined,
              model_id: claimed.model ?? undefined,
            },
          },
          docker_image: dockerImage,
          sidecar_image: sidecarImage,
          env_vars: {
            OZ_TASK_PROMPT: claimed.prompt,
            ...(envRepos.length ? { OZ_ENV_REPOS: envRepos.join("\n") } : {}),
            ...(envSetup.length ? { OZ_ENV_SETUP_COMMANDS: envSetup.join("\n") } : {}),
            ...(envVarsLines.length ? { OZ_ENV_VARS: envVarsLines.join("\n") } : {}),
          },
        },
      }

      try {
        wlog.info("task.assigned", { task_id: claimed.id, docker_image: dockerImage })
        ws.send(JSON.stringify(msg))
      } catch (e) {
        wlog.error("worker.send_assignment_failed", { task_id: claimed.id }, e)
        close()
      }
    }, 1500)

    const claimTimeoutMs = Math.max(10_000, Number(process.env.OZ_WORKER_CLAIM_TIMEOUT_MS || "120000"))
    const staleClaimLoop = setInterval(async () => {
      if (closed) return
      const cutoff = new Date(Date.now() - claimTimeoutMs)
      await prisma.agentRun.updateMany({
        where: { state: "CLAIMED", startedAt: { lt: cutoff } },
        data: { state: "PENDING", workerId: null, startedAt: null, providerKey: "pending", providerType: "pending" },
      })
    }, 5000)

    ws.on("close", () => {
      clearInterval(assignmentLoop)
      clearInterval(staleClaimLoop)
    })
  })

  return {
    close: async () => {
      try {
        server.off("upgrade", upgradeHandler as any)
      } catch {
        // ignore
      }

      // Close any connected workers (best-effort) so their per-connection timers clear.
      for (const ws of connectedWorkers.values()) {
        try { ws.close(1001, "Server shutting down") } catch { /* ignore */ }
      }
      connectedWorkers.clear()

      await new Promise<void>((resolve) => {
        try {
          wss.close(() => resolve())
        } catch {
          resolve()
        }
      })
    },
  } satisfies WorkerWsAttachment
}
