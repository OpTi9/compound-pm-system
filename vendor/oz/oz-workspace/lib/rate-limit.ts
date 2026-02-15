type Bucket = { count: number; resetAtMs: number }

const buckets = new Map<string, Bucket>()

function nowMs(): number {
  return Date.now()
}

function cleanup(now: number) {
  // Opportunistic cleanup to avoid unbounded growth.
  if (buckets.size < 10_000) return
  for (const [k, b] of buckets) {
    if (b.resetAtMs <= now) buckets.delete(k)
  }
}

export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for") || ""
  const first = xff.split(",")[0]?.trim()
  if (first) return first
  const real = (request.headers.get("x-real-ip") || "").trim()
  if (real) return real
  // Fallback: not reliable behind proxies, but better than empty.
  return "unknown"
}

export function checkRateLimit(key: string, opts: { limit: number; windowMs: number }): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const now = nowMs()
  cleanup(now)
  const existing = buckets.get(key)
  if (!existing || existing.resetAtMs <= now) {
    buckets.set(key, { count: 1, resetAtMs: now + opts.windowMs })
    return { ok: true }
  }

  if (existing.count >= opts.limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAtMs - now) / 1000)) }
  }

  existing.count += 1
  return { ok: true }
}

