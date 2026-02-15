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

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Provider error: POST ${url} -> ${res.status} ${res.statusText}${text ? `: ${text}` : ""}`)
  }

  const json = (await res.json()) as any
  const content = json?.choices?.[0]?.message?.content
  if (typeof content !== "string") {
    throw new Error("Provider error: unexpected response shape (missing choices[0].message.content)")
  }
  return content
}

