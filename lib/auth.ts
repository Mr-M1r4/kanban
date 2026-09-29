import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import crypto from "node:crypto"
import type { User } from "@prisma/client"
import { prisma } from "@/lib/db"
import type { Role } from "@/lib/types"

export const SESSION_COOKIE = "kanban_session"
const SESSION_DAYS = 60

export function newToken() {
  return crypto.randomBytes(24).toString("base64url")
}

export async function createSession(userId: string) {
  const token = newToken()
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000)
  await prisma.session.create({ data: { token, userId, expiresAt } })
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  })
  return token
}

export async function destroySession() {
  const token = cookies().get(SESSION_COOKIE)?.value
  if (token) {
    await prisma.session.deleteMany({ where: { token } })
  }
  cookies().delete(SESSION_COOKIE)
}

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = cookies().get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await prisma.session.findUnique({ where: { token }, include: { user: true } })
  if (!session) return null
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }
  return session.user
})

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) redirect("/entrar")
  return user
}

export type Membership = {
  id: string
  boardId: string
  userId: string
  role: Role
}

/** Devuelve la membresía del usuario en el tablero, o null si no pertenece. */
export const getMembership = cache(async (slug: string, userId: string): Promise<Membership | null> => {
  const m = await prisma.boardMember.findFirst({
    where: { userId, board: { slug } },
    select: { id: true, boardId: true, userId: true, role: true },
  })
  if (!m) return null
  return { ...m, role: m.role === "admin" ? "admin" : "member" }
})

export async function requireMembership(slug: string): Promise<Membership> {
  const user = await requireUser()
  const membership = await getMembership(slug, user.id)
  if (!membership) redirect("/")
  return membership
}

export async function requireAdmin(slug: string): Promise<Membership> {
  const membership = await requireMembership(slug)
  if (membership.role !== "admin") redirect(`/t/${slug}`)
  return membership
}
