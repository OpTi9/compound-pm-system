/**
 * Pure parsing/utility functions extracted from the orchestrator for testability.
 * The orchestrator imports these; tests exercise them directly.
 */

// ── Utility functions ──

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + `\n\n[truncated ${s.length - max} chars]`
}

export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

export function envInt(key: string, fallback: number): number {
  const raw = (process.env[key] || "").trim()
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export function envStr(key: string): string | undefined {
  const raw = (process.env[key] || "").trim()
  return raw ? raw : undefined
}

// ── Review outcome parsing ──

export function parseReviewOutcome(text: string): { outcome: "APPROVED" | "CHANGES_NEEDED"; details: string } | null {
  const t = (text || "").trim()
  if (!t) return null
  const firstLine = t.split(/\r?\n/, 1)[0]?.trim() || ""
  const head = (firstLine || t.slice(0, 40)).trim().toUpperCase()

  if (head.startsWith("APPROVED")) return { outcome: "APPROVED", details: t }
  if (head.startsWith("CHANGES_NEEDED")) return { outcome: "CHANGES_NEEDED", details: t }

  // Fallback: anywhere in the response, but prefer CHANGES_NEEDED if both appear.
  const upper = t.toUpperCase()
  if (upper.includes("CHANGES_NEEDED")) return { outcome: "CHANGES_NEEDED", details: t }
  if (upper.includes("APPROVED")) return { outcome: "APPROVED", details: t }
  return null
}

// ── JSON block extraction ──

export function extractJsonBlock(text: string): string | null {
  const t = (text || "").trim()
  if (!t) return null

  const fence = t.match(/```json\s*([\s\S]*?)\s*```/i)
  if (fence && fence[1]) return fence[1].trim()

  // Fallback: attempt to slice from first "{" to last "}".
  const start = t.indexOf("{")
  const end = t.lastIndexOf("}")
  if (start !== -1 && end !== -1 && end > start) return t.slice(start, end + 1).trim()
  return null
}

// ── Decompose plan parsing ──

export type DecomposeTask = { title: string; prompt: string; agentId?: string }
export type DecomposeEpic = { title: string; tasks: DecomposeTask[] }

export function normalizeDecomposeTask(t: any): DecomposeTask | null {
  const title = typeof t?.title === "string" ? t.title.trim() : ""
  const prompt = typeof t?.prompt === "string" ? t.prompt.trim() : ""
  const agentId = typeof t?.agentId === "string" ? t.agentId.trim() : ""
  if (!title || !prompt) return null
  return agentId ? { title, prompt, agentId } : { title, prompt }
}

export function parseDecomposePlan(text: string): { tasks: DecomposeTask[]; epics: null } | { tasks: null; epics: DecomposeEpic[] } | null {
  const jsonText = extractJsonBlock(text)
  if (!jsonText) return null
  let parsed: any
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return null
  }

  const epicsRaw = parsed?.epics
  if (Array.isArray(epicsRaw) && epicsRaw.length) {
    const epics: DecomposeEpic[] = []
    for (const e of epicsRaw) {
      const title = typeof e?.title === "string" ? e.title.trim() : ""
      const tasksRaw = e?.tasks
      if (!title || !Array.isArray(tasksRaw) || tasksRaw.length === 0) continue
      const tasks: DecomposeTask[] = []
      for (const t of tasksRaw) {
        const norm = normalizeDecomposeTask(t)
        if (norm) tasks.push(norm)
      }
      if (tasks.length) epics.push({ title, tasks })
    }
    return epics.length ? { tasks: null, epics } : null
  }

  const tasksRaw = parsed?.tasks
  if (!Array.isArray(tasksRaw)) return null
  const tasks: DecomposeTask[] = []
  for (const t of tasksRaw) {
    const norm = normalizeDecomposeTask(t)
    if (norm) tasks.push(norm)
  }
  return tasks.length ? { tasks, epics: null } : null
}

// ── Learnings parsing ──

export function parseLearnings(text: string): Array<{ kind?: string; title: string; content: string; tags?: string[] }> | null {
  const jsonText = extractJsonBlock(text)
  if (!jsonText) return null
  let parsed: any
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return null
  }
  const items = parsed?.learnings || parsed?.knowledge || parsed?.items
  if (!Array.isArray(items)) return null
  const out: Array<{ kind?: string; title: string; content: string; tags?: string[] }> = []
  for (const i of items) {
    const title = typeof i?.title === "string" ? i.title.trim() : ""
    const content = typeof i?.content === "string" ? i.content.trim() : ""
    const kind = typeof i?.kind === "string" ? i.kind.trim() : undefined
    const tags = Array.isArray(i?.tags) ? i.tags.filter((t: any) => typeof t === "string").map((t: string) => t.trim()).filter(Boolean).slice(0, 20) : undefined
    if (!title || !content) continue
    out.push({ kind, title, content, tags })
  }
  return out.length > 0 ? out : null
}
