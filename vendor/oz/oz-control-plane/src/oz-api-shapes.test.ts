import test from "node:test"
import assert from "node:assert/strict"

import { harnessFromModelId } from "./oz-api-shapes.js"

test("harnessFromModelId: maps known strings", () => {
  assert.equal(harnessFromModelId("claude-3.5"), "claude-code")
  assert.equal(harnessFromModelId("CODEX"), "codex")
  assert.equal(harnessFromModelId("glm-4"), "glm")
  assert.equal(harnessFromModelId("kimi"), "kimi")
  assert.equal(harnessFromModelId("gemini"), "gemini-cli")
})

test("harnessFromModelId: default from env", () => {
  const prev = process.env.OZ_OZAPI_DEFAULT_HARNESS
  process.env.OZ_OZAPI_DEFAULT_HARNESS = "custom"
  try {
    assert.equal(harnessFromModelId("unknown"), "custom")
  } finally {
    process.env.OZ_OZAPI_DEFAULT_HARNESS = prev
  }
})
