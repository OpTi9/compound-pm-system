import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { eventBroadcaster } from "@/lib/event-broadcaster"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 10

function errToString(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export async function GET() {
  const now = new Date()

  let dbOk = false
  let dbError: string | null = null
  try {
    await prisma.$queryRaw`SELECT 1;`
    dbOk = true
  } catch (err) {
    dbOk = false
    dbError = errToString(err)
  }

  let lastTickAt: string | null = null
  let lastTickAgeMs: number | null = null
  if (dbOk) {
    const hb = await prisma.agentCallback.findUnique({ where: { id: "orch:last_tick" }, select: { response: true } }).catch(() => null)
    if (hb?.response) {
      const d = new Date(hb.response)
      if (Number.isFinite(d.getTime())) {
        lastTickAt = d.toISOString()
        lastTickAgeMs = Math.max(0, now.getTime() - d.getTime())
      }
    }
  }

  const status = dbOk ? 200 : 503
  return NextResponse.json(
    {
      ok: dbOk,
      now: now.toISOString(),
      db: { ok: dbOk, error: dbError },
      orchestrator: { last_tick_at: lastTickAt, age_ms: lastTickAgeMs },
      events: eventBroadcaster.getStats(),
    },
    { status }
  )
}

