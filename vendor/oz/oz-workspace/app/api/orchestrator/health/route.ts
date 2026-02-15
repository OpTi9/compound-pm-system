import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUserId, AuthError, unauthorizedResponse } from "@/lib/auth-helper"

export const maxDuration = 60

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId()
    const { searchParams } = new URL(request.url)
    const roomId = (searchParams.get("roomId") || "").trim()

    if (roomId) {
      const room = await prisma.room.findUnique({ where: { id: roomId, userId }, select: { id: true } })
      if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const hb = await prisma.agentCallback.findUnique({ where: { id: "orch:last_tick" }, select: { response: true } }).catch(() => null)
    const lastTickAt = hb?.response ? new Date(hb.response) : null
    const now = new Date()
    const lastTickAgeMs = lastTickAt ? Math.max(0, now.getTime() - lastTickAt.getTime()) : null

    const whereBase: any = roomId ? { roomId } : { room: { userId } }

    const [byStatusRows, oldestQueued] = await Promise.all([
      prisma.workItem.groupBy({
        by: ["status"],
        where: whereBase,
        _count: { _all: true },
      }).catch(() => [] as Array<{ status: string; _count: { _all: number } }>),
      prisma.workItem.findFirst({
        where: { ...whereBase, status: "QUEUED" },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }).catch(() => null),
    ])

    const byStatus: Record<string, number> = {}
    for (const r of byStatusRows) byStatus[r.status] = r._count._all

    const oldestQueuedAgeMs = oldestQueued?.createdAt ? Math.max(0, now.getTime() - oldestQueued.createdAt.getTime()) : null

    // "Stuck" heuristic: running longer than N minutes (default 30m). This is informational only.
    const stuckMs = Math.max(60_000, Number(searchParams.get("stuckMs") || 30 * 60_000))
    const stuckRunning = await prisma.workItem.count({
      where: {
        ...whereBase,
        status: "RUNNING",
        claimedAt: { lt: new Date(now.getTime() - stuckMs) },
      },
    }).catch(() => 0)

    return NextResponse.json({
      now: now.toISOString(),
      scope: roomId ? { roomId } : { userId },
      heartbeat: {
        last_tick_at: lastTickAt ? lastTickAt.toISOString() : null,
        age_ms: lastTickAgeMs,
      },
      queue: {
        by_status: byStatus,
        oldest_queued_age_ms: oldestQueuedAgeMs,
        stuck_running_count: stuckRunning,
      },
    })
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    console.error("GET /api/orchestrator/health error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

