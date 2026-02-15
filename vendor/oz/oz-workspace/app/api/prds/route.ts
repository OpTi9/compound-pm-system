import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUserId, AuthError, unauthorizedResponse } from "@/lib/auth-helper"
import { eventBroadcaster } from "@/lib/event-broadcaster"

export const maxDuration = 60

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId()
    const body = await request.json().catch(() => null)

    const roomId = typeof body?.roomId === "string" ? body.roomId.trim() : ""
    const title = typeof body?.title === "string" ? body.title.trim() : ""
    const content = typeof body?.content === "string" ? body.content : ""

    if (!roomId) return badRequest("roomId is required")
    if (!title) return badRequest("title is required")
    if (title.length > 300) return badRequest("title is too long")
    if (content.length > 500_000) return badRequest("content is too large")

    const room = await prisma.room.findUnique({ where: { id: roomId, userId }, select: { id: true } })
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 })

    const prd = await prisma.prd.create({
      data: {
        title,
        content,
        status: "DRAFT",
        roomId,
        createdBy: userId,
      },
      select: { id: true, title: true, status: true, roomId: true, createdAt: true, updatedAt: true },
    })

    eventBroadcaster.broadcast({ type: "room", roomId, data: null })

    return NextResponse.json(prd)
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    console.error("POST /api/prds error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

