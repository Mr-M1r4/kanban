"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { createSession, destroySession } from "@/lib/auth"
import { colorFor, isEmail, normalizeEmail } from "@/lib/utils"
import { createBoardWithDefaults, logActivity } from "@/lib/board"

export type FormState = { error?: string; ok?: boolean }

const pinSet = () => {
  const pin = (process.env.BOARD_PIN || "").trim()
  return pin.length > 0 ? pin : null
}

function nameFromEmail(email: string) {
  const local = email.split("@")[0] || "Invitado"
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ") || "Invitado"
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = normalizeEmail(String(formData.get("email") || ""))
  const pin = String(formData.get("pin") || "").trim()
  const boardName = String(formData.get("boardName") || "").trim()
  const name = String(formData.get("name") || "").trim()

  if (!isEmail(email)) return { error: "Escribe un correo válido." }
  const pinRequired = pinSet()
  if (pinRequired && pin !== pinRequired) return { error: "El PIN no es correcto." }

  const totalUsers = await prisma.user.count()

  // Primer arranque: no hay nadie todavia, se crea el tablero inicial.
  if (totalUsers === 0) {
    if (boardName.length < 2) return { error: "Ponle un nombre al tablero." }
    if (name.length < 2) return { error: "Escribe tu nombre." }
    const user = await prisma.user.create({
      data: { email, name, color: colorFor(email) },
    })
    const board = await createBoardWithDefaults(boardName, user)
    await createSession(user.id)
    redirect(`/t/${board.slug}`)
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    return {
      error: "Ese correo no está en ningún tablero. Pídele a un administrador que te agregue.",
    }
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
  await createSession(user.id)
  const first = await prisma.boardMember.findFirst({
    where: { userId: user.id, joinedAt: { not: null } },
    orderBy: { board: { createdAt: "asc" } },
    select: { board: { select: { slug: true } } },
  })
  redirect(first ? `/t/${first.board.slug}` : "/")
}

export async function acceptInviteAction(token: string) {
  const invite = await prisma.boardMember.findUnique({
    where: { inviteToken: token },
    include: { board: true, user: true },
  })
  if (!invite) redirect("/entrar?error=invalido")

  const name = invite.user.name
  await prisma.boardMember.update({
    where: { id: invite.id },
    data: { joinedAt: new Date(), inviteToken: null },
  })
  await prisma.user.update({ where: { id: invite.userId }, data: { lastSeenAt: new Date() } })
  await logActivity(invite.boardId, invite.userId, "member.joined", { name })
  await createSession(invite.userId)
  redirect(`/t/${invite.board.slug}`)
}

export async function logoutAction() {
  await destroySession()
  redirect("/entrar")
}

export async function createBoardAction(name: string) {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } })
  if (!user) redirect("/entrar")
  const board = await createBoardWithDefaults(name, user)
  revalidatePath("/")
  redirect(`/t/${board.slug}`)
}
