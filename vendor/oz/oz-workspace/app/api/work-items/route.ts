import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUserId, AuthError, unauthorizedResponse } from "@/lib/auth-helper"
import { eventBroadcaster } from "@/lib/event-broadcaster"
import { normalizeWorkItemStatus } from "@/lib/validation"

export const maxDuration = 60

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function extractPayloadTitle(rawPayload: string | null): string | null {
  if (!rawPayload) return null
  const v = safeJsonParse(rawPayload)
  if (!v || typeof v !== "object" || Array.isArray(v)) return null
  const title = (v as Record<string, unknown>).title
  return typeof title === "string" && title.trim() ? title.trim() : null
}

function deriveOutputPreview(text: string, workType: string): { preview: string | null; reviewOutcome: "APPROVED" | "CHANGES_NEEDED" | null } {
  const lines = (text || "")
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length === 0) return { preview: null, reviewOutcome: null }

  // Reviews: prefer explicit outcome lines.
  const changesLine = lines.find((l) => /^CHANGES_NEEDED:/i.test(l))
  if (changesLine) {
    return { preview: changesLine, reviewOutcome: "CHANGES_NEEDED" }
  }
  const approvedLine = lines.find((l) => /^APPROVED\b/i.test(l))
  if (approvedLine) {
    return { preview: approvedLine, reviewOutcome: "APPROVED" }
  }

  // For non-review items, try to avoid CLI boilerplate and show something meaningful.
  const noisyPrefixes = [
    "openai codex v",
    "--------",
    "workdir:",
    "model:",
    "provider:",
    "approval:",
    "sandbox:",
    "reasoning effort:",
    "reasoning summaries:",
    "session id:",
    "tokens used",
    "mcp startup:",
    "user",
    "codex",
    "thinking",
    "exec",
  ]
  const isNoisy = (l: string) => {
    const s = l.toLowerCase()
    return noisyPrefixes.some((p) => s.startsWith(p))
  }

  const candidates = lines.filter((l) => !isNoisy(l))
  const chosen = (candidates.length ? candidates[candidates.length - 1] : lines[lines.length - 1]) || ""

  const truncated = chosen.length > 180 ? `${chosen.slice(0, 177)}...` : chosen
  return { preview: truncated, reviewOutcome: null }
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(Math.max(Math.floor(n), min), max)
}

function parseTsIdCursor(raw: string | null): { ts: Date; id: string } | null {
  const s = (raw || "").trim()
  if (!s) return null
  const [tsRaw, id] = s.split("|")
  if (!tsRaw || !id) return null
  const ts = new Date(tsRaw)
  if (!Number.isFinite(ts.getTime())) return null
  return { ts, id }
}

function encodeTsIdCursor(ts: Date, id: string): string {
  return `${ts.toISOString()}|${id}`
}

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId()
    const { searchParams } = new URL(request.url)
    const roomId = (searchParams.get("roomId") || "").trim()
    const chainId = (searchParams.get("chainId") || "").trim()
    const status = normalizeWorkItemStatus(searchParams.get("status"))
    const type = (searchParams.get("type") || "").trim()
    const limit = clampInt(Number(searchParams.get("limit") || "200"), 1, 500)
    const cursor = parseTsIdCursor(searchParams.get("cursor"))
    const includePreview = (searchParams.get("includePreview") || "").trim() === "1"

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

    const ascending = Boolean(chainId)
    const orderBy = ascending
      ? [{ createdAt: "asc" as const }, { id: "asc" as const }]
      : [{ createdAt: "desc" as const }, { id: "desc" as const }]
    if (cursor) {
      // Stable pagination on (createdAt, id) with direction matching the list.
      const op = ascending ? "gt" : "lt"
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { createdAt: { [op]: cursor.ts } },
            { AND: [{ createdAt: cursor.ts }, { id: { [op]: cursor.id } }] },
          ],
        },
      ]
    }

    const rows = await prisma.workItem.findMany({
      where,
      orderBy,
      take: limit + 1,
      include: {
        agent: { select: { id: true, name: true, color: true, icon: true, status: true, activeRoomId: true } },
        room: { select: { id: true, name: true } },
        epic: { select: { id: true, title: true, order: true, status: true, prdId: true } },
      },
    })

    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
    const nextCursor = hasMore ? encodeTsIdCursor(items[items.length - 1].createdAt, items[items.length - 1].id) : null

    const contentByRunId = new Map<string, string>()
    if (includePreview) {
      const runIds = Array.from(new Set(items.map((w) => w.runId).filter(Boolean) as string[]))
      if (runIds.length) {
        const messages = await prisma.message.findMany({
          where: { id: { in: runIds } },
          select: { id: true, content: true },
        }).catch(() => [] as Array<{ id: string; content: string }>)
        for (const m of messages) {
          contentByRunId.set(m.id, m.content || "")
        }
      }
    }

    const res = NextResponse.json({
      items: items.map((w) => ({
        ...(includePreview
          ? (() => {
              const title = extractPayloadTitle(w.payload)
              const content = w.runId ? contentByRunId.get(w.runId) : undefined
              const derived = content ? deriveOutputPreview(content, w.type) : { preview: null, reviewOutcome: null }
              return { title, outputPreview: derived.preview, reviewOutcome: derived.reviewOutcome }
            })()
          : {}),
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
      nextCursor,
    })
    if (nextCursor) res.headers.set("X-OZ-Next-Cursor", nextCursor)
    return res
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
