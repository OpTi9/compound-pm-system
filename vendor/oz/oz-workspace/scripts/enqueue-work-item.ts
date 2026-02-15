import { prisma } from "../lib/prisma"

function usage(): never {
  // eslint-disable-next-line no-console
  console.error(
    "Usage: tsx scripts/enqueue-work-item.ts --room <roomId> --agent <agentId> --prompt <text> [--type <type>] [--user <userId>] [--max-attempts N] [--chain <chainId>] [--iteration N] [--max-iterations N]"
  )
  process.exit(2)
}

function getArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag)
  if (idx === -1) return null
  return process.argv[idx + 1] ?? null
}

function getIntArg(flag: string): number | null {
  const v = getArg(flag)
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function main() {
  const roomId = getArg("--room")
  const agentId = getArg("--agent")
  const prompt = getArg("--prompt")
  const type = getArg("--type") || "task"
  const userId = getArg("--user")
  const maxAttempts = getIntArg("--max-attempts")
  const chainId = getArg("--chain")
  const iteration = getIntArg("--iteration")
  const maxIterations = getIntArg("--max-iterations")

  if (!roomId || !agentId || !prompt) usage()

  const payload = JSON.stringify({ roomId, agentId, prompt, ...(userId ? { userId } : {}) })

  const item = await prisma.workItem.create({
    data: {
      type,
      status: "QUEUED",
      payload,
      roomId,
      agentId,
      ...(maxAttempts ? { maxAttempts } : {}),
      ...(chainId ? { chainId } : {}),
      ...(iteration !== null && iteration !== undefined ? { iteration } : {}),
      ...(maxIterations !== null && maxIterations !== undefined ? { maxIterations } : {}),
    },
    select: { id: true },
  })

  // eslint-disable-next-line no-console
  console.log(item.id)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e)
  process.exit(1)
})
