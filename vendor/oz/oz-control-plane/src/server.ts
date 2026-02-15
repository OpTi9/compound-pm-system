import http from "node:http"
import crypto from "node:crypto"
import { URL } from "node:url"

import { prisma } from "./prisma.js"
import { requireAuth } from "./auth.js"
import { harnessFromModelId, json } from "./oz-api-shapes.js"
import { runLocalAgent } from "./runner/local.js"
import { attachWorkerWebSocket } from "./worker-ws.js"

function readJson(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = ""
    req.on("data", (chunk) => (body += chunk))
    req.on("end", () => {
      if (!body.trim()) return resolve(null)
      try {
        resolve(JSON.parse(body))
      } catch (e) {
        reject(e)
      }
    })
  })
}

function pathMatch(pathname: string, pattern: RegExp): RegExpExecArray | null {
  const m = pattern.exec(pathname)
  return m && m[0] === pathname ? m : null
}

async function main() {
  const port = Number(process.env.OZ_CONTROL_PLANE_PORT || "8080")

  const server = http.createServer(async (req, res) => {
    try {
      const method = req.method || "GET"
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
      const pathname = url.pathname

      if (pathname === "/health") return json(res, 200, { ok: true })

      if (!pathname.startsWith("/api/v1/")) return json(res, 404, { error: "Not found" })

      const auth = requireAuth({ headers: req.headers as any })
      if (!auth.ok) return json(res, auth.status, auth.body)

      // Minimal stub.
      if (method === "GET" && pathname === "/api/v1/agent") {
        return json(res, 200, { items: [] })
      }

      if (method === "POST" && pathname === "/api/v1/agent/run") {
        const body = await readJson(req).catch(() => null)
        const prompt = body?.prompt
        if (typeof prompt !== "string" || !prompt.trim()) return json(res, 400, { error: "prompt is required" })

        const modelId = body?.config?.model_id ?? null
        const environmentId = typeof body?.config?.environment_id === "string" ? body.config.environment_id.trim() : ""
        const harness = harnessFromModelId(modelId)
        const runId = `run_${crypto.randomUUID()}`
        const now = new Date()

        await prisma.agentRun.create({
          data: {
            id: runId,
            ownerKeyHash: auth.isAdmin
              ? crypto.createHash("sha256").update(auth.token).digest("hex")
              : auth.ownerKeyHash,
            title: body?.config?.name || "API run",
            prompt,
            environmentId: environmentId || null,
            workerId: null,
            harness,
            providerKey: "pending",
            providerType: "pending",
            model: modelId || process.env.OZ_MODEL || process.env.OZ_PROVIDER_MODEL || "pending",
            remoteRunId: null,
            state: environmentId ? "PENDING" : "QUEUED",
            queuedAt: now,
            startedAt: null,
            completedAt: null,
            errorMessage: null,
            output: "",
          },
        })

        if (!environmentId) {
          // Fire-and-forget execution (local mode).
          setImmediate(async () => {
            try {
              await runLocalAgent({ runId, prompt, harness })
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              await prisma.agentRun.updateMany({
                where: { id: runId, state: { notIn: ["SUCCEEDED", "FAILED", "CANCELLED"] } },
                data: { state: "FAILED", errorMessage: msg, completedAt: new Date() },
              })
            }
          })
        }

        return json(res, 200, { run_id: runId, task_id: runId })
      }

      const runsRoute = pathMatch(pathname, /^\/api\/v1\/agent\/runs\/?$/)
      if (method === "GET" && runsRoute) {
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "50"), 1), 200)
        const where = auth.isAdmin ? {} : { ownerKeyHash: auth.ownerKeyHash }
        const runs = await prisma.agentRun.findMany({ where, orderBy: { queuedAt: "desc" }, take: limit })
        return json(res, 200, {
          items: runs.map((run) => ({
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
              environment_id: run.environmentId || null,
            },
            source: "LOCAL",
            status_message: run.output
              ? { message: run.output }
              : run.errorMessage
                ? { message: run.errorMessage }
                : null,
          })),
          next_cursor: null,
        })
      }

      const runGet = pathMatch(pathname, /^\/api\/v1\/agent\/runs\/([^/]+)\/?$/)
      if (method === "GET" && runGet) {
        const runID = runGet[1]
        const run = await prisma.agentRun.findUnique({ where: { id: runID } })
        if (!run) return json(res, 404, { error: "Not found" })
        if (!auth.isAdmin && run.ownerKeyHash !== auth.ownerKeyHash) return json(res, 404, { error: "Not found" })

        return json(res, 200, {
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
            environment_id: run.environmentId || null,
          },
          source: "LOCAL",
          status_message: run.output
            ? { message: run.output }
            : run.errorMessage
              ? { message: run.errorMessage }
              : null,
        })
      }

      const runCancel = pathMatch(pathname, /^\/api\/v1\/agent\/runs\/([^/]+)\/cancel\/?$/)
      if (method === "POST" && runCancel) {
        const runID = runCancel[1]
        const run = await prisma.agentRun.findUnique({ where: { id: runID } })
        if (!run) return json(res, 404, { error: "Not found" })
        if (!auth.isAdmin && run.ownerKeyHash !== auth.ownerKeyHash) return json(res, 404, { error: "Not found" })

        await prisma.agentRun.update({
          where: { id: runID },
          data: {
            state: "CANCELLED",
            completedAt: new Date(),
            errorMessage: run.errorMessage || "Cancelled",
          },
        })
        return json(res, 200, "cancelled")
      }

      return json(res, 404, { error: "Not found" })
    } catch (err) {
      console.error("[oz-control-plane] request error:", err)
      return json(res, 500, { error: err instanceof Error ? err.message : "Internal error" })
    }
  })

  server.listen(port, () => {
    console.log(`[oz-control-plane] listening on http://localhost:${port}`)
  })

  attachWorkerWebSocket(server)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
