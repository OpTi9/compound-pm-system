import { prisma } from "@/lib/prisma"
import { ConfigError, ProviderError, RateLimitError, isRateLimitError } from "@/lib/runner/errors"

export type ProviderType = "openai_compatible" | "anthropic" | "cli"

export interface ProviderCandidate {
  providerKey: string
  type: ProviderType
  model: string
  baseUrl?: string
  apiKey?: string
  // Rolling window quota (messages)
  windowSeconds?: number
  messagesLimit?: number
}

function env(key: string): string | undefined {
  const v = process.env[key]
  return v && v.trim() ? v.trim() : undefined
}

function envInt(key: string): number | undefined {
  const raw = env(key)
  if (!raw) return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

function providerEnvName(providerKey: string, suffix: string): string {
  return `OZ_PROVIDER_${providerKey.toUpperCase()}_${suffix}`
}

function normalizeHarnessKey(harness: string): string {
  return harness.toLowerCase().replace(/[^a-z0-9]+/g, "_")
}

function defaultProviderForHarness(harness: string): { providerKey: string; type: ProviderType } {
  switch (harness) {
    case "claude-code":
      return { providerKey: "claude", type: "anthropic" }
    case "codex":
      return { providerKey: "codex", type: "openai_compatible" }
    case "glm":
      return { providerKey: "glm", type: "openai_compatible" }
    case "kimi":
      return { providerKey: "kimi", type: "openai_compatible" }
    case "gemini-cli":
      return { providerKey: "gemini", type: "openai_compatible" }
    case "custom":
      return { providerKey: "custom", type: "openai_compatible" }
    default:
      return { providerKey: (env("OZ_DEFAULT_PROVIDER") || "custom").toLowerCase(), type: "openai_compatible" }
  }
}

function loadCandidate(providerKey: string, fallbackType?: ProviderType): ProviderCandidate | null {
  const typeRaw = (env(providerEnvName(providerKey, "TYPE")) || fallbackType || "openai_compatible").toLowerCase()
  const type =
    (typeRaw === "anthropic" ? "anthropic"
    : typeRaw === "cli" ? "cli"
    : "openai_compatible") as ProviderType

  const model =
    env(providerEnvName(providerKey, "MODEL")) ||
    env("OZ_PROVIDER_MODEL") ||
    env("OZ_MODEL") ||
    (type === "cli" ? "cli" : undefined)
  if (!model) return null

  const apiKey =
    env(providerEnvName(providerKey, "API_KEY")) ||
    env("OZ_PROVIDER_API_KEY")

  const baseUrl =
    type === "anthropic" || type === "cli"
      ? env(providerEnvName(providerKey, "BASE_URL")) || env("OZ_PROVIDER_BASE_URL")
      : env(providerEnvName(providerKey, "BASE_URL")) || env("OZ_PROVIDER_BASE_URL")

  // For anthropic, baseUrl is optional (defaults inside adapter). For openai-compatible it's required.
  if (type === "openai_compatible" && !baseUrl) return null

  const windowSeconds = envInt(providerEnvName(providerKey, "WINDOW_SECONDS")) ?? envInt("OZ_PROVIDER_WINDOW_SECONDS")
  const messagesLimit = envInt(providerEnvName(providerKey, "MSG_LIMIT")) ?? envInt("OZ_PROVIDER_MSG_LIMIT")

  return {
    providerKey,
    type,
    model,
    apiKey,
    baseUrl,
    windowSeconds,
    messagesLimit,
  }
}

function parseFallbackOrder(harness: string, primaryProviderKey: string): string[] {
  const harnessKey = normalizeHarnessKey(harness)
  const specific =
    env(`OZ_PROVIDER_FALLBACK_ORDER_${harnessKey.toUpperCase()}`) ||
    env(`OZ_PROVIDER_FALLBACK_ORDER_${harnessKey}`) ||
    env("OZ_PROVIDER_FALLBACK_ORDER")
  const list = (specific || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  // Unique, and don't repeat primary.
  const out: string[] = []
  for (const k of list) {
    const key = k.toLowerCase()
    if (key === primaryProviderKey.toLowerCase()) continue
    if (!out.includes(key)) out.push(key)
  }
  return out
}

async function isProviderSaturated(providerKey: string, windowSeconds?: number, messagesLimit?: number): Promise<boolean> {
  if (!windowSeconds || !messagesLimit || messagesLimit <= 0 || windowSeconds <= 0) return false
  const row = await prisma.providerUsage.findUnique({ where: { providerKey } })
  if (!row) return false
  const windowEnd = row.windowStartedAt.getTime() + row.windowSeconds * 1000
  const now = Date.now()
  if (now >= windowEnd) return false
  return row.messagesUsed >= row.messagesLimit
}

async function bumpUsage(providerKey: string, windowSeconds: number, messagesLimit: number): Promise<void> {
  const now = new Date()
  const row = await prisma.providerUsage.findUnique({ where: { providerKey } })
  if (!row) {
    await prisma.providerUsage.create({
      data: {
        providerKey,
        windowStartedAt: now,
        windowSeconds,
        messagesUsed: 1,
        messagesLimit,
      },
    })
    return
  }

  const windowEnd = row.windowStartedAt.getTime() + row.windowSeconds * 1000
  if (Date.now() >= windowEnd || row.windowSeconds !== windowSeconds || row.messagesLimit !== messagesLimit) {
    await prisma.providerUsage.update({
      where: { providerKey },
      data: {
        windowStartedAt: now,
        windowSeconds,
        messagesUsed: 1,
        messagesLimit,
      },
    })
    return
  }

  await prisma.providerUsage.update({
    where: { providerKey },
    data: {
      messagesUsed: { increment: 1 },
      windowSeconds,
      messagesLimit,
    },
  })
}

async function markSaturated(providerKey: string, windowSeconds?: number, messagesLimit?: number): Promise<void> {
  const row = await prisma.providerUsage.findUnique({ where: { providerKey } })
  if (!row) {
    if (!windowSeconds || !messagesLimit || windowSeconds <= 0 || messagesLimit <= 0) return
    await prisma.providerUsage.create({
      data: {
        providerKey,
        windowStartedAt: new Date(),
        windowSeconds,
        messagesUsed: messagesLimit,
        messagesLimit,
      },
    })
    return
  }
  await prisma.providerUsage.update({
    where: { providerKey },
    data: { messagesUsed: row.messagesLimit },
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function earliestResetMs(providerKeys: string[]): Promise<number | null> {
  const rows = await prisma.providerUsage.findMany({ where: { providerKey: { in: providerKeys } } })
  let best: number | null = null
  const now = Date.now()
  for (const r of rows) {
    const end = r.windowStartedAt.getTime() + r.windowSeconds * 1000
    if (end <= now) continue
    const delta = end - now
    if (best === null || delta < best) best = delta
  }
  return best
}

export async function getProviderCandidatesForHarness(harness: string): Promise<ProviderCandidate[]> {
  const primary = defaultProviderForHarness(harness)
  const providerKeys = [primary.providerKey, ...parseFallbackOrder(harness, primary.providerKey)]

  const candidates: ProviderCandidate[] = []
  for (const key of providerKeys) {
    const c = loadCandidate(key, key === primary.providerKey ? primary.type : undefined)
    if (c) candidates.push(c)
  }

  if (candidates.length === 0) {
    throw new ConfigError(
      `No providers configured for harness "${harness}". Set OZ_PROVIDER_* env vars (e.g. OZ_PROVIDER_${primary.providerKey.toUpperCase()}_BASE_URL / _MODEL).`
    )
  }

  return candidates
}

export async function selectProviderForHarness(harness: string): Promise<ProviderCandidate> {
  const candidates = await getProviderCandidatesForHarness(harness)

  // Prefer non-saturated candidates (quota-aware).
  for (const c of candidates) {
    if (await isProviderSaturated(c.providerKey, c.windowSeconds, c.messagesLimit)) continue
    return c
  }

  // Queue/wait option.
  const shouldQueue = env("OZ_QUEUE_ON_SATURATION") === "1" || env("OZ_QUEUE_ON_SATURATION") === "true"
  if (!shouldQueue) {
    throw new RateLimitError(`All providers saturated for harness "${harness}"`, { status: 429 })
  }

  const maxWaitSeconds = envInt("OZ_QUEUE_MAX_WAIT_SECONDS") ?? 300
  const resetMs = await earliestResetMs(candidates.map((c) => c.providerKey))
  if (resetMs === null) throw new RateLimitError(`All providers saturated for harness "${harness}"`, { status: 429 })

  const waitMs = Math.min(resetMs + 250, maxWaitSeconds * 1000)
  await sleep(waitMs)

  for (const c of candidates) {
    if (await isProviderSaturated(c.providerKey, c.windowSeconds, c.messagesLimit)) continue
    return c
  }

  throw new RateLimitError(`All providers still saturated for harness "${harness}" after waiting`, { status: 429 })
}

export async function providerSaturated(candidate: ProviderCandidate): Promise<boolean> {
  return isProviderSaturated(candidate.providerKey, candidate.windowSeconds, candidate.messagesLimit)
}

export async function earliestResetForCandidates(candidates: ProviderCandidate[]): Promise<number | null> {
  return earliestResetMs(candidates.map((c) => c.providerKey))
}

export function queueEnabled(): boolean {
  return env("OZ_QUEUE_ON_SATURATION") === "1" || env("OZ_QUEUE_ON_SATURATION") === "true"
}

export function queueMaxWaitSeconds(): number {
  return envInt("OZ_QUEUE_MAX_WAIT_SECONDS") ?? 300
}

export async function recordProviderCallStart(candidate: ProviderCandidate): Promise<void> {
  if (!candidate.windowSeconds || !candidate.messagesLimit) return
  await bumpUsage(candidate.providerKey, candidate.windowSeconds, candidate.messagesLimit)
}

export async function handleProviderError(candidate: ProviderCandidate, err: unknown): Promise<void> {
  if (isRateLimitError(err)) {
    await markSaturated(candidate.providerKey, candidate.windowSeconds, candidate.messagesLimit)
    return
  }
  if (err instanceof ProviderError && err.status === 429) {
    await markSaturated(candidate.providerKey, candidate.windowSeconds, candidate.messagesLimit)
  }
}
