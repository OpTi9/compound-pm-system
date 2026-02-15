import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOzApiAuth } from "@/lib/oz-api-auth"

export async function GET(request: Request) {
  const auth = await requireOzApiAuth(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "50"), 1), 200)

  const runs = await prisma.agentRun.findMany({
    where: auth.ctx.isAdmin ? undefined : { userId: auth.ctx.userId },
    orderBy: { queuedAt: "desc" },
    take: limit,
  })

  return NextResponse.json({
    items: runs.map((run) => ({
      created_at: run.queuedAt.toISOString(),
      updated_at: run.updatedAt.toISOString(),
      prompt: run.prompt,
      run_id: run.id,
      task_id: run.id,
      title: run.title || "Run",
      state: run.state,
      session_link: null,
      artifacts: [],
      conversation_id: null,
      agent_config: {
        model_id: run.model,
        name: run.title || undefined,
        environment_id: null,
      },
      source: "LOCAL",
    })),
    next_cursor: null,
  })
}
