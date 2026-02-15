import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"

function validatePassword(input: unknown, opts: { email: string; name: string }): string | null {
  if (typeof input !== "string") return "Password is required"
  const password = input

  if (password.length < 12) return "Password must be at least 12 characters"
  if (password.length > 200) return "Password is too long"

  const lower = /[a-z]/.test(password)
  const upper = /[A-Z]/.test(password)
  const digit = /[0-9]/.test(password)
  const symbol = /[^A-Za-z0-9]/.test(password)
  const classes = [lower, upper, digit, symbol].filter(Boolean).length
  if (classes < 3) return "Password must include at least 3 of: lowercase, uppercase, number, symbol"

  const email = (opts.email || "").trim().toLowerCase()
  const name = (opts.name || "").trim().toLowerCase()
  const pwLower = password.toLowerCase()
  if (email && pwLower.includes(email.split("@")[0] || "")) return "Password is too similar to email"
  if (name && name.length >= 3 && pwLower.includes(name)) return "Password is too similar to name"
  return null
}

export async function POST(request: Request) {
  try {
    const { name, email, password } = await request.json()

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      )
    }

    const ip = getClientIp(request)
    const ipLimit = checkRateLimit(`signup:ip:${ip}`, { limit: 10, windowMs: 10 * 60_000 })
    if (!ipLimit.ok) {
      const res = NextResponse.json({ error: "Too many signup attempts. Try again later." }, { status: 429 })
      res.headers.set("Retry-After", String(ipLimit.retryAfterSeconds))
      return res
    }

    const emailNorm = String(email).trim().toLowerCase()
    const emailLimit = checkRateLimit(`signup:email:${emailNorm}`, { limit: 5, windowMs: 60 * 60_000 })
    if (!emailLimit.ok) {
      const res = NextResponse.json({ error: "Too many signup attempts for this email. Try again later." }, { status: 429 })
      res.headers.set("Retry-After", String(emailLimit.retryAfterSeconds))
      return res
    }

    const pwErr = validatePassword(password, { email: emailNorm, name: String(name) })
    if (pwErr) {
      return NextResponse.json(
        { error: pwErr },
        { status: 400 }
      )
    }

    const existing = await prisma.user.findUnique({ where: { email: emailNorm } })
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: { name: String(name).trim(), email: emailNorm, passwordHash },
    })

    return NextResponse.json(
      { id: user.id, name: user.name, email: user.email },
      { status: 201 }
    )
  } catch (error) {
    console.error("POST /api/auth/signup error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
