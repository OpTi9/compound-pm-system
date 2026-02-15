import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUserId, AuthError, unauthorizedResponse } from "@/lib/auth-helper"
import { eventBroadcaster, type BroadcastEvent } from "@/lib/event-broadcaster"
import { normalizeTaskPriority, normalizeTaskStatus } from "@/lib/validation"

const AGENT_SELECT = {
  id: true,
  name: true,
  color: true,
  icon: true,
  status: true,
  activeRoomId: true,
}

async function broadcastEvent(event: BroadcastEvent): Promise<void> {
  const strict = (process.env.OZ_REDIS_EVENTS_STRICT || "").trim() === "1"
  const durable = strict || (process.env.OZ_REDIS_EVENTS_DURABLE || "").trim() === "1"
  if (strict) {
    await eventBroadcaster.broadcastStrictAsync(event)
    return
  }
  if (durable) {
    await eventBroadcaster.broadcastAsync(event)
    return
  }
  eventBroadcaster.broadcast(event)
}

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId()
    const { searchParams } = new URL(request.url)
    const roomId = searchParams.get("roomId")
    if (!roomId) return NextResponse.json({ error: "roomId required" }, { status: 400 })

    const room = await prisma.room.findUnique({ where: { id: roomId, userId } })
    if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const tasks = await prisma.task.findMany({
      where: { roomId },
      include: {
        assignee: { select: AGENT_SELECT },
        creator: { select: AGENT_SELECT },
      },
      orderBy: { createdAt: "asc" },
    })

    return NextResponse.json(tasks)
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    console.error("GET /api/tasks error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId()
    const body = await request.json()
    const { roomId, title, description, status, priority, assigneeId, createdBy } = body

    if (!roomId || !title) {
      return NextResponse.json({ error: "roomId and title are required" }, { status: 400 })
    }

    const normalizedStatus = status === undefined ? "backlog" : normalizeTaskStatus(status)
    if (!normalizedStatus) {
      return NextResponse.json({ error: 'Invalid status (expected "backlog", "in_progress", or "done")' }, { status: 400 })
    }
    const normalizedPriority = priority === undefined ? "medium" : normalizeTaskPriority(priority)
    if (!normalizedPriority) {
      return NextResponse.json({ error: 'Invalid priority (expected "low", "medium", or "high")' }, { status: 400 })
    }

    const room = await prisma.room.findUnique({ where: { id: roomId, userId } })
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 })

    const task = await prisma.task.create({
      data: {
        title,
        description: description ?? "",
        status: normalizedStatus,
        priority: normalizedPriority,
        userId,
        roomId,
        assigneeId: assigneeId ?? null,
        createdBy: createdBy ?? null,
      },
      include: {
        assignee: { select: AGENT_SELECT },
        creator: { select: AGENT_SELECT },
      },
    })

    // Broadcast new task to SSE subscribers
    await broadcastEvent({
      type: "task",
      roomId,
      data: { action: "created", task },
    })

    return NextResponse.json(task)
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    console.error("POST /api/tasks error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
