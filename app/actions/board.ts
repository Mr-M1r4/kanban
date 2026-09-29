"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUser, newToken } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getActivity, loadBoard, logActivity, serializeBoard } from "@/lib/board"
import { APP_URL, colorFor, isEmail, normalizeEmail, COLUMN_KIND_KEYS } from "@/lib/utils"
import type { ActionResult, BoardState } from "@/lib/types"

const GAP = 1024

type Ctx =
  | { ok: true; user: { id: string; name: string }; membership: { role: string; id: string }; board: { id: string; name: string; slug: string } }
  | { ok: false; error: string }

async function ctx(slug: string): Promise<Ctx> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "Tu sesión expiró. Entra de nuevo." }
  const membership = await prisma.boardMember.findFirst({
    where: { userId: user.id, board: { slug } },
    select: { id: true, role: true },
  })
  if (!membership) return { ok: false, error: "No perteneces a este tablero." }
  const board = await prisma.board.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  })
  if (!board) return { ok: false, error: "El tablero ya no existe." }
  return { ok: true, user, membership, board }
}

const nameFromEmail = (email: string) =>
  email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ") || "Invitado"

export async function getBoardStateAction(slug: string): Promise<BoardState | null> {
  const user = await getCurrentUser()
  if (!user) return null
  const board = await loadBoard(slug)
  if (!board) return null
  if (!board.members.some((m) => m.userId === user.id)) return null
  const state = serializeBoard(board, user.id)
  state.activity = await getActivity(slug, 30)
  return state
}

export async function renameBoardAction(slug: string, name: string): Promise<ActionResult> {
  const c = await ctx(slug)
  if (!c.ok) return c
  if (c.membership.role !== "admin") return { ok: false, error: "Solo un administrador puede renombrar el tablero." }
  const clean = name.trim().slice(0, 80)
  if (clean.length < 2) return { ok: false, error: "El nombre es muy corto." }
  await prisma.board.update({ where: { id: c.board.id }, data: { name: clean } })
  await logActivity(c.board.id, c.user.id, "board.renamed", { name: clean })
  revalidatePath(`/t/${slug}`)
  return { ok: true }
}

export async function addMemberAction(
  slug: string,
  email: string,
  name?: string,
  role: "member" | "admin" = "member",
): Promise<ActionResult<{ inviteUrl: string; email: string; name: string }>> {
  const c = await ctx(slug)
  if (!c.ok) return c
  if (c.membership.role !== "admin") return { ok: false, error: "Solo un administrador puede agregar gente." }
  const mail = normalizeEmail(email)
  if (!isEmail(mail)) return { ok: false, error: "Ese correo no es válido." }

  let user = await prisma.user.findUnique({ where: { email: mail } })
  if (!user) {
    const cleanName = (name || "").trim().slice(0, 60) || nameFromEmail(mail)
    user = await prisma.user.create({ data: { email: mail, name: cleanName, color: colorFor(mail) } })
  }

  const existing = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId: c.board.id, userId: user.id } },
  })
  if (existing) return { ok: false, error: `${user.name} ya está en el tablero.` }

  const token = newToken()
  await prisma.boardMember.create({
    data: { boardId: c.board.id, userId: user.id, role, inviteToken: token, invitedAt: new Date() },
  })
  await logActivity(c.board.id, c.user.id, "member.invited", { name: user.name, email: user.email })
  return {
    ok: true,
    data: { inviteUrl: `${APP_URL}/invitacion/${token}`, email: user.email, name: user.name },
  }
}

export async function resendInviteAction(
  slug: string,
  memberId: string,
): Promise<ActionResult<{ inviteUrl: string }>> {
  const c = await ctx(slug)
  if (!c.ok) return c
  if (c.membership.role !== "admin") return { ok: false, error: "Solo un administrador puede hacer eso." }
  const member = await prisma.boardMember.findFirst({
    where: { id: memberId, boardId: c.board.id },
    include: { user: true },
  })
  if (!member) return { ok: false, error: "Ese miembro ya no está en el tablero." }
  if (member.joinedAt && member.userId !== c.user.id)
    return { ok: false, error: "Ese usuario ya entró. Para volver a invitarlo, quítalo y agrégalo de nuevo." }
  const token = newToken()
  await prisma.boardMember.update({ where: { id: memberId }, data: { inviteToken: token, invitedAt: new Date() } })
  return { ok: true, data: { inviteUrl: `${APP_URL}/invitacion/${token}` } }
}

export async function setMemberRoleAction(
  slug: string,
  memberId: string,
  role: "member" | "admin",
): Promise<ActionResult> {
  const c = await ctx(slug)
  if (!c.ok) return c
  if (c.membership.role !== "admin") return { ok: false, error: "Solo un administrador puede hacer eso." }
  const member = await prisma.boardMember.findFirst({ where: { id: memberId, boardId: c.board.id } })
  if (!member) return { ok: false, error: "Ese miembro ya no está." }
  if (role === "member") {
    const admins = await prisma.boardMember.count({ where: { boardId: c.board.id, role: "admin" } })
    if (member.role === "admin" && admins <= 1)
      return { ok: false, error: "El tablero necesita al menos un administrador." }
  }
  await prisma.boardMember.update({ where: { id: memberId }, data: { role } })
  return { ok: true }
}

export async function removeMemberAction(slug: string, memberId: string): Promise<ActionResult> {
  const c = await ctx(slug)
  if (!c.ok) return c
  if (c.membership.role !== "admin") return { ok: false, error: "Solo un administrador puede quitar gente." }
  const member = await prisma.boardMember.findFirst({
    where: { id: memberId, boardId: c.board.id },
    include: { user: true },
  })
  if (!member) return { ok: true }
  if (member.userId === c.user.id) return { ok: false, error: "No puedes quitarte a ti mismo del tablero." }
  if (member.role === "admin") {
    const admins = await prisma.boardMember.count({ where: { boardId: c.board.id, role: "admin" } })
    if (admins <= 1) return { ok: false, error: "El tablero necesita al menos un administrador." }
  }
  await prisma.boardMember.delete({ where: { id: memberId } })
  await logActivity(c.board.id, c.user.id, "member.removed", { name: member.user.name })
  return { ok: true }
}

export async function createColumnAction(
  slug: string,
  name: string,
  kind: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx(slug)
  if (!c.ok) return c
  if (c.membership.role !== "admin") return { ok: false, error: "Solo un administrador puede crear columnas." }
  const clean = name.trim().slice(0, 40)
  if (clean.length < 1) return { ok: false, error: "Ponle un nombre a la columna." }
  const last = await prisma.column.findFirst({
    where: { boardId: c.board.id },
    orderBy: { position: "desc" },
  })
  const column = await prisma.column.create({
    data: {
      boardId: c.board.id,
      name: clean,
      kind: (COLUMN_KIND_KEYS as string[]).includes(kind) ? kind : "todo",
      position: (last?.position ?? 0) + GAP,
    },
  })
  await logActivity(c.board.id, c.user.id, "column.created", { name: clean })
  return { ok: true, data: { id: column.id } }
}

export async function updateColumnAction(
  slug: string,
  columnId: string,
  patch: { name?: string; kind?: string; wipLimit?: number | null },
): Promise<ActionResult> {
  const c = await ctx(slug)
  if (!c.ok) return c
  if (c.membership.role !== "admin") return { ok: false, error: "Solo un administrador puede editar columnas." }
  const column = await prisma.column.findFirst({ where: { id: columnId, boardId: c.board.id } })
  if (!column) return { ok: false, error: "Esa columna ya no existe." }
  const data: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    const clean = patch.name.trim().slice(0, 40)
    if (clean.length < 1) return { ok: false, error: "El nombre no puede quedar vacío." }
    data.name = clean
  }
  if (patch.kind !== undefined) {
    data.kind = (COLUMN_KIND_KEYS as string[]).includes(patch.kind) ? patch.kind : column.kind
  }
  if (patch.wipLimit !== undefined) {
    data.wipLimit = patch.wipLimit && patch.wipLimit > 0 ? Math.min(patch.wipLimit, 999) : null
  }
  await prisma.column.update({ where: { id: columnId }, data })
  return { ok: true }
}

export async function moveColumnAction(slug: string, columnId: string, position: number): Promise<ActionResult> {
  const c = await ctx(slug)
  if (!c.ok) return c
  const column = await prisma.column.findFirst({ where: { id: columnId, boardId: c.board.id } })
  if (!column) return { ok: false, error: "Esa columna ya no existe." }
  await prisma.column.update({ where: { id: columnId }, data: { position } })
  return { ok: true }
}

export async function deleteColumnAction(slug: string, columnId: string): Promise<ActionResult> {
  const c = await ctx(slug)
  if (!c.ok) return c
  if (c.membership.role !== "admin") return { ok: false, error: "Solo un administrador puede borrar columnas." }
  const columns = await prisma.column.findMany({
    where: { boardId: c.board.id },
    orderBy: { position: "asc" },
  })
  if (columns.length <= 1) return { ok: false, error: "El tablero necesita al menos una columna." }
  const column = columns.find((col) => col.id === columnId)
  if (!column) return { ok: false, error: "Esa columna ya no existe." }
  const fallback = columns.find((col) => col.id !== columnId)!
  const moving = await prisma.card.findMany({ where: { columnId }, orderBy: { position: "asc" } })
  const target = await prisma.card.findFirst({
    where: { columnId: fallback.id },
    orderBy: { position: "desc" },
  })
  let next = (target?.position ?? 0) + GAP
  for (const card of moving) {
    await prisma.card.update({ where: { id: card.id }, data: { columnId: fallback.id, position: next } })
    next += GAP
  }
  await prisma.column.delete({ where: { id: columnId } })
  await logActivity(c.board.id, c.user.id, "column.deleted", { name: column.name })
  return { ok: true }
}

export async function createLabelAction(
  slug: string,
  name: string,
  color: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx(slug)
  if (!c.ok) return c
  const clean = name.trim().slice(0, 24)
  if (!clean) return { ok: false, error: "Ponle un nombre a la etiqueta." }
  const label = await prisma.label.create({
    data: { boardId: c.board.id, name: clean, color: color || "#5b8cff" },
  })
  return { ok: true, data: { id: label.id } }
}

export async function updateLabelAction(
  slug: string,
  labelId: string,
  patch: { name?: string; color?: string },
): Promise<ActionResult> {
  const c = await ctx(slug)
  if (!c.ok) return c
  const label = await prisma.label.findFirst({ where: { id: labelId, boardId: c.board.id } })
  if (!label) return { ok: false, error: "Esa etiqueta ya no existe." }
  await prisma.label.update({
    where: { id: labelId },
    data: {
      name: patch.name !== undefined ? patch.name.trim().slice(0, 24) || label.name : undefined,
      color: patch.color ?? undefined,
    },
  })
  return { ok: true }
}

export async function deleteLabelAction(slug: string, labelId: string): Promise<ActionResult> {
  const c = await ctx(slug)
  if (!c.ok) return c
  const label = await prisma.label.findFirst({ where: { id: labelId, boardId: c.board.id } })
  if (!label) return { ok: true }
  await prisma.label.delete({ where: { id: labelId } })
  return { ok: true }
}

export async function createBoardWithDefaultsAction(name: string): Promise<ActionResult<{ slug: string }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "Entra de nuevo." }
  const { createBoardWithDefaults } = await import("@/lib/board")
  const board = await createBoardWithDefaults(name, user)
  revalidatePath("/")
  return { ok: true, data: { slug: board.slug } }
}
