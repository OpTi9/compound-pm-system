import crypto from "node:crypto"

export type AuthContext =
  | { ok: true; isAdmin: true; ownerKeyHash: null; token: string }
  | { ok: true; isAdmin: false; ownerKeyHash: string; token: string }
  | { ok: false; status: number; body: any }

export function requireAuth(req: { headers: Record<string, string | string[] | undefined> }): AuthContext {
  const raw = req.headers["authorization"]
  const auth = Array.isArray(raw) ? raw[0] : raw
  const m = (auth || "").match(/^Bearer\s+(.+)$/i)
  const token = m?.[1]?.trim()
  if (!token) return { ok: false, status: 401, body: { error: "Unauthorized" } }

  const admin = (process.env.OZ_ADMIN_API_KEY || "").trim()
  if (admin) {
    // Constant-time compare without leaking string length differences.
    const tokenHash = crypto.createHash("sha256").update(token).digest()
    const adminHash = crypto.createHash("sha256").update(admin).digest()
    if (crypto.timingSafeEqual(tokenHash, adminHash)) {
      return { ok: true, isAdmin: true, ownerKeyHash: null, token }
    }
  }

  const ownerKeyHash = crypto.createHash("sha256").update(token).digest("hex")
  return { ok: true, isAdmin: false, ownerKeyHash, token }
}
