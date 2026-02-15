export class ProviderError extends Error {
  readonly code?: string
  readonly status?: number
  readonly retryAfterMs?: number

  constructor(message: string, opts: { code?: string; status?: number; retryAfterMs?: number } = {}) {
    super(message)
    this.name = "ProviderError"
    this.code = opts.code
    this.status = opts.status
    this.retryAfterMs = opts.retryAfterMs
  }
}

export class RateLimitError extends ProviderError {
  constructor(message: string, opts: { status?: number; retryAfterMs?: number } = {}) {
    super(message, { ...opts, code: "rate_limited" })
    this.name = "RateLimitError"
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ConfigError"
  }
}

export function isRateLimitError(err: unknown): err is RateLimitError {
  return err instanceof RateLimitError || (err instanceof ProviderError && err.code === "rate_limited")
}

