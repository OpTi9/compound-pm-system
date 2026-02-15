import test from "node:test"
import assert from "node:assert/strict"

import { eventBroadcaster } from "@/lib/event-broadcaster"

test("eventBroadcaster.getStats() returns a stable shape", () => {
  const stats = eventBroadcaster.getStats()
  assert.equal(typeof stats.hasRedis, "boolean")
  assert.ok(stats.redis_xadd)
  assert.equal(typeof stats.redis_xadd.ok, "number")
  assert.equal(typeof stats.redis_xadd.fail, "number")
})

test("broadcastAsync/broadcastStrictAsync do not throw when Redis is not configured", async () => {
  const roomId = "room_test"
  await eventBroadcaster.broadcastAsync({ type: "room", roomId, data: { a: 1 } })
  await eventBroadcaster.broadcastStrictAsync({ type: "room", roomId, data: { b: 2 } })
})

