export function harnessFromModelId(modelId?: string | null): string {
  const m = (modelId || "").toLowerCase()
  if (m.includes("claude")) return "claude-code"
  if (m.includes("codex")) return "codex"
  if (m.includes("glm")) return "glm"
  if (m.includes("kimi")) return "kimi"
  if (m.includes("gemini")) return "gemini-cli"
  return (process.env.OZ_OZAPI_DEFAULT_HARNESS || "custom").toLowerCase()
}

export function json(res: import("node:http").ServerResponse, status: number, body: any) {
  const text = JSON.stringify(body)
  res.statusCode = status
  res.setHeader("Content-Type", "application/json")
  res.setHeader("Cache-Control", "no-store")
  res.end(text)
}

