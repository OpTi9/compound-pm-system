import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUserId, AuthError, unauthorizedResponse } from "@/lib/auth-helper"
import { eventBroadcaster } from "@/lib/event-broadcaster"
import { normalizeWorkItemStatus } from "@/lib/validation"

export const maxDuration = 60

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId()
    const { searchParams } = new URL(request.url)
    const roomId = (searchParams.get("roomId") || "").trim()
    const chainId = (searchParams.get("chainId") || "").trim()
    const status = normalizeWorkItemStatus(searchParams.get("status"))
    const type = (searchParams.get("type") || "").trim()
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || "200"), 1), 500)

    if (roomId) {
      const room = await prisma.room.findUnique({ where: { id: roomId, userId }, select: { id: true } })
      if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const where: any = roomId
      ? { roomId }
      : { room: { userId } }
    if (chainId) where.chainId = chainId
    if (status) where.status = status
    if (type) where.type = type

    const orderBy = chainId ? { createdAt: "asc" as const } : { createdAt: "desc" as const }

    const items = await prisma.workItem.findMany({
      where,
      orderBy,
      take: limit,
      include: {
        agent: { select: { id: true, name: true, color: true, icon: true, status: true, activeRoomId: true } },
        room: { select: { id: true, name: true } },
        epic: { select: { id: true, title: true, order: true, status: true, prdId: true } },
      },
    })

    return NextResponse.json({
      items: items.map((w) => ({
        id: w.id,
        type: w.type,
        status: w.status,
        chainId: w.chainId,
        sourceItemId: w.sourceItemId,
        iteration: w.iteration,
        maxIterations: w.maxIterations,
        roomId: w.roomId,
        agentId: w.agentId,
        epicId: w.epicId,
        runId: w.runId,
        attempts: w.attempts,
        maxAttempts: w.maxAttempts,
        lastError: w.lastError,
        claimedAt: w.claimedAt,
        leaseExpiresAt: w.leaseExpiresAt,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
        room: w.room,
        agent: w.agent,
        epic: w.epic,
      })),
    })
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    console.error("GET /api/work-items error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
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
    const epicId = typeof body?.epicId === "string" ? body.epicId.trim() : ""
    const iteration = Number.isFinite(Number(body?.iteration)) ? Number(body.iteration) : undefined
    const maxIterations = Number.isFinite(Number(body?.maxIterations)) ? Number(body.maxIterations) : undefined
    const maxAttempts = Number.isFinite(Number(body?.maxAttempts)) ? Number(body.maxAttempts) : undefined

    const payload = JSON.stringify({ roomId, agentId, prompt, userId })

    if (epicId) {
      if (!chainId) return badRequest("epicId requires chainId (prdId)")
      const epic = await prisma.epic.findUnique({ where: { id: epicId }, select: { prdId: true, prd: { select: { roomId: true } } } }).catch(() => null)
      if (!epic || epic.prdId !== chainId || epic.prd.roomId !== roomId) {
        return badRequest("epicId is invalid for this room/chain")
      }
    }

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
        ...(epicId ? { epicId } : {}),
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
