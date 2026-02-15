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
  if (!shareId) return NextResponse.json({ error: "shareId required" }, { status: 400 })

  const ip = getClientIp(request)
  const rl = checkRateLimit(`public:tasks:${shareId}:ip:${ip}`, { limit: 60, windowMs: 60_000 })
  if (!rl.ok) {
    const res = NextResponse.json({ error: "Too many requests" }, { status: 429 })
    res.headers.set("Retry-After", String(rl.retryAfterSeconds))
    return res
  }

  const room = await getSharedRoomByPublicShareId(shareId)
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const tasks = await prisma.task.findMany({
    where: { roomId: room.id },
    include: {
      assignee: { select: AGENT_PUBLIC_SELECT },
    },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json(
    tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      assignee: t.assignee,
    }))
  )
}
