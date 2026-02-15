import test from "node:test"
import assert from "node:assert/strict"

import {
  normalizePrdStatus,
  normalizeTaskPriority,
  normalizeTaskStatus,
  normalizeWorkItemStatus,
} from "./validation"

test("normalizeTaskStatus", () => {
  assert.equal(normalizeTaskStatus("backlog"), "backlog")
  assert.equal(normalizeTaskStatus(" in_progress "), "in_progress")
  assert.equal(normalizeTaskStatus("done"), "done")
  assert.equal(normalizeTaskStatus("DONE"), null)
  assert.equal(normalizeTaskStatus(""), null)
  assert.equal(normalizeTaskStatus(null), null)
})

test("normalizeTaskPriority", () => {
  assert.equal(normalizeTaskPriority("low"), "low")
  assert.equal(normalizeTaskPriority(" medium "), "medium")
  assert.equal(normalizeTaskPriority("high"), "high")
  assert.equal(normalizeTaskPriority("HIGH"), null)
  assert.equal(normalizeTaskPriority(undefined), null)
})

test("normalizeWorkItemStatus", () => {
  assert.equal(normalizeWorkItemStatus("queued"), "QUEUED")
  assert.equal(normalizeWorkItemStatus(" RUNNING "), "RUNNING")
  assert.equal(normalizeWorkItemStatus("nope"), null)
  assert.equal(normalizeWorkItemStatus(123), null)
})

test("normalizePrdStatus", () => {
  assert.equal(normalizePrdStatus("draft"), "DRAFT")
  assert.equal(normalizePrdStatus(" decomposing "), "DECOMPOSING")
  assert.equal(normalizePrdStatus("active"), "ACTIVE")
  assert.equal(normalizePrdStatus("completed"), "COMPLETED")
  assert.equal(normalizePrdStatus("backlog"), null)
})

