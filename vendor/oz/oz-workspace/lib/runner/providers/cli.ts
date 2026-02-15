import { ProviderError, RateLimitError } from "@/lib/runner/errors"
import { execFile } from "node:child_process"

function env(key: string): string | undefined {
  const v = process.env[key]
  return v && v.trim() ? v.trim() : undefined
}

function providerEnvName(providerKey: string, suffix: string): string {
  return `OZ_PROVIDER_${providerKey.toUpperCase()}_${suffix}`
}

function parseArgs(raw: string | undefined): string[] {
  if (!raw) return []
  const trimmed = raw.trim()
  if (!trimmed) return []
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed)
      return Array.isArray(arr) ? arr.map(String) : []
    } catch {
      return []
    }
  }
  // Space-split fallback (not shell-escaped).
  return trimmed.split(/\s+/).filter(Boolean)
}

export async function runCliProvider(opts: {
  providerKey: string
  prompt: string
  model?: string
  timeoutMs?: number
}): Promise<string> {
  const cmd = env(providerEnvName(opts.providerKey, "CLI_CMD"))
  if (!cmd) throw new ProviderError(`Missing CLI command. Set ${providerEnvName(opts.providerKey, "CLI_CMD")}.`)

  const args = parseArgs(env(providerEnvName(opts.providerKey, "CLI_ARGS")))
  const timeoutMs = opts.timeoutMs ?? 5 * 60_000

  const fullPrompt = opts.model ? `[model:${opts.model}]\n${opts.prompt}` : opts.prompt

  return new Promise<string>((resolve, reject) => {
    const child = execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || stdout || err.message || "").toString()
        // Best-effort rate limit detection for CLIs.
        if (/rate limit|too many requests|429/i.test(msg)) {
          return reject(new RateLimitError(`CLI rate limited: ${msg}`))
        }
        return reject(new ProviderError(`CLI provider failed: ${msg || err.message}`))
      }
      const out = (stdout || "").toString().trim()
      if (!out) return reject(new ProviderError("CLI provider returned empty output"))
      resolve(out)
    })

    child.stdin?.write(fullPrompt)
    child.stdin?.end()
  })
}

