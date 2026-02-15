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
      select: { id: true, status: true, roomId: true, runId: true },
    })
    if (!item || !item.roomId) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const room = await prisma.room.findUnique({ where: { id: item.roomId, userId }, select: { id: true } })
    if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (!["QUEUED", "CLAIMED", "RUNNING"].includes(item.status)) {
      return NextResponse.json({ error: `Cannot cancel from status ${item.status}` }, { status: 409 })
    }

    await prisma.workItem.update({
      where: { id },
      data: {
        status: "CANCELLED",
        leaseExpiresAt: null,
        lastError: "Cancelled by user",
      },
    })

    // Best-effort: also cancel the local AgentRun (if present).
    if (item.runId) {
      await prisma.agentRun.updateMany({
        where: { id: item.runId, state: { notIn: ["SUCCEEDED", "FAILED", "CANCELLED"] } },
        data: { state: "CANCELLED", completedAt: new Date(), errorMessage: "Cancelled" },
      }).catch(() => {})
    }

    eventBroadcaster.broadcast({ type: "room", roomId: item.roomId, data: null })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    console.error("POST /api/work-items/[id]/cancel error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

