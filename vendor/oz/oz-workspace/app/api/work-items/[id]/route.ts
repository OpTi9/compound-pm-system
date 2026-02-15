import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUserId, AuthError, unauthorizedResponse } from "@/lib/auth-helper"

export const maxDuration = 60

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthenticatedUserId()
    const { id } = await params

    const item = await prisma.workItem.findUnique({
      where: { id },
      include: {
        agent: { select: { id: true, name: true, color: true, icon: true, status: true, activeRoomId: true } },
        room: { select: { id: true, name: true, userId: true } },
        epic: { select: { id: true, title: true, order: true, status: true, prdId: true } },
      },
    })
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!item.room || item.room.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json({
      id: item.id,
      type: item.type,
      status: item.status,
      payload: item.payload,
      chainId: item.chainId,
      sourceItemId: item.sourceItemId,
      iteration: item.iteration,
      maxIterations: item.maxIterations,
      roomId: item.roomId,
      agentId: item.agentId,
      sourceTaskId: item.sourceTaskId,
      epicId: item.epicId,
      claimedAt: item.claimedAt,
      leaseExpiresAt: item.leaseExpiresAt,
      runId: item.runId,
      attempts: item.attempts,
      maxAttempts: item.maxAttempts,
      lastError: item.lastError,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      room: { id: item.room.id, name: item.room.name },
      agent: item.agent,
      epic: item.epic,
    })
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    console.error("GET /api/work-items/[id] error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
