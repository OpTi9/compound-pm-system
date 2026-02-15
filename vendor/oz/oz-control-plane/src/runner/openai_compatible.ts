import { ProviderError, RateLimitError } from "./errors.js"

type Role = "system" | "user" | "assistant"

export interface OpenAICompatibleMessage {
  role: Role
  content: string
}

export interface OpenAICompatibleRunOptions {
  baseUrl: string
  apiKey?: string
  model: string
  messages: OpenAICompatibleMessage[]
  temperature?: number
  maxTokens?: number
}

async function readSse(
  res: Response,
  onEvent: (evt: { event?: string; data: string }) => void,
): Promise<void> {
  const reader = res.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let buf = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    while (true) {
      const sep = buf.indexOf("\n\n")
      const sepCrLf = buf.indexOf("\r\n\r\n")
      const idx = sepCrLf !== -1 && (sep === -1 || sepCrLf < sep) ? sepCrLf : sep
      if (idx === -1) break

      const raw = buf.slice(0, idx)
      buf = buf.slice(idx + (idx === sepCrLf ? 4 : 2))

      let event: string | undefined
      const dataLines: string[] = []
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim()
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart())
      }
      const data = dataLines.join("\n")
      if (data) onEvent({ event, data })
    }
  }
}

export async function runOpenAICompatibleChat(opts: OpenAICompatibleRunOptions): Promise<string> {
  const base = opts.baseUrl.replace(/\/+$/, "")
  const url = `${base}/chat/completions`

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (opts.apiKey) headers["Authorization"] = `Bearer ${opts.apiKey}`

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
  }
  if (opts.temperature !== undefined) body.temperature = opts.temperature
  if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    const retryAfter = res.headers.get("retry-after")
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : undefined
    if (res.status === 429) {
      throw new RateLimitError(`Provider rate limited: ${text || res.statusText}`, { status: res.status, retryAfterMs })
    }
    throw new ProviderError(`Provider error: POST ${url} -> ${res.status} ${res.statusText}${text ? `: ${text}` : ""}`, { status: res.status })
  }

  const json = (await res.json()) as any
  const content = json?.choices?.[0]?.message?.content
  if (typeof content !== "string") {
    throw new ProviderError("Provider error: unexpected response shape (missing choices[0].message.content)")
  }
  return content
}

export async function runOpenAICompatibleChatStream(
  opts: OpenAICompatibleRunOptions & { onDelta: (text: string) => void }
): Promise<string> {
  const base = opts.baseUrl.replace(/\/+$/, "")
  const url = `${base}/chat/completions`

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (opts.apiKey) headers["Authorization"] = `Bearer ${opts.apiKey}`

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    stream: true,
  }
  if (opts.temperature !== undefined) body.temperature = opts.temperature
  if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    const retryAfter = res.headers.get("retry-after")
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : undefined
    if (res.status === 429) {
      throw new RateLimitError(`Provider rate limited: ${text || res.statusText}`, { status: res.status, retryAfterMs })
    }
    throw new ProviderError(`Provider error: POST ${url} -> ${res.status} ${res.statusText}${text ? `: ${text}` : ""}`, { status: res.status })
  }

  let out = ""
  await readSse(res, ({ data }) => {
    if (data === "[DONE]") return
    let json: any
    try { json = JSON.parse(data) } catch { return }
    const delta = json?.choices?.[0]?.delta?.content
    if (typeof delta === "string" && delta) {
      out += delta
      opts.onDelta(delta)
    }
  })

  out = out.trim()
  if (!out) throw new ProviderError("Provider error: empty streamed response")
  return out
}

