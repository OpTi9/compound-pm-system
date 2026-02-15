import { NextResponse, after } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUserId, AuthError, unauthorizedResponse } from "@/lib/auth-helper"
import { eventBroadcaster } from "@/lib/event-broadcaster"
import { invokeAgent } from "@/lib/invoke-agent"
import { extractMentionedNames } from "@/lib/mentions"

// Allow enough time for agent invocations triggered by @mentions
export const maxDuration = 300

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId()
    const { searchParams } = new URL(request.url)
    const roomId = searchParams.get("roomId")
    const all = (searchParams.get("all") || "").trim() === "1"
    const before = (searchParams.get("before") || "").trim()
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || "2000"), 1), 2000)
    if (!roomId) return NextResponse.json({ error: "roomId required" }, { status: 400 })

    // Verify room belongs to user
    const room = await prisma.room.findUnique({ where: { id: roomId, userId } })
    if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Best-effort stale agent sweeper (disabled by default). This mitigates agents stuck in
    // "running" when a serverless invocation dies before it can reset state.
    const staleMsRaw = (process.env.OZ_STALE_AGENT_SWEEP_MS || "").trim()
    if (staleMsRaw) {
      const staleMs = Number(staleMsRaw)
      if (Number.isFinite(staleMs) && staleMs > 0) {
        const cutoff = new Date(Date.now() - staleMs)
        await prisma.agent.updateMany({
          where: { status: "running", activeRoomId: roomId, updatedAt: { lt: cutoff } },
          data: { status: "idle", activeRoomId: null },
        }).catch(() => {})
      }
    }

    if (all) {
      const messages = await prisma.message.findMany({
        where: { roomId },
        include: {
          agent: { select: { id: true, name: true, color: true, icon: true, status: true, activeRoomId: true } },
        },
        orderBy: { timestamp: "asc" },
      })

      return NextResponse.json(
        messages.map((m) => ({
          ...m,
          author: m.authorType === "agent" ? m.agent : undefined,
          agent: undefined,
        }))
      )
    }

    let cursor: { id: string; timestamp: Date } | null = null
    if (before) {
      const found = await prisma.message.findUnique({ where: { id: before }, select: { id: true, timestamp: true, roomId: true } })
      if (!found || found.roomId !== roomId) {
        return NextResponse.json({ error: "Invalid before cursor" }, { status: 400 })
      }
      cursor = { id: found.id, timestamp: found.timestamp }
    }

    const page = await prisma.message.findMany({
      where: {
        roomId,
        ...(cursor
          ? {
              OR: [
                { timestamp: { lt: cursor.timestamp } },
                { AND: [{ timestamp: cursor.timestamp }, { id: { lt: cursor.id } }] },
              ],
            }
          : {}),
      },
      include: {
        agent: { select: { id: true, name: true, color: true, icon: true, status: true, activeRoomId: true } },
      },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: limit + 1,
    })

    const hasMore = page.length > limit
    const items = (hasMore ? page.slice(0, limit) : page).reverse()

    const res = NextResponse.json(
      items.map((m) => ({
        ...m,
        author: m.authorType === "agent" ? m.agent : undefined,
        agent: undefined,
      }))
    )
    if (hasMore && items[0]?.id) res.headers.set("X-OZ-Next-Cursor", items[0].id)
    if (hasMore) res.headers.set("X-OZ-Truncated", "1")
    return res
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    console.error("GET /api/messages error:", error)
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
    const { roomId, content, authorType = "human", authorId, sessionUrl } = body

    // Verify room belongs to user
    const room = await prisma.room.findUnique({ where: { id: roomId, userId } })
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 })

    const message = await prisma.message.create({
      data: {
        content,
        authorType,
        sessionUrl: sessionUrl ?? null,
        userId,
        roomId,
        authorId: (authorType !== "human" && authorId) ? authorId : null,
      },
      include: {
        agent: { select: { id: true, name: true, color: true, icon: true, status: true, activeRoomId: true } },
      },
    })

    // Broadcast new message to SSE subscribers
    eventBroadcaster.broadcast({
      type: "message",
      roomId,
      data: {
        ...message,
        author: message.authorType === "agent" ? message.agent : undefined,
        agent: undefined,
      },
    })

    // If this is a human message, check for @mentions and dispatch mentioned agents
    if (authorType === "human" && typeof content === "string" && content.includes("@") && !room.paused) {
      // Get room agents only if there is a possibility of mentions.
      const roomAgents = await prisma.roomAgent.findMany({
        where: { roomId },
        include: { agent: true },
      })

      const agents = roomAgents.map((ra) => ra.agent)
      const mentionedNames = extractMentionedNames(content, agents.map((a) => a.name))
      console.log("[messages] Extracted mentions:", mentionedNames)

      if (mentionedNames.length > 0) {
        const mentionedSet = new Set(mentionedNames.map((n) => n.toLowerCase()))
        const mentionedAgents = agents.filter((agent) => mentionedSet.has(agent.name.toLowerCase()))

        const ozAgents = mentionedAgents.filter((a) => a.harness === "oz")

        // Set agents to "running" NOW so the client sees the thinking state
        // immediately after the POST response (before after() fires).
        for (const agent of ozAgents) {
          await prisma.agent.update({
            where: { id: agent.id },
            data: { status: "running", activeRoomId: roomId },
          })
        }

        // Broadcast the room update so SSE subscribers also see it
        if (ozAgents.length > 0) {
          eventBroadcaster.broadcast({ type: "room", roomId, data: null })
        }
        // Dispatch the actual agent work in after() so the response returns fast.
        // Use a single after() task so multiple mentioned agents can be invoked reliably.
        after(async () => {
          await Promise.allSettled(
            ozAgents.map((mentionedAgent) => {
              console.log(`[messages] Scheduling agent dispatch: ${mentionedAgent.name}`)
              return invokeAgent({
                roomId,
                agentId: mentionedAgent.id,
                prompt: content,
                depth: 0,
                userId,
              }).catch((err) => {
                console.error(`[messages] Failed to invoke agent ${mentionedAgent.name}:`, err)
              })
            })
          )
        })
      }
    }

    return NextResponse.json(message)
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    console.error("POST /api/messages error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
