import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

function exists(p: string): boolean {
  try {
    fs.accessSync(p)
    return true
  } catch {
    return false
  }
}

function runPrisma(args: string[], env: NodeJS.ProcessEnv) {
  // Use local prisma binary, avoid `npx` network behavior.
  const prismaBin = path.join(process.cwd(), "node_modules", ".bin", "prisma")
  execFileSync(prismaBin, args, { stdio: "inherit", env })
}

export async function setupTestDb(): Promise<{ dbUrl: string; cleanup: () => void }> {
  // Ensure Prisma client is generated (the app build normally does this).
  const generatedClientMarker = path.join(process.cwd(), "lib", "generated", "prisma", "client", "index.js")
  if (!exists(generatedClientMarker)) {
    runPrisma(["generate"], process.env)
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oz-workspace-test-"))
  const dbPath = path.join(dir, "test.db")
  const dbUrl = `file:${dbPath}`

  const env = {
    ...process.env,
    DATABASE_URL: dbUrl, // prisma.config.ts uses this for CLI operations
    TURSO_DATABASE_URL: dbUrl, // runtime adapter uses this
    TURSO_AUTH_TOKEN: "",
    NODE_ENV: "test",
  }

  // Use `db push` for test DB setup, matching this repo's documented setup path and ensuring the
  // DB schema matches the current Prisma schema (migrations can drift in this repo).
  runPrisma(["db", "push", "--accept-data-loss", "--force-reset", "--url", dbUrl], env)

  // Export into current process env so subsequent imports use the same DB.
  process.env.DATABASE_URL = dbUrl
  process.env.TURSO_DATABASE_URL = dbUrl
  process.env.TURSO_AUTH_TOKEN = ""
  process.env.NODE_ENV = "test"

  return {
    dbUrl,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    },
  }
}
