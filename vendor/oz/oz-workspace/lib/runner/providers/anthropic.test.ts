import test from "node:test"
import assert from "node:assert/strict"

import { runAnthropicMessagesStream } from "./anthropic"

function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

test("runAnthropicMessagesStream: accumulates deltas", async () => {
  const prevFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    const payload =
      "event: content_block_delta\n" +
      "data: {\"delta\":{\"text\":\"hi\"}}\n\n" +
      "event: content_block_delta\n" +
      "data: {\"delta\":{\"text\":\"!\"}}\n\n"
    return sseResponse([payload])
  }) as any

  try {
    let seen = ""
    const out = await runAnthropicMessagesStream({
      apiKey: "k",
      model: "m",
      messages: [{ role: "user", content: "x" }],
      onDelta: (t) => { seen += t },
    })
    assert.equal(out, "hi!")
    assert.equal(seen, "hi!")
  } finally {
    globalThis.fetch = prevFetch
  }
})

test("runAnthropicMessagesStream: ignores onDelta exceptions", async () => {
  const prevFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    const payload =
      "event: content_block_delta\n" +
      "data: {\"delta\":{\"text\":\"ok\"}}\n\n"
    return sseResponse([payload])
  }) as any

  try {
    const out = await runAnthropicMessagesStream({
      apiKey: "k",
      model: "m",
      messages: [{ role: "user", content: "x" }],
      onDelta: () => { throw new Error("boom") },
    })
    assert.equal(out, "ok")
  } finally {
    globalThis.fetch = prevFetch
  }
})
