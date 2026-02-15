import { ProviderError, RateLimitError } from "@/lib/runner/errors"

type Role = "system" | "user" | "assistant"

export interface AnthropicMessage {
  role: Exclude<Role, "system">
  content: string
}

export interface AnthropicRunOptions {
  apiKey: string
  model: string
  system?: string
  messages: AnthropicMessage[]
  temperature?: number
  maxTokens?: number
  baseUrl?: string
}

function parseRetryAfterMs(res: Response): number | undefined {
  const raw = res.headers.get("retry-after")
  if (!raw) return undefined
  const s = Number(raw) * 1000
  return Number.isFinite(s) && s > 0 ? s : undefined
}

export async function runAnthropicMessages(opts: AnthropicRunOptions): Promise<string> {
  const url = (opts.baseUrl || "https://api.anthropic.com").replace(/\/+$/, "") + "/v1/messages"

  const body: any = {
    model: opts.model,
    messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: opts.maxTokens ?? 1024,
  }
  if (opts.system) body.system = opts.system
  if (opts.temperature !== undefined) body.temperature = opts.temperature

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    if (res.status === 429) {
      throw new RateLimitError(`Anthropic rate limited: ${text || res.statusText}`, {
        status: res.status,
        retryAfterMs: parseRetryAfterMs(res),
      })
    }
    throw new ProviderError(`Anthropic error: ${res.status} ${res.statusText}${text ? `: ${text}` : ""}`, {
      status: res.status,
    })
  }

  const json = (await res.json()) as any
  const blocks = json?.content
  if (!Array.isArray(blocks)) {
    throw new ProviderError("Anthropic error: unexpected response shape (missing content array)")
  }

  const out = blocks
    .filter((b: any) => b && b.type === "text" && typeof b.text === "string")
    .map((b: any) => b.text)
    .join("")
    .trim()

  if (!out) throw new ProviderError("Anthropic error: empty text response")
  return out
}

