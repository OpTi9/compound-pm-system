import test from "node:test"
import assert from "node:assert/strict"

import { checkRateLimit } from "./rate-limit"

test("checkRateLimit: enforces limit per window", () => {
  const origNow = Date.now
  try {
    let t = 1_000_000
    Date.now = () => t

    const key = `t:${Math.random()}`
    assert.deepEqual(checkRateLimit(key, { limit: 2, windowMs: 10_000 }), { ok: true })
    assert.deepEqual(checkRateLimit(key, { limit: 2, windowMs: 10_000 }), { ok: true })

    const third = checkRateLimit(key, { limit: 2, windowMs: 10_000 })
    assert.equal(third.ok, false)
    if (third.ok) throw new Error("unexpected")
    assert.ok(third.retryAfterSeconds >= 1)

    // Advance time past window: should allow again.
    t += 10_001
    assert.deepEqual(checkRateLimit(key, { limit: 2, windowMs: 10_000 }), { ok: true })
  } finally {
    Date.now = origNow
  }
})

