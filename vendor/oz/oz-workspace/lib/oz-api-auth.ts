import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export type OzApiAuthContext = {
  /** Authenticated user scope for the local Oz-compatible API routes. */
  userId: string | null
  /** True when bearer token matches server OZ_API_KEY. */
  isAdmin: boolean
}

export async function requireOzApiAuth(
  request: Request
): Promise<{ ok: true; ctx: OzApiAuthContext } | { ok: false; response: NextResponse }> {
  const auth = request.headers.get("authorization") || ""
  const m = auth.match(/^Bearer\s+(.+)$/i)
  const token = m?.[1]?.trim()
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const expected = process.env.OZ_API_KEY?.trim()
  if (expected && token === expected) {
    return { ok: true, ctx: { userId: null, isAdmin: true } }
  }

  // Multi-tenant scoping: allow per-user tokens stored in Settings.
  // Note: the UI already lets users store oz_api_key; we reuse it here to scope API routes.
  const matches = await prisma.setting.findMany({
    where: {
      value: token,
      key: { in: ["oz_api_key"] },
      userId: { not: null },
    },
    select: { userId: true },
    take: 2,
  })

  if (matches.length === 1 && matches[0]?.userId) {
    return { ok: true, ctx: { userId: matches[0].userId, isAdmin: false } }
  }
  // If multiple users store the same token, don't guess (prevents cross-tenant leakage).
  if (matches.length > 1) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
}
