import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUserId, AuthError, unauthorizedResponse } from "@/lib/auth-helper"

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId()
    const settings = await prisma.setting.findMany({ where: { userId } })
    const result: Record<string, string> = {}
    for (const s of settings) {
      result[s.key] = s.value
    }

    // One-time legacy migration: older versions stored the API key under `warp_api_key`.
    // Convert it to `oz_api_key` and stop returning the legacy key.
    if (result["oz_api_key"] === undefined && typeof result["warp_api_key"] === "string") {
      const legacy = result["warp_api_key"]
      await prisma.setting.upsert({
        where: { userId_key: { userId, key: "oz_api_key" } },
        update: { value: legacy },
        create: { key: "oz_api_key", value: legacy, userId },
      })
      await prisma.setting.deleteMany({ where: { userId, key: "warp_api_key" } })
      result["oz_api_key"] = legacy
    }
    delete result["warp_api_key"]

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    throw error
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await getAuthenticatedUserId()
    const { key, value } = await req.json()
    if (!key || typeof value !== "string") {
      return NextResponse.json({ error: "key and value are required" }, { status: 400 })
    }
    const normalizedKey = key === "warp_api_key" ? "oz_api_key" : key
    const setting = await prisma.setting.upsert({
      where: { userId_key: { userId, key: normalizedKey } },
      update: { value },
      create: { key: normalizedKey, value, userId },
    })
    return NextResponse.json(setting)
  } catch (error) {
    if (error instanceof AuthError) return unauthorizedResponse()
    throw error
  }
}
