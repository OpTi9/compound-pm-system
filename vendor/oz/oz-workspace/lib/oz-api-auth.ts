import { NextResponse } from "next/server"

export function requireOzApiAuth(request: Request): NextResponse | null {
  const expected = process.env.OZ_API_KEY
  if (!expected) {
    return NextResponse.json(
      { error: "OZ_API_KEY is not configured on the server" },
      { status: 500 }
    )
  }

  const auth = request.headers.get("authorization") || ""
  const m = auth.match(/^Bearer\s+(.+)$/i)
  const token = m?.[1]?.trim()
  if (!token || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

