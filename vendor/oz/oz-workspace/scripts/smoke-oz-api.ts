/**
 * Smoke test for local Oz API routes (Option 1 + SDK compatibility).
 *
 * Prereqs:
 * - oz-workspace running on http://localhost:3000
 * - .env.local contains OZ_API_KEY and provider config
 *
 * Usage:
 *   npx tsx scripts/smoke-oz-api.ts
 */

import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

dotenv.config({ path: path.resolve(__dirname, "../.env") })
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true })

const baseURL = (process.env.OZ_API_BASE_URL || "http://localhost:3000/api/v1").replace(/\/+$/, "")
const apiKey = process.env.OZ_API_KEY

if (!apiKey) {
  console.error("OZ_API_KEY is not set. Aborting.")
  process.exit(1)
}

async function api(p: string, init?: RequestInit) {
  const res = await fetch(`${baseURL}${p}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${init?.method || "GET"} ${p} -> ${res.status}: ${text}`)
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  console.log("Base:", baseURL)

  const run = await api("/agent/run", {
    method: "POST",
    body: JSON.stringify({
      prompt: "Write a 5-bullet plan for adding a /health endpoint to an Express app.",
      config: { model_id: "glm" },
    }),
  })

  const runId = run.run_id || run.task_id
  console.log("run_id:", runId)

  for (let i = 0; i < 60; i++) {
    const status = await api(`/agent/runs/${runId}`)
    console.log(`state=${status.state}`)
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(status.state)) {
      console.log("done")
      return
    }
    await sleep(1000)
  }

  throw new Error("timeout")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

