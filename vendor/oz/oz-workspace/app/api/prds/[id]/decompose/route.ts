import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUserId, AuthError, unauthorizedResponse } from "@/lib/auth-helper"
import { eventBroadcaster } from "@/lib/event-broadcaster"

export const maxDuration = 60

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

function buildDecomposePrompt(prd: { title: string; content: string }) {
  return [
    "You are Avery (architect). Decompose the PRD into implementation tasks.",
    "",
    "OUTPUT FORMAT (mandatory): return a single JSON object. Prefer a ```json code fence```.",
    "Choose ONE of these schemas:",
    "",
    "Schema A (flat tasks):",
    "{",
    '  \"tasks\": [',
    '    { \"title\": \"...\", \"prompt\": \"...\", \"agentId\": \"optional-override\" }',
    "  ]",
    "}",
    "",
    "Schema B (epics -> tasks):",
    "{",
    '  \"epics\": [',
    '    { \"title\": \"...\", \"tasks\": [ { \"title\": \"...\", \"prompt\": \"...\", \"agentId\": \"optional-override\" } ] }',
    "  ]",
    "}",
    "",
    "Guidance:",
    "- Produce tasks that are independently executable and reviewable.",
    "- Include acceptance criteria and test guidance in each task prompt.",
    "- Keep prompts concise and specific.",
    "- Use epics when the PRD is large; otherwise flat tasks is fine.",
    "",
    `PRD Title: ${prd.title}`,
    "",
    "PRD Content (markdown):",
    prd.content || "(empty)",
  ].join("\n")
}

async function findAveryAgentId(roomId: string) {
  const roomAgents = await prisma.roomAgent.findMany({
    where: { roomId },
    include: { agent: { select: { id: true, name: true } } },
  })
  const avery = roomAgents
    .map((ra) => ra.agent)
    .find((a) => (a?.name || "").trim().toLowerCase() === "avery")
  return avery?.id || null
}

async function findDefaultImplAgentId(roomId: string) {
  const roomAgents = await prisma.roomAgent.findMany({
    where: { roomId },
    include: { agent: { select: { id: true, name: true } } },
  })
  const pick = roomAgents
    .map((ra) => ra.agent)
    .find((a) => {
      const n = (a?.name || "").trim().toLowerCase()
      return n && n !== "rex" && n !== "avery"
    })
  return pick?.id || null
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthenticatedUserId()
    const { id } = await params

    const prd = await prisma.prd.findUnique({
      where: { id },
      select: { id: true, title: true, content: true, status: true, roomId: true },
    })
    if (!prd) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const room = await prisma.room.findUnique({ where: { id: prd.roomId, userId }, select: { id: true } })
    if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (prd.status !== "DRAFT") {
      return NextResponse.json({ error: `PRD status must be DRAFT (got ${prd.status})` }, { status: 409 })
    }

    // Dedupe: don't enqueue another decomposer if one already exists for this PRD.
    const existing = await prisma.workItem.findFirst({
      where: {
        chainId: prd.id,
        type: "decompose",
        status: { in: ["QUEUED", "CLAIMED", "RUNNING"] },
      },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json({ error: "Decomposition already in progress" }, { status: 409 })
    }

    const body = await request.json().catch(() => null)
    const overrideDefaultAgentId = typeof body?.defaultAgentId === "string" ? body.defaultAgentId.trim() : ""

    const averyAgentId = await findAveryAgentId(prd.roomId)
    if (!averyAgentId) return NextResponse.json({ error: "Avery agent not found in room" }, { status: 404 })

    const defaultAgentId =
      overrideDefaultAgentId ||
      (await findDefaultImplAgentId(prd.roomId))
    if (defaultAgentId) {
      const member = await prisma.roomAgent.findUnique({
        where: { roomId_agentId: { roomId: prd.roomId, agentId: defaultAgentId } },
        select: { id: true },
      })
      if (!member) return badRequest("defaultAgentId is not in this room")
    }

    const prompt = buildDecomposePrompt({ title: prd.title, content: prd.content })

    // Enqueue the decomposer work item.
    const wi = await prisma.workItem.create({
      data: {
        type: "decompose",
        status: "QUEUED",
        payload: JSON.stringify({
          roomId: prd.roomId,
          agentId: averyAgentId,
          prompt,
          userId,
          prdId: prd.id,
          defaultAgentId: defaultAgentId || null,
        }),
        chainId: prd.id,
        roomId: prd.roomId,
        agentId: averyAgentId,
      },
      select: { id: true },
    })

    await prisma.prd.update({
      where: { id: prd.id },
      data: { status: "DECOMPOSING" },
    })

    eventBroadcaster.broadcast({ type: "room", roomId: prd.roomId, data: null })

    return NextResponse.json({ workItemId: wi.id })
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    console.error("POST /api/prds/[id]/decompose error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
