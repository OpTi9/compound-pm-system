import http from "node:http"
import crypto from "node:crypto"
import { URL } from "node:url"

import { prisma } from "./prisma.js"
import { requireAuth } from "./auth.js"
import { harnessFromModelId, json } from "./oz-api-shapes.js"
import { runLocalAgent } from "./runner/local.js"
import { attachWorkerWebSocket, sendCancelToWorker, type WorkerWsAttachment } from "./worker-ws.js"
import { getProviderCandidatesForHarness } from "./runner/router.js"
import { log, newReqId } from "./log.js"

function envFlag(key: string, fallback = false): boolean {
  const raw = (process.env[key] ?? "").trim().toLowerCase()
  if (!raw) return fallback
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on"
}

function envInt(key: string, fallback: number): number {
  const raw = (process.env[key] ?? "").trim()
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

function validateStartupConfig() {
  const db = (process.env.DATABASE_URL || "").trim()
  if (!db) throw new Error("DATABASE_URL is required")

  const admin = (process.env.OZ_ADMIN_API_KEY || "").trim()
  if (!admin && !envFlag("OZ_ALLOW_NO_ADMIN_KEY", false)) {
    throw new Error("OZ_ADMIN_API_KEY is required (set OZ_ALLOW_NO_ADMIN_KEY=1 to override for dev)")
  }

  if (envFlag("OZ_REQUIRE_WORKER_SIDECAR", false)) {
    const sidecar = (process.env.OZ_WORKER_SIDECAR_IMAGE || "").trim()
    if (!sidecar) throw new Error("OZ_WORKER_SIDECAR_IMAGE is required when OZ_REQUIRE_WORKER_SIDECAR=1")
  }
}

async function checkDb(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // Minimal liveness check.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ = await prisma.$queryRaw`SELECT 1`
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "DB error" }
  }
}

async function validateProvidersOnStartup() {
  if (!envFlag("OZ_STARTUP_VALIDATE_PROVIDERS", false)) return

  const raw = (process.env.OZ_VALIDATE_HARNESSES || "").trim()
  const harnesses = raw
    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
    : [((process.env.OZ_OZAPI_DEFAULT_HARNESS || "custom").trim() || "custom"), "custom"]

  for (const h of harnesses) {
    try {
      const candidates = await getProviderCandidatesForHarness(h)
      log.info("startup.provider_validation_ok", {
        harness: h,
        candidates: candidates.map((c) => c.providerKey),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`Provider validation failed for harness "${h}": ${msg}`)
    }
  }
}

function retentionCutoff(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function startRetentionLoop(): { stop: () => void } {
  const days = envInt("OZ_RUN_RETENTION_DAYS", 30)
  if (days <= 0) return { stop: () => {} }

  const intervalMs = Math.max(60_000, envInt("OZ_RETENTION_SWEEP_INTERVAL_MS", 60 * 60_000))
  const timer = setInterval(async () => {
    try {
      const cutoff = retentionCutoff(days)
      // Only delete completed terminal runs.
      await prisma.agentRun.deleteMany({
        where: {
          completedAt: { not: null, lt: cutoff },
          state: { in: ["SUCCEEDED", "FAILED", "CANCELLED"] },
        },
      })
    } catch (e) {
      log.error("retention.sweep_failed", undefined, e)
    }
  }, intervalMs)

  // Don't keep the process alive solely for retention.
  ;(timer as any).unref?.()

  log.info("retention.enabled", { days, intervalMs })
  return { stop: () => clearInterval(timer) }
}

function toLines(v: any): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string").map((s) => s.trim()).filter(Boolean)
  if (typeof v === "string") return v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  return []
}

function envVarsToLines(v: any): string[] {
  if (!v || typeof v !== "object" || Array.isArray(v)) return []
  const out: string[] = []
  for (const [k, val] of Object.entries(v)) {
    if (typeof k !== "string" || !k.trim()) continue
    if (typeof val !== "string") continue
    out.push(`${k}=${val}`)
  }
  return out
}

function envVarsTextToObject(text: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of (text || "").split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    const idx = t.indexOf("=")
    if (idx <= 0) continue
    const k = t.slice(0, idx).trim()
    const v = t.slice(idx + 1)
    if (!k) continue
    out[k] = v
  }
  return out
}

function redactedEnvVars(text: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  const obj = envVarsTextToObject(text)
  for (const k of Object.keys(obj)) out[k] = "<redacted>"
  return out
}

function canViewEnvVars(auth: any, env: { ownerKeyHash: string | null }): boolean {
  if (auth?.isAdmin) return true
  // Global environments (ownerKeyHash=null) should not expose secrets to non-admins.
  if (!env.ownerKeyHash) return false
  return auth?.ownerKeyHash && env.ownerKeyHash === auth.ownerKeyHash
}

function safeParseJsonArray(text: string | null | undefined): any[] {
  if (!text) return []
  try {
    const v = JSON.parse(text)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

class RequestTooLargeError extends Error {
  name = "RequestTooLargeError"
}

function readJson(req: http.IncomingMessage, opts?: { maxBytes?: number }): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = ""
    const maxBytes = Math.max(1024, Number(opts?.maxBytes ?? 1_000_000)) // default 1MB
    req.on("data", (chunk) => (body += chunk))
    req.on("end", () => {
      if (!body.trim()) return resolve(null)
      try {
        resolve(JSON.parse(body))
      } catch (e) {
        reject(e)
      }
    })
    req.on("data", () => {
      if (body.length > maxBytes) {
        reject(new RequestTooLargeError("Request body too large"))
        try { req.destroy() } catch { /* ignore */ }
      }
    })
  })
}

function pathMatch(pathname: string, pattern: RegExp): RegExpExecArray | null {
  const m = pattern.exec(pathname)
  return m && m[0] === pathname ? m : null
}

async function main() {
  validateStartupConfig()
  await validateProvidersOnStartup()
  const port = Number(process.env.OZ_CONTROL_PLANE_PORT || "8080")
  if (!Number.isFinite(port) || port <= 0) throw new Error("OZ_CONTROL_PLANE_PORT must be a positive number")

  const server = http.createServer(async (req, res) => {
    const reqIdHeader = (req.headers["x-request-id"] || req.headers["x-oz-request-id"]) as any
    const reqId =
      (Array.isArray(reqIdHeader) ? reqIdHeader[0] : reqIdHeader)?.toString?.().trim?.() ||
      newReqId()
    try { res.setHeader("X-Request-Id", reqId) } catch { /* ignore */ }
    const rlog = log.child({ req_id: reqId })

    try {
      const method = req.method || "GET"
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
      const pathname = url.pathname

      rlog.info("http.request", {
        method,
        path: pathname,
        query: url.search ? url.search.slice(1) : "",
        remote: req.socket?.remoteAddress,
      })

      if (pathname === "/health") {
        const db = await checkDb()
        if (!db.ok) return json(res, 503, { ok: false, db: "error", error: db.error, request_id: reqId })
        return json(res, 200, { ok: true, db: "ok", request_id: reqId })
      }

      if (!pathname.startsWith("/api/v1/")) return json(res, 404, { error: "Not found" })

      const auth = requireAuth({ headers: req.headers as any })
      if (!auth.ok) return json(res, auth.status, { ...auth.body, request_id: reqId })

      // Minimal stub.
      if (method === "GET" && pathname === "/api/v1/agent") {
        return json(res, 200, { items: [], request_id: reqId })
      }

      if (method === "POST" && pathname === "/api/v1/environments") {
        let body: any = null
        try {
          body = await readJson(req)
        } catch (e) {
          if (e instanceof RequestTooLargeError) return json(res, 413, { error: "Request body too large", request_id: reqId })
          return json(res, 400, { error: "Invalid JSON", request_id: reqId })
        }
        const name = typeof body?.name === "string" ? body.name.trim() : ""
        const dockerImage = typeof body?.docker_image === "string" ? body.docker_image.trim() : ""
        if (!name) return json(res, 400, { error: "name is required", request_id: reqId })
        if (!dockerImage) return json(res, 400, { error: "docker_image is required", request_id: reqId })

        const scope = typeof body?.scope === "string" ? body.scope.trim().toUpperCase() : ""
        const globalScope = auth.isAdmin && (body?.global === true || scope === "GLOBAL")
        const ownerKeyHash = globalScope
          ? null
          : auth.isAdmin
            ? crypto.createHash("sha256").update(auth.token).digest("hex")
            : auth.ownerKeyHash

        const envId = `env_${crypto.randomUUID()}`
        const reposText = toLines(body?.repos).join("\n")
        const setupCommandsText = toLines(body?.setup_commands).join("\n")
        const envVarsText = envVarsToLines(body?.env_vars).join("\n")
        if (globalScope && envVarsText) {
          return json(res, 400, { error: "Global environments cannot include env_vars (store secrets per-tenant)", request_id: reqId })
        }

        const created = await prisma.environment.create({
          data: {
            id: envId,
            ownerKeyHash,
            name,
            dockerImage,
            reposText,
            setupCommandsText,
            envVarsText,
          },
        })

        return json(res, 200, {
          environment_id: created.id,
          id: created.id,
          name: created.name,
          docker_image: created.dockerImage,
          repos: toLines(created.reposText),
          setup_commands: toLines(created.setupCommandsText),
          env_vars: envVarsTextToObject(created.envVarsText),
          scope: created.ownerKeyHash ? "OWNER" : "GLOBAL",
          created_at: created.createdAt.toISOString(),
          updated_at: created.updatedAt.toISOString(),
          request_id: reqId,
        })
      }

      const envList = pathMatch(pathname, /^\/api\/v1\/environments\/?$/)
      if (method === "GET" && envList) {
        const where = auth.isAdmin
          ? {}
          : { OR: [{ ownerKeyHash: auth.ownerKeyHash }, { ownerKeyHash: null }] }
        const items = await prisma.environment.findMany({ where, orderBy: { updatedAt: "desc" }, take: 200 })
        return json(res, 200, {
          items: items.map((e) => ({
            environment_id: e.id,
            id: e.id,
            name: e.name,
            docker_image: e.dockerImage,
            repos: toLines(e.reposText),
            setup_commands: toLines(e.setupCommandsText),
            env_vars: canViewEnvVars(auth, e) ? envVarsTextToObject(e.envVarsText) : redactedEnvVars(e.envVarsText),
            scope: e.ownerKeyHash ? "OWNER" : "GLOBAL",
            created_at: e.createdAt.toISOString(),
            updated_at: e.updatedAt.toISOString(),
          })),
          request_id: reqId,
        })
      }

      const envGet = pathMatch(pathname, /^\/api\/v1\/environments\/([^/]+)\/?$/)
      if (method === "GET" && envGet) {
        const envId = envGet[1]
        const env = await prisma.environment.findUnique({ where: { id: envId } })
        if (!env) return json(res, 404, { error: "Not found", request_id: reqId })
        if (!auth.isAdmin && env.ownerKeyHash && env.ownerKeyHash !== auth.ownerKeyHash) {
          return json(res, 404, { error: "Not found", request_id: reqId })
        }
        return json(res, 200, {
          environment_id: env.id,
          id: env.id,
          name: env.name,
          docker_image: env.dockerImage,
          repos: toLines(env.reposText),
          setup_commands: toLines(env.setupCommandsText),
          env_vars: canViewEnvVars(auth, env) ? envVarsTextToObject(env.envVarsText) : redactedEnvVars(env.envVarsText),
          scope: env.ownerKeyHash ? "OWNER" : "GLOBAL",
          created_at: env.createdAt.toISOString(),
          updated_at: env.updatedAt.toISOString(),
          request_id: reqId,
        })
      }

      // SDK compatibility: accept both singular and plural create endpoints.
      if (method === "POST" && (pathname === "/api/v1/agent/run" || pathname === "/api/v1/agent/runs")) {
        let body: any = null
        try {
          body = await readJson(req)
        } catch (e) {
          if (e instanceof RequestTooLargeError) return json(res, 413, { error: "Request body too large", request_id: reqId })
          return json(res, 400, { error: "Invalid JSON", request_id: reqId })
        }
        const prompt = body?.prompt
        if (typeof prompt !== "string" || !prompt.trim()) return json(res, 400, { error: "prompt is required", request_id: reqId })

        const modelId = body?.config?.model_id ?? null
        const environmentId = typeof body?.config?.environment_id === "string" ? body.config.environment_id.trim() : ""
        const harness = harnessFromModelId(modelId)
        const runId = `run_${crypto.randomUUID()}`
        const now = new Date()

        if (environmentId) {
          const env = await prisma.environment.findUnique({ where: { id: environmentId } })
          if (env) {
            if (!auth.isAdmin && env.ownerKeyHash && env.ownerKeyHash !== auth.ownerKeyHash) {
              return json(res, 404, { error: "Not found", request_id: reqId })
            }
            // Non-admins are allowed to use global envs, but global envs are forced to have no env_vars.
          }
          if (!env) {
            const allowRaw = (process.env.OZ_ALLOW_RAW_ENV_IMAGE || "").toLowerCase()
            const ok = allowRaw === "1" || allowRaw === "true"
            if (!ok) return json(res, 404, { error: "Not found", request_id: reqId })
          }
        }

        rlog.info("agent_run.create", {
          run_id: runId,
          harness,
          model_id: modelId || null,
          has_environment: Boolean(environmentId),
          prompt_length: prompt.length,
          auth_scope: auth.isAdmin ? "admin" : "tenant",
        })

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
            sessionLink: null,
            artifactsJson: null,
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
              rlog.error("agent_run.local_exec_failed", { run_id: runId }, err)
              await prisma.agentRun.updateMany({
                where: { id: runId, state: { notIn: ["SUCCEEDED", "FAILED", "CANCELLED"] } },
                data: { state: "FAILED", errorMessage: msg, completedAt: new Date() },
              })
            }
          })
        }

        return json(res, 200, { run_id: runId, task_id: runId, request_id: reqId })
      }

      const runsRoute = pathMatch(pathname, /^\/api\/v1\/agent\/runs\/?$/)
      if (method === "GET" && runsRoute) {
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "50"), 1), 200)
        const cursor = (url.searchParams.get("cursor") || "").trim()
        const whereBase = auth.isAdmin ? {} : { ownerKeyHash: auth.ownerKeyHash }

        let where: any = whereBase
        if (cursor) {
          const cursorRun = await prisma.agentRun.findUnique({ where: { id: cursor } })
          if (cursorRun && (auth.isAdmin || cursorRun.ownerKeyHash === auth.ownerKeyHash)) {
            where = {
              AND: [
                whereBase,
                {
                  OR: [
                    { queuedAt: { lt: cursorRun.queuedAt } },
                    { AND: [{ queuedAt: cursorRun.queuedAt }, { id: { lt: cursorRun.id } }] },
                  ],
                },
              ],
            }
          }
        }

        const runs = await prisma.agentRun.findMany({
          where,
          orderBy: [{ queuedAt: "desc" }, { id: "desc" }],
          take: limit + 1,
        })

        const hasMore = runs.length > limit
        const page = hasMore ? runs.slice(0, limit) : runs
        const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null

        return json(res, 200, {
          items: page.map((run) => ({
            created_at: run.queuedAt.toISOString(),
            updated_at: run.updatedAt.toISOString(),
            prompt: run.prompt,
            run_id: run.id,
            task_id: run.id,
            title: run.title || "Run",
            state: run.state,
            session_link: run.sessionLink || null,
            artifacts: safeParseJsonArray(run.artifactsJson),
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
          next_cursor: nextCursor,
          request_id: reqId,
        })
      }

      const runGet = pathMatch(pathname, /^\/api\/v1\/agent\/runs\/([^/]+)\/?$/)
      if (method === "GET" && runGet) {
        const runID = runGet[1]
        const run = await prisma.agentRun.findUnique({ where: { id: runID } })
        if (!run) return json(res, 404, { error: "Not found", request_id: reqId })
        if (!auth.isAdmin && run.ownerKeyHash !== auth.ownerKeyHash) return json(res, 404, { error: "Not found", request_id: reqId })

        return json(res, 200, {
          created_at: run.queuedAt.toISOString(),
          updated_at: run.updatedAt.toISOString(),
          prompt: run.prompt,
          run_id: run.id,
          task_id: run.id,
          title: run.title || "Run",
          state: run.state,
          session_link: run.sessionLink || null,
          artifacts: safeParseJsonArray(run.artifactsJson),
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
          request_id: reqId,
        })
      }

      const runCancel = pathMatch(pathname, /^\/api\/v1\/agent\/runs\/([^/]+)\/cancel\/?$/)
      if (method === "POST" && runCancel) {
        const runID = runCancel[1]
        const run = await prisma.agentRun.findUnique({ where: { id: runID } })
        if (!run) return json(res, 404, { error: "Not found", request_id: reqId })
        if (!auth.isAdmin && run.ownerKeyHash !== auth.ownerKeyHash) return json(res, 404, { error: "Not found", request_id: reqId })

        await prisma.agentRun.update({
          where: { id: runID },
          data: {
            state: "CANCELLED",
            completedAt: new Date(),
            errorMessage: run.errorMessage || "Cancelled",
          },
        })

        if (run.workerId) {
          // Best-effort cancel propagation to a connected worker.
          sendCancelToWorker(run.workerId, runID)
        }
        rlog.info("agent_run.cancelled", { run_id: runID, worker_id: run.workerId || null })
        return json(res, 200, { status: "cancelled", request_id: reqId })
      }

      return json(res, 404, { error: "Not found", request_id: reqId })
    } catch (err) {
      rlog.error("http.request_error", undefined, err)
      return json(res, 500, { error: err instanceof Error ? err.message : "Internal error", request_id: reqId })
    }
  })

  server.listen(port, () => {
    log.info("startup.listening", { port })
  })

  const workerWs: WorkerWsAttachment = attachWorkerWebSocket(server)
  const retention = startRetentionLoop()

  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    log.info("shutdown.start", { signal })

    retention.stop()
    await workerWs.close().catch(() => {})

    await new Promise<void>((resolve) => {
      try {
        server.close(() => resolve())
      } catch {
        resolve()
      }
    })

    try { await prisma.$disconnect() } catch { /* ignore */ }
    log.info("shutdown.complete", { signal })
    process.exit(0)
  }

  process.on("SIGINT", () => { shutdown("SIGINT").catch(() => process.exit(1)) })
  process.on("SIGTERM", () => { shutdown("SIGTERM").catch(() => process.exit(1)) })
}

main().catch((e) => {
  log.error("startup.fatal", undefined, e)
  process.exit(1)
})
