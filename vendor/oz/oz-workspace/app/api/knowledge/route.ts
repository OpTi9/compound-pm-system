import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUserId, AuthError, unauthorizedResponse } from "@/lib/auth-helper"

export const maxDuration = 60

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

function toTagsJson(tags: unknown): string {
  if (!Array.isArray(tags)) return "[]"
  const out: string[] = []
  for (const t of tags) {
    if (typeof t !== "string") continue
    const s = t.trim()
    if (!s) continue
    if (s.length > 40) continue
    if (!out.includes(s)) out.push(s)
    if (out.length >= 20) break
  }
  return JSON.stringify(out)
}

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId()
    const { searchParams } = new URL(request.url)
    const roomId = (searchParams.get("roomId") || "").trim()
    const sourcePrdId = (searchParams.get("sourcePrdId") || "").trim()
    const kind = (searchParams.get("kind") || "").trim()
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || "200"), 1), 500)

    if (!roomId) return badRequest("roomId is required")

    const room = await prisma.room.findUnique({ where: { id: roomId, userId }, select: { id: true } })
    if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const where: any = { roomId }
    if (sourcePrdId) where.sourcePrdId = sourcePrdId
    if (kind) where.kind = kind

    const items = await prisma.knowledgeItem.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: {
        createdByAgent: { select: { id: true, name: true, color: true, icon: true, status: true, activeRoomId: true } },
      },
    })

    return NextResponse.json({
      items: items.map((k) => ({
        id: k.id,
        roomId: k.roomId,
        kind: k.kind,
        title: k.title,
        content: k.content,
        tags: (() => { try { return JSON.parse(k.tagsJson) } catch { return [] } })(),
        sourcePrdId: k.sourcePrdId,
        sourceWorkItemId: k.sourceWorkItemId,
        createdByUserId: k.createdByUserId,
        createdByAgentId: k.createdByAgentId,
        createdAt: k.createdAt,
        updatedAt: k.updatedAt,
        createdByAgent: k.createdByAgent,
      })),
    })
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    console.error("GET /api/knowledge error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId()
    const body = await request.json().catch(() => null)

    const roomId = typeof body?.roomId === "string" ? body.roomId.trim() : ""
    const title = typeof body?.title === "string" ? body.title.trim() : ""
    const content = typeof body?.content === "string" ? body.content : ""
    const kind = typeof body?.kind === "string" ? body.kind.trim() : "learning"
    const tagsJson = toTagsJson(body?.tags)
    const sourcePrdId = typeof body?.sourcePrdId === "string" ? body.sourcePrdId.trim() : ""
    const sourceWorkItemId = typeof body?.sourceWorkItemId === "string" ? body.sourceWorkItemId.trim() : ""

    if (!roomId) return badRequest("roomId is required")
    if (!title) return badRequest("title is required")
    if (title.length > 200) return badRequest("title is too long")
    if (content.length > 200_000) return badRequest("content is too large")
    if (kind.length > 40) return badRequest("kind is too long")

    const room = await prisma.room.findUnique({ where: { id: roomId, userId }, select: { id: true } })
    if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Validate source PRD belongs to this room if provided.
    if (sourcePrdId) {
      const prd = await prisma.prd.findUnique({ where: { id: sourcePrdId }, select: { roomId: true } })
      if (!prd || prd.roomId !== roomId) return badRequest("sourcePrdId is invalid")
    }

    const item = await prisma.knowledgeItem.create({
      data: {
        roomId,
        kind: kind || "learning",
        title,
        content,
        tagsJson,
        sourcePrdId: sourcePrdId || null,
        sourceWorkItemId: sourceWorkItemId || null,
        createdByUserId: userId,
        createdByAgentId: null,
      },
      select: { id: true },
    })

    return NextResponse.json({ id: item.id })
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    console.error("POST /api/knowledge error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

