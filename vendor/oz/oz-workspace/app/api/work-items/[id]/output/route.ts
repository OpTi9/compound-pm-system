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
      select: { id: true, roomId: true, runId: true },
    })
    if (!item || !item.roomId) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const room = await prisma.room.findUnique({ where: { id: item.roomId, userId }, select: { id: true } })
    if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (!item.runId) {
      return NextResponse.json({
        runId: null,
        message: null,
        run: null,
      })
    }

    const [message, run] = await Promise.all([
      prisma.message.findUnique({
        where: { id: item.runId },
        select: { id: true, content: true, sessionUrl: true, timestamp: true, authorId: true, authorType: true },
      }).catch(() => null),
      prisma.agentRun.findUnique({
        where: { id: item.runId },
        select: { id: true, state: true, errorMessage: true, queuedAt: true, startedAt: true, completedAt: true, updatedAt: true },
      }).catch(() => null),
    ])

    return NextResponse.json({
      runId: item.runId,
      message,
      run,
    })
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    console.error("GET /api/work-items/[id]/output error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

