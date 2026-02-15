import test from "node:test"
import assert from "node:assert/strict"

import { validateAgentApiKey } from "./agent-auth"

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/agent-response", { headers })
}

test("validateAgentApiKey: returns 500 when AGENT_API_KEY not set", () => {
  const prev = process.env.AGENT_API_KEY
  delete process.env.AGENT_API_KEY
  try {
    const result = validateAgentApiKey(makeRequest({ "X-Agent-Key": "anything" }))
    assert.notEqual(result, null)
    assert.equal(result!.status, 500)
  } finally {
    process.env.AGENT_API_KEY = prev
  }
})

test("validateAgentApiKey: returns 401 when key missing from headers", () => {
  const prev = process.env.AGENT_API_KEY
  process.env.AGENT_API_KEY = "secret123"
  try {
    const result = validateAgentApiKey(makeRequest())
    assert.notEqual(result, null)
    assert.equal(result!.status, 401)
  } finally {
    process.env.AGENT_API_KEY = prev
  }
})

test("validateAgentApiKey: returns 401 when key does not match", () => {
  const prev = process.env.AGENT_API_KEY
  process.env.AGENT_API_KEY = "secret123"
  try {
    const result = validateAgentApiKey(makeRequest({ "X-Agent-Key": "wrong" }))
    assert.notEqual(result, null)
    assert.equal(result!.status, 401)
  } finally {
    process.env.AGENT_API_KEY = prev
  }
})

test("validateAgentApiKey: returns null (success) when key matches", () => {
  const prev = process.env.AGENT_API_KEY
  process.env.AGENT_API_KEY = "secret123"
  try {
    const result = validateAgentApiKey(makeRequest({ "X-Agent-Key": "secret123" }))
    assert.equal(result, null)
  } finally {
    process.env.AGENT_API_KEY = prev
  }
})
