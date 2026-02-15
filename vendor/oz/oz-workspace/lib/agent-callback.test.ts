import test from "node:test"
import assert from "node:assert/strict"

import { encodeAgentCallbackPayload, tryDecodeAgentCallbackPayload } from "./agent-callback"

test("encodeAgentCallbackPayload: round-trips with decode", () => {
  const payload = {
    version: 1 as const,
    roomId: "room_123",
    agentId: "agent_456",
    userId: "user_789",
    message: "Hello world",
  }
  const encoded = encodeAgentCallbackPayload(payload)
  const decoded = tryDecodeAgentCallbackPayload(encoded)
  assert.deepEqual(decoded, payload)
})

test("tryDecodeAgentCallbackPayload: handles null userId and message", () => {
  const payload = {
    version: 1 as const,
    roomId: "room_1",
    agentId: "agent_1",
    userId: null,
    message: null,
  }
  const decoded = tryDecodeAgentCallbackPayload(encodeAgentCallbackPayload(payload))
  assert.deepEqual(decoded, payload)
})

test("tryDecodeAgentCallbackPayload: returns null for plain text", () => {
  assert.equal(tryDecodeAgentCallbackPayload("just a regular response"), null)
})

test("tryDecodeAgentCallbackPayload: returns null for non-v1 JSON", () => {
  assert.equal(tryDecodeAgentCallbackPayload(JSON.stringify({ version: 2, roomId: "r", agentId: "a" })), null)
})

test("tryDecodeAgentCallbackPayload: returns null for missing roomId", () => {
  assert.equal(tryDecodeAgentCallbackPayload(JSON.stringify({ version: 1, agentId: "a" })), null)
})

test("tryDecodeAgentCallbackPayload: returns null for missing agentId", () => {
  assert.equal(tryDecodeAgentCallbackPayload(JSON.stringify({ version: 1, roomId: "r" })), null)
})

test("tryDecodeAgentCallbackPayload: returns null for empty roomId", () => {
  assert.equal(tryDecodeAgentCallbackPayload(JSON.stringify({ version: 1, roomId: "", agentId: "a" })), null)
})

test("tryDecodeAgentCallbackPayload: returns null for non-string input", () => {
  assert.equal(tryDecodeAgentCallbackPayload(123 as any), null)
  assert.equal(tryDecodeAgentCallbackPayload(null as any), null)
})

test("tryDecodeAgentCallbackPayload: returns null for malformed JSON", () => {
  assert.equal(tryDecodeAgentCallbackPayload("{broken json"), null)
})

test("tryDecodeAgentCallbackPayload: tolerates leading whitespace/newlines", () => {
  const decoded = tryDecodeAgentCallbackPayload(
    "\n  " + JSON.stringify({ version: 1, roomId: "r", agentId: "a", userId: null, message: "m" })
  )
  assert.notEqual(decoded, null)
  assert.equal(decoded!.roomId, "r")
  assert.equal(decoded!.agentId, "a")
  assert.equal(decoded!.message, "m")
})

test("tryDecodeAgentCallbackPayload: defaults undefined userId/message to null", () => {
  const decoded = tryDecodeAgentCallbackPayload(
    JSON.stringify({ version: 1, roomId: "r", agentId: "a" })
  )
  assert.notEqual(decoded, null)
  assert.equal(decoded!.userId, null)
  assert.equal(decoded!.message, null)
})
