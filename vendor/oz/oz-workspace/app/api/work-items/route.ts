import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUserId, AuthError, unauthorizedResponse } from "@/lib/auth-helper"
import { eventBroadcaster } from "@/lib/event-broadcaster"

export const maxDuration = 60

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

function isValidType(t: unknown): t is string {
  if (typeof t !== "string") return false
  const s = t.trim()
  if (!s) return false
  // Keep this permissive for future work item types, but prevent weird/unbounded keys.
  return /^[a-z0-9][a-z0-9_:-]{0,63}$/i.test(s)
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId()
    const body = await request.json().catch(() => null)

    const roomId = typeof body?.roomId === "string" ? body.roomId.trim() : ""
    const agentId = typeof body?.agentId === "string" ? body.agentId.trim() : ""
    const prompt = typeof body?.prompt === "string" ? body.prompt : ""
    const type = isValidType(body?.type) ? body.type.trim() : "task"

    if (!roomId) return badRequest("roomId is required")
    if (!agentId) return badRequest("agentId is required")
    if (!prompt.trim()) return badRequest("prompt is required")
    if (prompt.length > 200_000) return badRequest("prompt is too large")

    // Verify room belongs to the authenticated user.
    const room = await prisma.room.findUnique({ where: { id: roomId, userId }, select: { id: true } })
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 })

    // Ensure the agent is actually in this room (prevents cross-room invocation).
    const membership = await prisma.roomAgent.findUnique({
      where: { roomId_agentId: { roomId, agentId } },
      select: { id: true },
    })
    if (!membership) return NextResponse.json({ error: "Agent not found in room" }, { status: 404 })

    const chainId = typeof body?.chainId === "string" ? body.chainId.trim() : ""
    const sourceItemId = typeof body?.sourceItemId === "string" ? body.sourceItemId.trim() : ""
    const sourceTaskId = typeof body?.sourceTaskId === "string" ? body.sourceTaskId.trim() : ""
    const iteration = Number.isFinite(Number(body?.iteration)) ? Number(body.iteration) : undefined
    const maxIterations = Number.isFinite(Number(body?.maxIterations)) ? Number(body.maxIterations) : undefined
    const maxAttempts = Number.isFinite(Number(body?.maxAttempts)) ? Number(body.maxAttempts) : undefined

    const payload = JSON.stringify({ roomId, agentId, prompt, userId })

    const workItem = await prisma.workItem.create({
      data: {
        type,
        status: "QUEUED",
        payload,
        roomId,
        agentId,
        ...(chainId ? { chainId } : {}),
        ...(sourceItemId ? { sourceItemId } : {}),
        ...(sourceTaskId ? { sourceTaskId } : {}),
        ...(iteration !== undefined ? { iteration: Math.max(0, Math.floor(iteration)) } : {}),
        ...(maxIterations !== undefined ? { maxIterations: Math.max(0, Math.floor(maxIterations)) } : {}),
        ...(maxAttempts !== undefined ? { maxAttempts: Math.max(1, Math.floor(maxAttempts)) } : {}),
      },
      select: { id: true, status: true, type: true, createdAt: true },
    })

    // Best-effort UI refresh; we don't have a first-class WorkItem UI yet.
    eventBroadcaster.broadcast({ type: "room", roomId, data: null })

    return NextResponse.json({ ...workItem, roomId, agentId })
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    console.error("POST /api/work-items error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

