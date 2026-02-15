import { NextResponse } from "next/server"
import { requireOzApiAuth } from "@/lib/oz-api-auth"

// Minimal stub for SDK compatibility. Returns an empty list of discoverable skills.
export async function GET(request: Request) {
  const auth = await requireOzApiAuth(request)
  if (!auth.ok) return auth.response

  return NextResponse.json({ items: [] })
}
