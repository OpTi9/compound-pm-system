import { PrismaClient } from "@/lib/generated/prisma/client"
import { PrismaLibSql } from "@prisma/adapter-libsql"

const globalForPrisma = globalThis as unknown as {
  prisma: InstanceType<typeof PrismaClient> | undefined
  prismaPragmasInitialized?: boolean
}

function createPrismaClient() {
  return new PrismaClient({
    adapter: new PrismaLibSql({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    }),
  })
}

function initSqlitePragmas(p: PrismaClient) {
  if (globalForPrisma.prismaPragmasInitialized) return
  globalForPrisma.prismaPragmasInitialized = true

  // Best-effort. Helps reduce "database is locked" errors under concurrent reads/writes
  // (e.g. Next.js dev + orchestrator polling against a local file-backed SQLite/libsql DB).
  Promise.resolve()
    .then(async () => {
      await p.$executeRawUnsafe(`PRAGMA journal_mode=WAL;`)
      await p.$executeRawUnsafe(`PRAGMA synchronous=NORMAL;`)
      await p.$executeRawUnsafe(`PRAGMA busy_timeout=5000;`)
    })
    .catch((e) => {
      // Don't crash the app if PRAGMAs aren't supported by the adapter.
      console.warn("[prisma] Failed to init SQLite pragmas:", e)
    })
}

export const prisma = globalForPrisma.prisma || createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
initSqlitePragmas(prisma)
