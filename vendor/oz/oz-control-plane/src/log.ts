import crypto from "node:crypto"

export type LogLevel = "debug" | "info" | "warn" | "error"

function levelRank(l: LogLevel): number {
  switch (l) {
    case "debug": return 10
    case "info": return 20
    case "warn": return 30
    case "error": return 40
  }
}

function currentLevel(): LogLevel {
  const raw = (process.env.OZ_LOG_LEVEL || "info").trim().toLowerCase()
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw
  return "info"
}

function enabled(level: LogLevel): boolean {
  return levelRank(level) >= levelRank(currentLevel())
}

function errFields(err: unknown): Record<string, unknown> | undefined {
  if (!err) return undefined
  if (err instanceof Error) {
    return {
      err_name: err.name,
      err_message: err.message,
      err_stack: err.stack,
    }
  }
  return { err: String(err) }
}

function safeJsonLine(obj: any): string {
  try {
    return JSON.stringify(obj)
  } catch {
    return JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "log_json_error" })
  }
}

export function newReqId(): string {
  return `req_${crypto.randomUUID()}`
}

export function logger(base?: Record<string, unknown>) {
  const baseFields = base || {}
  const write = (level: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (!enabled(level)) return
    const line = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...baseFields,
      ...(fields || {}),
    }
    // eslint-disable-next-line no-console
    console.log(safeJsonLine(line))
  }

  return {
    debug: (msg: string, fields?: Record<string, unknown>) => write("debug", msg, fields),
    info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
    warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
    error: (msg: string, fields?: Record<string, unknown>, err?: unknown) =>
      write("error", msg, { ...(fields || {}), ...(errFields(err) || {}) }),
    child: (fields: Record<string, unknown>) => logger({ ...baseFields, ...fields }),
  }
}

export const log = logger({ service: "oz-control-plane" })

