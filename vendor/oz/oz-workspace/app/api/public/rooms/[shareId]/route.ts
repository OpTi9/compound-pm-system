import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"

const AGENT_PUBLIC_SELECT = {
  id: true,
  name: true,
  color: true,
  icon: true,
} as const

export async function GET(_req: Request, { params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params

  const ip = getClientIp(_req)
  const rl = checkRateLimit(`public:room:${shareId}:ip:${ip}`, { limit: 60, windowMs: 60_000 })
  if (!rl.ok) {
    const res = NextResponse.json({ error: "Too many requests" }, { status: 429 })
    res.headers.set("Retry-After", String(rl.retryAfterSeconds))
    return res
  }

  const room = await prisma.room.findUnique({
    where: { publicShareId: shareId },
    include: {
      agents: { include: { agent: { select: AGENT_PUBLIC_SELECT } } },
    },
  })

  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
    shareId,
    name: room.name,
    description: room.description,
    createdAt: room.createdAt,
    agents: room.agents.map((ra) => ra.agent),
  })
}
