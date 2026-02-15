import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUserId, AuthError, unauthorizedResponse } from "@/lib/auth-helper"

export const maxDuration = 60

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthenticatedUserId()
    const { id } = await params

    const prd = await prisma.prd.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        content: true,
        status: true,
        roomId: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    if (!prd) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Enforce ownership via room.
    const room = await prisma.room.findUnique({ where: { id: prd.roomId, userId }, select: { id: true } })
    if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Lightweight progress summary (no UI yet, but helpful to call).
    const [tasksTotal, tasksSucceeded, reviewsInFlight, epics, epicTaskRows] = await Promise.all([
      prisma.workItem.count({ where: { chainId: prd.id, type: "task" } }),
      prisma.workItem.count({ where: { chainId: prd.id, type: "task", status: "SUCCEEDED" } }),
      prisma.workItem.count({ where: { chainId: prd.id, type: "review", status: { in: ["QUEUED", "CLAIMED", "RUNNING"] } } }),
      prisma.epic.findMany({
        where: { prdId: prd.id },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: { id: true, title: true, status: true, order: true, createdAt: true, updatedAt: true },
      }),
      prisma.workItem.findMany({
        where: { chainId: prd.id, type: "task", epicId: { not: null } },
        select: { epicId: true, status: true },
        take: 2000,
      }),
    ])

    const byEpic: Record<string, { total: number; succeeded: number }> = {}
    for (const r of epicTaskRows) {
      const id = r.epicId || ""
      if (!id) continue
      if (!byEpic[id]) byEpic[id] = { total: 0, succeeded: 0 }
      byEpic[id].total += 1
      if (r.status === "SUCCEEDED") byEpic[id].succeeded += 1
    }

    return NextResponse.json({
      ...prd,
      progress: {
        tasks_total: tasksTotal,
        tasks_succeeded: tasksSucceeded,
        reviews_in_flight: reviewsInFlight,
      },
      epics: epics.map((e) => ({
        ...e,
        progress: {
          tasks_total: byEpic[e.id]?.total ?? 0,
          tasks_succeeded: byEpic[e.id]?.succeeded ?? 0,
        },
      })),
    })
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    console.error("GET /api/prds/[id] error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
