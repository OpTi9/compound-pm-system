import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOzApiAuth } from "@/lib/oz-api-auth"

export async function POST(request: Request, { params }: { params: Promise<{ runID: string }> }) {
  const auth = await requireOzApiAuth(request)
  if (!auth.ok) return auth.response

  const { runID } = await params
  const existing = await prisma.agentRun.findUnique({ where: { id: runID } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!auth.ctx.isAdmin && existing.userId !== auth.ctx.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await prisma.agentRun.update({
    where: { id: runID },
    data: {
      state: "CANCELLED",
      completedAt: new Date(),
      errorMessage: existing.errorMessage || "Cancelled",
    },
  })

  return NextResponse.json("cancelled")
}
