import { NextResponse } from "next/server"
import { requireOzApiAuth } from "@/lib/oz-api-auth"

// Minimal stub for SDK compatibility. Returns an empty list of discoverable skills.
export async function GET(request: Request) {
  const auth = requireOzApiAuth(request)
  if (auth) return auth

  return NextResponse.json({ items: [] })
}

