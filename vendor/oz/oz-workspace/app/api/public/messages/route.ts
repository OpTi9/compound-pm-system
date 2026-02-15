import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSharedRoomByPublicShareId } from "@/lib/public-share"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"

const AGENT_PUBLIC_SELECT = {
  id: true,
  name: true,
  color: true,
  icon: true,
} as const

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const shareId = searchParams.get("shareId")
  const all = (searchParams.get("all") || "").trim() === "1"
  const before = (searchParams.get("before") || "").trim()
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || "2000"), 1), 2000)
  if (!shareId) return NextResponse.json({ error: "shareId required" }, { status: 400 })

  const ip = getClientIp(request)
  const rl = checkRateLimit(`public:messages:${shareId}:ip:${ip}`, { limit: 120, windowMs: 60_000 })
  if (!rl.ok) {
    const res = NextResponse.json({ error: "Too many requests" }, { status: 429 })
    res.headers.set("Retry-After", String(rl.retryAfterSeconds))
    return res
  }

  const room = await getSharedRoomByPublicShareId(shareId)
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (all) {
    const messages = await prisma.message.findMany({
      where: { roomId: room.id },
      include: {
        agent: { select: AGENT_PUBLIC_SELECT },
      },
      orderBy: { timestamp: "asc" },
    })

    return NextResponse.json(
      messages.map((m) => ({
        id: m.id,
        authorType: m.authorType,
        content: m.content,
        sessionUrl: m.sessionUrl,
        timestamp: m.timestamp,
        author: m.authorType === "agent" ? m.agent : undefined,
      }))
    )
  }

  let cursor: { id: string; timestamp: Date } | null = null
  if (before) {
    const found = await prisma.message.findUnique({ where: { id: before }, select: { id: true, timestamp: true, roomId: true } })
    if (!found || found.roomId !== room.id) {
      return NextResponse.json({ error: "Invalid before cursor" }, { status: 400 })
    }
    cursor = { id: found.id, timestamp: found.timestamp }
  }

  const page = await prisma.message.findMany({
    where: {
      roomId: room.id,
      ...(cursor
        ? {
            OR: [
              { timestamp: { lt: cursor.timestamp } },
              { AND: [{ timestamp: cursor.timestamp }, { id: { lt: cursor.id } }] },
            ],
          }
        : {}),
    },
    include: {
      agent: { select: AGENT_PUBLIC_SELECT },
    },
    orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    take: limit + 1,
  })

  const hasMore = page.length > limit
  const items = (hasMore ? page.slice(0, limit) : page).reverse()

  const res = NextResponse.json(
    items.map((m) => ({
      id: m.id,
      authorType: m.authorType,
      content: m.content,
      sessionUrl: m.sessionUrl,
      timestamp: m.timestamp,
      author: m.authorType === "agent" ? m.agent : undefined,
    }))
  )
  if (hasMore && items[0]?.id) res.headers.set("X-OZ-Next-Cursor", items[0].id)
  if (hasMore) res.headers.set("X-OZ-Truncated", "1")
  return res
}
