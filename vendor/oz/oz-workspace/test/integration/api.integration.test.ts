import test, { before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const testDb = require("./test-db.ts") as { setupTestDb: () => Promise<{ dbUrl: string; cleanup: () => void }> }

type Mod<T> = Promise<T>

let cleanup: (() => void) | null = null
let prisma: typeof import("@/lib/prisma").prisma
let tasksRoute: Awaited<Mod<typeof import("@/app/api/tasks/route")>>
let prdsRoute: Awaited<Mod<typeof import("@/app/api/prds/route")>>
let workItemsRoute: Awaited<Mod<typeof import("@/app/api/work-items/route")>>
let eventsRoute: Awaited<Mod<typeof import("@/app/api/events/route")>>
let eventBroadcaster: typeof import("@/lib/event-broadcaster").eventBroadcaster
let NextRequestCtor: typeof import("next/server").NextRequest

const TEST_USER_ID = "test_user_1"
process.env.OZ_TEST_USER_ID = TEST_USER_ID

async function truncateAllTables() {
  // Delete all rows from all tables (except Prisma's migration table).
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name <> '_prisma_migrations'
  `
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys=OFF;")
  for (const r of rows) {
    // Table names come from sqlite_master, not user input.
    await prisma.$executeRawUnsafe(`DELETE FROM "${r.name}";`)
  }
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys=ON;")
}

async function seedRoom() {
  await prisma.user.create({
    data: { id: TEST_USER_ID, name: "Test", email: "test@example.com", passwordHash: "x" },
  })
  const room = await prisma.room.create({
    data: { id: "room_1", name: "Room", userId: TEST_USER_ID },
    select: { id: true },
  })
  return room.id
}

before(async () => {
  const db = await testDb.setupTestDb()
  cleanup = db.cleanup

  // Import AFTER env is set, so prisma binds to the test DB.
  prisma = (await import("@/lib/prisma")).prisma
  tasksRoute = await import("@/app/api/tasks/route")
  prdsRoute = await import("@/app/api/prds/route")
  workItemsRoute = await import("@/app/api/work-items/route")
  eventsRoute = await import("@/app/api/events/route")
  eventBroadcaster = (await import("@/lib/event-broadcaster")).eventBroadcaster
  NextRequestCtor = (await import("next/server")).NextRequest
})

after(async () => {
  if (prisma) await prisma.$disconnect().catch(() => {})
  if (cleanup) cleanup()
})

beforeEach(async () => {
  await truncateAllTables()
})

test("tasks: rejects invalid status and creates task with normalized status", async () => {
  const roomId = await seedRoom()

  {
    const req = new Request("http://test.local/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId, title: "T", status: "garbage" }),
    })
    const res = await tasksRoute.POST(req)
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.match(body.error, /Invalid status/i)
  }

  {
    const req = new Request("http://test.local/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId, title: "T2", status: "in_progress", priority: "high" }),
    })
    const res = await tasksRoute.POST(req)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.status, "in_progress")
    assert.equal(body.priority, "high")
    assert.equal(body.roomId, roomId)
  }
})

test("prds: cursor pagination returns nextCursor and respects ordering", async () => {
  const roomId = await seedRoom()

  // Create 3 PRDs and force distinct updatedAt values so ordering is deterministic.
  const p1 = await prisma.prd.create({ data: { id: "prd_1", roomId, title: "1", content: "", status: "DRAFT", createdBy: TEST_USER_ID } })
  const p2 = await prisma.prd.create({ data: { id: "prd_2", roomId, title: "2", content: "", status: "DRAFT", createdBy: TEST_USER_ID } })
  const p3 = await prisma.prd.create({ data: { id: "prd_3", roomId, title: "3", content: "", status: "DRAFT", createdBy: TEST_USER_ID } })
  await prisma.prd.update({ where: { id: p1.id }, data: { updatedAt: new Date("2026-01-01T00:00:01.000Z") } })
  await prisma.prd.update({ where: { id: p2.id }, data: { updatedAt: new Date("2026-01-01T00:00:02.000Z") } })
  await prisma.prd.update({ where: { id: p3.id }, data: { updatedAt: new Date("2026-01-01T00:00:03.000Z") } })

  const url1 = new URL("http://test.local/api/prds")
  url1.searchParams.set("roomId", roomId)
  url1.searchParams.set("limit", "2")
  const res1 = await prdsRoute.GET(new Request(url1.toString()))
  assert.equal(res1.status, 200)
  const body1 = await res1.json()
  assert.equal(body1.items.length, 2)
  assert.equal(body1.items[0].id, "prd_3")
  assert.equal(body1.items[1].id, "prd_2")
  assert.ok(typeof body1.nextCursor === "string" && body1.nextCursor.includes("|"))

  const url2 = new URL("http://test.local/api/prds")
  url2.searchParams.set("roomId", roomId)
  url2.searchParams.set("limit", "2")
  url2.searchParams.set("cursor", body1.nextCursor)
  const res2 = await prdsRoute.GET(new Request(url2.toString()))
  assert.equal(res2.status, 200)
  const body2 = await res2.json()
  assert.equal(body2.items.length, 1)
  assert.equal(body2.items[0].id, "prd_1")
  assert.equal(body2.nextCursor, null)
})

test("work-items: cursor pagination works for descending list", async () => {
  const roomId = await seedRoom()

  await prisma.workItem.create({
    data: { id: "w1", type: "task", status: "QUEUED", payload: "{}", roomId, createdAt: new Date("2026-01-01T00:00:01.000Z") },
  })
  await prisma.workItem.create({
    data: { id: "w2", type: "task", status: "QUEUED", payload: "{}", roomId, createdAt: new Date("2026-01-01T00:00:02.000Z") },
  })
  await prisma.workItem.create({
    data: { id: "w3", type: "task", status: "QUEUED", payload: "{}", roomId, createdAt: new Date("2026-01-01T00:00:03.000Z") },
  })

  const url1 = new URL("http://test.local/api/work-items")
  url1.searchParams.set("roomId", roomId)
  url1.searchParams.set("limit", "2")
  const res1 = await workItemsRoute.GET(new Request(url1.toString()))
  assert.equal(res1.status, 200)
  const body1 = await res1.json()
  assert.equal(body1.items.length, 2)
  assert.equal(body1.items[0].id, "w3")
  assert.equal(body1.items[1].id, "w2")
  assert.ok(typeof body1.nextCursor === "string" && body1.nextCursor.includes("|"))

  const url2 = new URL("http://test.local/api/work-items")
  url2.searchParams.set("roomId", roomId)
  url2.searchParams.set("limit", "2")
  url2.searchParams.set("cursor", body1.nextCursor)
  const res2 = await workItemsRoute.GET(new Request(url2.toString()))
  assert.equal(res2.status, 200)
  const body2 = await res2.json()
  assert.equal(body2.items.length, 1)
  assert.equal(body2.items[0].id, "w1")
  assert.equal(body2.nextCursor, null)
})

test("events SSE: in-memory subscription receives broadcast events", async () => {
  const roomId = await seedRoom()

  const ac = new AbortController()
  const req = new NextRequestCtor(`http://test.local/api/events?roomId=${roomId}`, { signal: ac.signal })
  const res = await eventsRoute.GET(req)
  assert.equal(res.status, 200)
  assert.match(res.headers.get("content-type") || "", /text\/event-stream/i)
  assert.ok(res.body)

  const reader = res.body!.getReader()
  const dec = new TextDecoder()

  const first = await reader.read()
  assert.equal(first.done, false)
  const firstText = dec.decode(first.value)
  assert.match(firstText, /event: heartbeat/)

  eventBroadcaster.broadcast({ type: "room", roomId, data: { hello: "world" } })

  const second = await reader.read()
  assert.equal(second.done, false)
  const secondText = dec.decode(second.value)
  assert.match(secondText, /event: room/)
  assert.match(secondText, /\"hello\":\"world\"/)

  ac.abort()
  await reader.cancel().catch(() => {})
})
