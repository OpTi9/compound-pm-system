import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export async function getAuthenticatedUserId(): Promise<string> {
  // Test-only override so route handlers can be exercised without a NextAuth session.
  if (process.env.NODE_ENV === "test") {
    const testUserId = (process.env.OZ_TEST_USER_ID || "").trim()
    if (testUserId) return testUserId
  }

  const session = await auth()
  if (!session?.user?.id) {
    throw new AuthError()
  }
  return session.user.id
}

export class AuthError extends Error {
  constructor() {
    super("Unauthorized")
  }
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
