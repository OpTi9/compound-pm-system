import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOzApiAuth } from "@/lib/oz-api-auth"

function mapState(state: string): string {
  // SDK expects RunState values; we store the same strings.
  return state
}

export async function GET(request: Request, { params }: { params: Promise<{ runID: string }> }) {
  const auth = requireOzApiAuth(request)
  if (auth) return auth

  const { runID } = await params
  const run = await prisma.agentRun.findUnique({ where: { id: runID } })
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
    created_at: run.queuedAt.toISOString(),
    updated_at: run.updatedAt.toISOString(),
    prompt: run.prompt,
    run_id: run.id,
    task_id: run.id,
    title: run.title || "Run",
    state: mapState(run.state),
    session_link: null,
    artifacts: [],
    conversation_id: null,
    // Minimal config echo.
    agent_config: {
      model_id: run.model,
      name: run.title || undefined,
      environment_id: null,
    },
    source: "LOCAL",
  })
}

