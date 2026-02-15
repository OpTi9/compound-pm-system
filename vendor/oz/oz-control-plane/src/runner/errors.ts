export class ProviderError extends Error {
  status?: number
  retryAfterMs?: number
  constructor(message: string, opts?: { status?: number; retryAfterMs?: number }) {
    super(message)
    this.name = "ProviderError"
    this.status = opts?.status
    this.retryAfterMs = opts?.retryAfterMs
  }
}

export class RateLimitError extends ProviderError {
  constructor(message: string, opts?: { status?: number; retryAfterMs?: number }) {
    super(message, opts)
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
  return err instanceof RateLimitError || (err instanceof ProviderError && err.status === 429)
}

