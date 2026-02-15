import test from "node:test"
import assert from "node:assert/strict"

import { runOpenAICompatibleChatStream } from "./openai_compatible"

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

test("runOpenAICompatibleChatStream: accumulates deltas", async () => {
  const prevFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    const payload =
      "data: {\"choices\":[{\"delta\":{\"content\":\"he\"}}]}\n\n" +
      "data: {\"choices\":[{\"delta\":{\"content\":\"llo\"}}]}\n\n" +
      "data: [DONE]\n\n"
    return sseResponse([payload])
  }) as any

  try {
    let seen = ""
    const out = await runOpenAICompatibleChatStream({
      baseUrl: "http://example.com/v1",
      apiKey: "k",
      model: "m",
      messages: [{ role: "user", content: "x" }],
      onDelta: (t) => { seen += t },
    })
    assert.equal(out, "hello")
    assert.equal(seen, "hello")
  } finally {
    globalThis.fetch = prevFetch
  }
})

test("runOpenAICompatibleChatStream: ignores onDelta exceptions", async () => {
  const prevFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    const payload =
      "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\n" +
      "data: [DONE]\n\n"
    return sseResponse([payload])
  }) as any

  try {
    const out = await runOpenAICompatibleChatStream({
      baseUrl: "http://example.com/v1",
      model: "m",
      messages: [{ role: "user", content: "x" }],
      onDelta: () => { throw new Error("boom") },
    })
    assert.equal(out, "ok")
  } finally {
    globalThis.fetch = prevFetch
  }
})
