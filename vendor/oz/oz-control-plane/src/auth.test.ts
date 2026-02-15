import test from "node:test"
import assert from "node:assert/strict"

import { requireAuth } from "./auth.js"

test("requireAuth: missing/invalid header -> 401", () => {
  const r1 = requireAuth({ headers: {} })
  assert.equal(r1.ok, false)
  if (r1.ok) throw new Error("unexpected")
  assert.equal(r1.status, 401)

  const r2 = requireAuth({ headers: { authorization: "Basic abc" } })
  assert.equal(r2.ok, false)
})

test("requireAuth: admin key match -> isAdmin", () => {
  const prev = process.env.OZ_ADMIN_API_KEY
  process.env.OZ_ADMIN_API_KEY = "sekret"
  try {
    const r = requireAuth({ headers: { authorization: "Bearer sekret" } })
    assert.equal(r.ok, true)
    if (!r.ok) throw new Error("unexpected")
    assert.equal(r.isAdmin, true)
    assert.equal(r.ownerKeyHash, null)

    const r2 = requireAuth({ headers: { authorization: "Bearer sekret!" } })
    assert.equal(r2.ok, true)
    if (!r2.ok) throw new Error("unexpected")
    assert.equal(r2.isAdmin, false)
  } finally {
    process.env.OZ_ADMIN_API_KEY = prev
  }
})

test("requireAuth: tenant token -> sha256 hash", () => {
  const prev = process.env.OZ_ADMIN_API_KEY
  process.env.OZ_ADMIN_API_KEY = "admin"
  try {
    const r = requireAuth({ headers: { authorization: "Bearer user-token" } })
    assert.equal(r.ok, true)
    if (!r.ok) throw new Error("unexpected")
    assert.equal(r.isAdmin, false)
    assert.match(r.ownerKeyHash, /^[a-f0-9]{64}$/)

    const r2 = requireAuth({ headers: { authorization: "Bearer user-token" } })
    assert.equal(r2.ok, true)
    if (!r2.ok) throw new Error("unexpected")
    assert.equal(r.ownerKeyHash, r2.ownerKeyHash)
  } finally {
    process.env.OZ_ADMIN_API_KEY = prev
  }
})
