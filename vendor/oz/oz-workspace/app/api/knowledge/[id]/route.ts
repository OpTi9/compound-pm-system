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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthenticatedUserId()
    const { id } = await params

    const item = await prisma.knowledgeItem.findUnique({
      where: { id },
      include: { room: { select: { id: true, userId: true } } },
    })
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!item.room || item.room.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json(item)
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    console.error("GET /api/knowledge/[id] error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthenticatedUserId()
    const { id } = await params
    const existing = await prisma.knowledgeItem.findUnique({
      where: { id },
      include: { room: { select: { id: true, userId: true } } },
    })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!existing.room || existing.room.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const body = await request.json().catch(() => null)
    const title = typeof body?.title === "string" ? body.title.trim() : undefined
    const content = typeof body?.content === "string" ? body.content : undefined
    const kind = typeof body?.kind === "string" ? body.kind.trim() : undefined
    const tags = body?.tags !== undefined ? toTagsJson(body.tags) : undefined

    const data: any = {}
    if (title !== undefined) {
      if (!title) return badRequest("title cannot be empty")
      if (title.length > 200) return badRequest("title is too long")
      data.title = title
    }
    if (content !== undefined) {
      if (content.length > 200_000) return badRequest("content is too large")
      data.content = content
    }
    if (kind !== undefined) {
      if (!kind) return badRequest("kind cannot be empty")
      if (kind.length > 40) return badRequest("kind is too long")
      data.kind = kind
    }
    if (tags !== undefined) data.tagsJson = tags

    const updated = await prisma.knowledgeItem.update({ where: { id }, data })
    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    console.error("PATCH /api/knowledge/[id] error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthenticatedUserId()
    const { id } = await params

    const existing = await prisma.knowledgeItem.findUnique({
      where: { id },
      include: { room: { select: { id: true, userId: true } } },
    })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!existing.room || existing.room.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 })

    await prisma.knowledgeItem.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    console.error("DELETE /api/knowledge/[id] error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

