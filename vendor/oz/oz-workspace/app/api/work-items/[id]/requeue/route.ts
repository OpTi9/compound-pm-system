import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUserId, AuthError, unauthorizedResponse } from "@/lib/auth-helper"
import { eventBroadcaster } from "@/lib/event-broadcaster"

export const maxDuration = 60

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthenticatedUserId()
    const { id } = await params

    const item = await prisma.workItem.findUnique({
      where: { id },
      select: { id: true, status: true, roomId: true },
    })
    if (!item || !item.roomId) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const room = await prisma.room.findUnique({ where: { id: item.roomId, userId }, select: { id: true } })
    if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (!["FAILED", "CANCELLED"].includes(item.status)) {
      return NextResponse.json({ error: `Cannot requeue from status ${item.status}` }, { status: 409 })
    }

    await prisma.workItem.update({
      where: { id },
      data: {
        status: "QUEUED",
        claimedAt: null,
        leaseExpiresAt: null,
        runId: null,
        lastError: null,
        attempts: 0,
      },
    })

    eventBroadcaster.broadcast({ type: "room", roomId: item.roomId, data: null })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    console.error("POST /api/work-items/[id]/requeue error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

