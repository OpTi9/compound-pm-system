import test from "node:test"
import assert from "node:assert/strict"

import { findMentionMatches, extractMentionedNames } from "./mentions"

// ── findMentionMatches ──

test("findMentionMatches: basic single mention", () => {
  const matches = findMentionMatches("hello @Alice", ["Alice"])
  assert.equal(matches.length, 1)
  assert.equal(matches[0]!.name, "Alice")
  assert.equal(matches[0]!.start, 6)
  assert.equal(matches[0]!.end, 12)
})

test("findMentionMatches: mention at start of string", () => {
  const matches = findMentionMatches("@Bob do this", ["Bob"])
  assert.equal(matches.length, 1)
  assert.equal(matches[0]!.name, "Bob")
})

test("findMentionMatches: multiple mentions", () => {
  const matches = findMentionMatches("@Alice and @Bob please review", ["Alice", "Bob"])
  assert.equal(matches.length, 2)
  assert.equal(matches[0]!.name, "Alice")
  assert.equal(matches[1]!.name, "Bob")
})

test("findMentionMatches: case-insensitive matching", () => {
  const matches = findMentionMatches("@alice please", ["Alice"])
  assert.equal(matches.length, 1)
  assert.equal(matches[0]!.name, "Alice")
})

test("findMentionMatches: no match when name is a prefix of a longer word", () => {
  const matches = findMentionMatches("@Ann-Marie is here", ["Ann"])
  assert.equal(matches.length, 0)
})

test("findMentionMatches: names with spaces", () => {
  const matches = findMentionMatches("hey @Product Lead check this", ["Product Lead"])
  assert.equal(matches.length, 1)
  assert.equal(matches[0]!.name, "Product Lead")
})

test("findMentionMatches: longer name matched first over shorter prefix", () => {
  const matches = findMentionMatches("@Ann-Marie hello", ["Ann", "Ann-Marie"])
  assert.equal(matches.length, 1)
  assert.equal(matches[0]!.name, "Ann-Marie")
})

test("findMentionMatches: mention after punctuation boundary", () => {
  const matches = findMentionMatches("(**@Alice**)", ["Alice"])
  assert.equal(matches.length, 1)
  assert.equal(matches[0]!.name, "Alice")
})

test("findMentionMatches: no match without @ prefix", () => {
  const matches = findMentionMatches("Alice is here", ["Alice"])
  assert.equal(matches.length, 0)
})

test("findMentionMatches: no match when no boundary before @", () => {
  const matches = findMentionMatches("email@Alice.com", ["Alice"])
  assert.equal(matches.length, 0)
})

test("findMentionMatches: empty inputs", () => {
  assert.deepEqual(findMentionMatches("", ["Alice"]), [])
  assert.deepEqual(findMentionMatches("@Alice", []), [])
  assert.deepEqual(findMentionMatches("", []), [])
})

test("findMentionMatches: no candidates match", () => {
  assert.deepEqual(findMentionMatches("@Charlie", ["Alice", "Bob"]), [])
})

test("findMentionMatches: duplicate candidates deduplicated", () => {
  const matches = findMentionMatches("@alice", ["Alice", "alice", "ALICE"])
  assert.equal(matches.length, 1)
})

// ── extractMentionedNames ──

test("extractMentionedNames: returns unique names", () => {
  const names = extractMentionedNames("@Alice and @alice again", ["Alice"])
  assert.deepEqual(names, ["Alice"])
})

test("extractMentionedNames: preserves canonical casing", () => {
  const names = extractMentionedNames("@avery please review", ["Avery"])
  assert.deepEqual(names, ["Avery"])
})

test("extractMentionedNames: multiple distinct mentions", () => {
  const names = extractMentionedNames("@Avery design and @Rex review", ["Avery", "Rex"])
  assert.deepEqual(names, ["Avery", "Rex"])
})

test("extractMentionedNames: empty when no mentions", () => {
  const names = extractMentionedNames("no mentions here", ["Avery", "Rex"])
  assert.deepEqual(names, [])
})
