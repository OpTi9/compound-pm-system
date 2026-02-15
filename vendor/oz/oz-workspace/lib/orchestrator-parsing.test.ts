import test from "node:test"
import assert from "node:assert/strict"

import {
  truncate,
  safeJsonParse,
  envInt,
  envStr,
  parseReviewOutcome,
  extractJsonBlock,
  normalizeDecomposeTask,
  parseDecomposePlan,
  parseLearnings,
} from "./orchestrator-parsing"

// ── truncate ──

test("truncate: returns short strings unchanged", () => {
  assert.equal(truncate("hello", 10), "hello")
})

test("truncate: truncates long strings with char count", () => {
  const result = truncate("abcdefghij", 5)
  assert.ok(result.startsWith("abcde"))
  assert.ok(result.includes("[truncated 5 chars]"))
})

test("truncate: exact length is not truncated", () => {
  assert.equal(truncate("abc", 3), "abc")
})

// ── safeJsonParse ──

test("safeJsonParse: parses valid JSON", () => {
  assert.deepEqual(safeJsonParse('{"a":1}', {}), { a: 1 })
})

test("safeJsonParse: returns fallback on invalid JSON", () => {
  assert.deepEqual(safeJsonParse("not json", { x: 1 }), { x: 1 })
})

test("safeJsonParse: returns fallback on empty string", () => {
  assert.deepEqual(safeJsonParse("", []), [])
})

// ── envInt ──

test("envInt: returns env value when set", () => {
  const prev = process.env.TEST_ENVINT
  process.env.TEST_ENVINT = "42"
  try {
    assert.equal(envInt("TEST_ENVINT", 10), 42)
  } finally {
    process.env.TEST_ENVINT = prev
  }
})

test("envInt: returns fallback when not set", () => {
  delete process.env.TEST_ENVINT_MISSING
  assert.equal(envInt("TEST_ENVINT_MISSING", 99), 99)
})

test("envInt: returns fallback for non-numeric value", () => {
  const prev = process.env.TEST_ENVINT_BAD
  process.env.TEST_ENVINT_BAD = "abc"
  try {
    assert.equal(envInt("TEST_ENVINT_BAD", 7), 7)
  } finally {
    process.env.TEST_ENVINT_BAD = prev
  }
})

test("envInt: handles whitespace-only value", () => {
  const prev = process.env.TEST_ENVINT_WS
  process.env.TEST_ENVINT_WS = "   "
  try {
    assert.equal(envInt("TEST_ENVINT_WS", 5), 5)
  } finally {
    process.env.TEST_ENVINT_WS = prev
  }
})

// ── envStr ──

test("envStr: returns trimmed value when set", () => {
  const prev = process.env.TEST_ENVSTR
  process.env.TEST_ENVSTR = "  hello  "
  try {
    assert.equal(envStr("TEST_ENVSTR"), "hello")
  } finally {
    process.env.TEST_ENVSTR = prev
  }
})

test("envStr: returns undefined when not set", () => {
  delete process.env.TEST_ENVSTR_MISSING
  assert.equal(envStr("TEST_ENVSTR_MISSING"), undefined)
})

test("envStr: returns undefined for whitespace-only value", () => {
  const prev = process.env.TEST_ENVSTR_WS
  process.env.TEST_ENVSTR_WS = "   "
  try {
    assert.equal(envStr("TEST_ENVSTR_WS"), undefined)
  } finally {
    process.env.TEST_ENVSTR_WS = prev
  }
})

// ── parseReviewOutcome ──

test("parseReviewOutcome: APPROVED on first line", () => {
  const r = parseReviewOutcome("APPROVED\nLooks good.")
  assert.notEqual(r, null)
  assert.equal(r!.outcome, "APPROVED")
})

test("parseReviewOutcome: CHANGES_NEEDED on first line", () => {
  const r = parseReviewOutcome("CHANGES_NEEDED\nFix the tests.")
  assert.notEqual(r, null)
  assert.equal(r!.outcome, "CHANGES_NEEDED")
})

test("parseReviewOutcome: APPROVED anywhere in text", () => {
  const r = parseReviewOutcome("Overall review:\nThis is APPROVED by the team.")
  assert.notEqual(r, null)
  assert.equal(r!.outcome, "APPROVED")
})

test("parseReviewOutcome: CHANGES_NEEDED takes priority when both present", () => {
  const r = parseReviewOutcome("Not APPROVED because CHANGES_NEEDED in the auth module.")
  assert.notEqual(r, null)
  assert.equal(r!.outcome, "CHANGES_NEEDED")
})

test("parseReviewOutcome: returns null for empty/unclear text", () => {
  assert.equal(parseReviewOutcome(""), null)
  assert.equal(parseReviewOutcome("Some random feedback"), null)
  assert.equal(parseReviewOutcome("   "), null)
})

test("parseReviewOutcome: details contain the full text", () => {
  const input = "APPROVED\nAll looks great!"
  const r = parseReviewOutcome(input)
  assert.equal(r!.details, input)
})

test("parseReviewOutcome: case-insensitive first-line matching", () => {
  // First line is upper-cased for comparison, so "Approved" first line works
  const r = parseReviewOutcome("Approved - great job")
  assert.notEqual(r, null)
  assert.equal(r!.outcome, "APPROVED")
})

// ── extractJsonBlock ──

test("extractJsonBlock: extracts from json code fence", () => {
  const text = 'Some text\n```json\n{"key": "value"}\n```\nMore text'
  assert.equal(extractJsonBlock(text), '{"key": "value"}')
})

test("extractJsonBlock: extracts from bare braces", () => {
  const text = 'Here is the plan: {"tasks": [1,2,3]} done.'
  assert.equal(extractJsonBlock(text), '{"tasks": [1,2,3]}')
})

test("extractJsonBlock: returns null for no JSON", () => {
  assert.equal(extractJsonBlock("no json here"), null)
  assert.equal(extractJsonBlock(""), null)
})

test("extractJsonBlock: prefers code fence over bare braces", () => {
  const text = '{"outer": true}\n```json\n{"inner": true}\n```'
  assert.equal(extractJsonBlock(text), '{"inner": true}')
})

test("extractJsonBlock: handles nested braces in bare extraction", () => {
  const text = 'Result: {"a": {"b": 1}}'
  const result = extractJsonBlock(text)
  assert.equal(result, '{"a": {"b": 1}}')
})

// ── normalizeDecomposeTask ──

test("normalizeDecomposeTask: valid task", () => {
  const t = normalizeDecomposeTask({ title: "Fix auth", prompt: "Fix the auth bug" })
  assert.deepEqual(t, { title: "Fix auth", prompt: "Fix the auth bug" })
})

test("normalizeDecomposeTask: with agentId", () => {
  const t = normalizeDecomposeTask({ title: "Review", prompt: "Review code", agentId: "agent_1" })
  assert.deepEqual(t, { title: "Review", prompt: "Review code", agentId: "agent_1" })
})

test("normalizeDecomposeTask: trims whitespace", () => {
  const t = normalizeDecomposeTask({ title: "  Fix  ", prompt: "  Do it  ", agentId: "  " })
  assert.deepEqual(t, { title: "Fix", prompt: "Do it" })
})

test("normalizeDecomposeTask: returns null when title missing", () => {
  assert.equal(normalizeDecomposeTask({ prompt: "Do something" }), null)
  assert.equal(normalizeDecomposeTask({ title: "", prompt: "Do something" }), null)
})

test("normalizeDecomposeTask: returns null when prompt missing", () => {
  assert.equal(normalizeDecomposeTask({ title: "Task" }), null)
  assert.equal(normalizeDecomposeTask({ title: "Task", prompt: "" }), null)
})

test("normalizeDecomposeTask: returns null for null/undefined", () => {
  assert.equal(normalizeDecomposeTask(null), null)
  assert.equal(normalizeDecomposeTask(undefined), null)
})

// ── parseDecomposePlan ──

test("parseDecomposePlan: parses flat task list", () => {
  const input = '```json\n{"tasks": [{"title": "T1", "prompt": "Do T1"}, {"title": "T2", "prompt": "Do T2"}]}\n```'
  const plan = parseDecomposePlan(input)
  assert.notEqual(plan, null)
  assert.equal(plan!.epics, null)
  assert.equal(plan!.tasks!.length, 2)
  assert.equal(plan!.tasks![0]!.title, "T1")
})

test("parseDecomposePlan: parses epic structure", () => {
  const input = '```json\n{"epics": [{"title": "Epic 1", "tasks": [{"title": "T1", "prompt": "P1"}]}]}\n```'
  const plan = parseDecomposePlan(input)
  assert.notEqual(plan, null)
  assert.equal(plan!.tasks, null)
  assert.equal(plan!.epics!.length, 1)
  assert.equal(plan!.epics![0]!.title, "Epic 1")
  assert.equal(plan!.epics![0]!.tasks.length, 1)
})

test("parseDecomposePlan: skips epics with no valid tasks", () => {
  const input = '```json\n{"epics": [{"title": "Empty", "tasks": [{"title": "", "prompt": ""}]}]}\n```'
  assert.equal(parseDecomposePlan(input), null)
})

test("parseDecomposePlan: skips invalid tasks in flat list", () => {
  const input = '```json\n{"tasks": [{"title": "Good", "prompt": "P"}, {"title": "", "prompt": ""}]}\n```'
  const plan = parseDecomposePlan(input)
  assert.notEqual(plan, null)
  assert.equal(plan!.tasks!.length, 1)
})

test("parseDecomposePlan: returns null for empty text", () => {
  assert.equal(parseDecomposePlan(""), null)
})

test("parseDecomposePlan: returns null for non-JSON text", () => {
  assert.equal(parseDecomposePlan("just some text"), null)
})

test("parseDecomposePlan: returns null for malformed JSON", () => {
  assert.equal(parseDecomposePlan('```json\n{broken}\n```'), null)
})

test("parseDecomposePlan: returns null when tasks array is empty", () => {
  assert.equal(parseDecomposePlan('```json\n{"tasks": []}\n```'), null)
})

test("parseDecomposePlan: epics take priority over tasks when both present", () => {
  const input = '```json\n{"epics": [{"title": "E1", "tasks": [{"title": "T", "prompt": "P"}]}], "tasks": [{"title": "T2", "prompt": "P2"}]}\n```'
  const plan = parseDecomposePlan(input)
  assert.notEqual(plan, null)
  assert.equal(plan!.tasks, null)
  assert.equal(plan!.epics!.length, 1)
})

// ── parseLearnings ──

test("parseLearnings: parses learnings array", () => {
  const input = '```json\n{"learnings": [{"title": "L1", "content": "C1", "kind": "pattern"}]}\n```'
  const result = parseLearnings(input)
  assert.notEqual(result, null)
  assert.equal(result!.length, 1)
  assert.equal(result![0]!.title, "L1")
  assert.equal(result![0]!.kind, "pattern")
})

test("parseLearnings: accepts knowledge key", () => {
  const input = '```json\n{"knowledge": [{"title": "K1", "content": "C1"}]}\n```'
  const result = parseLearnings(input)
  assert.notEqual(result, null)
  assert.equal(result!.length, 1)
})

test("parseLearnings: accepts items key", () => {
  const input = '```json\n{"items": [{"title": "I1", "content": "C1"}]}\n```'
  const result = parseLearnings(input)
  assert.notEqual(result, null)
  assert.equal(result!.length, 1)
})

test("parseLearnings: skips entries without title or content", () => {
  const input = '```json\n{"learnings": [{"title": "", "content": "C"}, {"title": "T", "content": ""}, {"title": "Good", "content": "Valid"}]}\n```'
  const result = parseLearnings(input)
  assert.notEqual(result, null)
  assert.equal(result!.length, 1)
  assert.equal(result![0]!.title, "Good")
})

test("parseLearnings: returns null for empty text", () => {
  assert.equal(parseLearnings(""), null)
})

test("parseLearnings: returns null when no recognized array key", () => {
  assert.equal(parseLearnings('```json\n{"other": [{"title": "T", "content": "C"}]}\n```'), null)
})

test("parseLearnings: returns null when all entries invalid", () => {
  assert.equal(parseLearnings('```json\n{"learnings": [{"title": "", "content": ""}]}\n```'), null)
})

test("parseLearnings: handles tags", () => {
  const input = '```json\n{"learnings": [{"title": "T", "content": "C", "tags": ["a", "b"]}]}\n```'
  const result = parseLearnings(input)
  assert.deepEqual(result![0]!.tags, ["a", "b"])
})

test("parseLearnings: filters non-string tags", () => {
  const input = '```json\n{"learnings": [{"title": "T", "content": "C", "tags": ["good", 123, null, "ok"]}]}\n```'
  const result = parseLearnings(input)
  assert.deepEqual(result![0]!.tags, ["good", "ok"])
})

test("parseLearnings: limits tags to 20", () => {
  const tags = Array.from({ length: 30 }, (_, i) => `tag${i}`)
  const input = `\`\`\`json\n{"learnings": [{"title": "T", "content": "C", "tags": ${JSON.stringify(tags)}}]}\n\`\`\``
  const result = parseLearnings(input)
  assert.equal(result![0]!.tags!.length, 20)
})
