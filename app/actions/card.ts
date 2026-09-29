"use server"

import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { logActivity } from "@/lib/board"
import { kindOf, PRIORITY_KEYS } from "@/lib/utils"
import type { ActionResult } from "@/lib/types"

const GAP = 1024

type CardCtx =
  | {
      ok: true
      user: { id: string; name: string }
      card: { id: string; title: string; boardId: string; columnId: string }
      board: { id: string; name: string; slug: string }
      role: string
    }
  | { ok: false; error: string }

async function cardCtx(slug: string, cardId: string): Promise<CardCtx> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "Tu sesión expiró. Entra de nuevo." }
  const card = await prisma.card.findFirst({
    where: { id: cardId, board: { slug } },
    select: {
      id: true,
      title: true,
      boardId: true,
      columnId: true,
      board: { select: { id: true, name: true, slug: true } },
    },
  })
  if (!card) return { ok: false, error: "Esa tarea ya no existe." }
  const membership = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId: card.boardId, userId: user.id } },
    select: { role: true },
  })
  if (!membership) return { ok: false, error: "No perteneces a este tablero." }
  return {
    ok: true,
    user: { id: user.id, name: user.name },
    card,
    board: card.board,
    role: membership.role,
  }
}

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? undefined : d
}

export async function createCardAction(
  slug: string,
  columnId: string,
  title: string,
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "Tu sesión expiró. Entra de nuevo." }
  const clean = title.trim().slice(0, 200)
  if (!clean) return { ok: false, error: "Escribe el título de la tarea." }
  const column = await prisma.column.findFirst({
    where: { id: columnId, board: { slug } },
    include: { board: { select: { id: true } } },
  })
  if (!column) return { ok: false, error: "Esa columna ya no existe." }
  const membership = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId: column.boardId, userId: user.id } },
    select: { id: true },
  })
  if (!membership) return { ok: false, error: "No perteneces a este tablero." }

  const last = await prisma.card.findFirst({
    where: { columnId },
    orderBy: { position: "desc" },
    select: { position: true },
  })
  const card = await prisma.card.create({
    data: {
      boardId: column.boardId,
      columnId,
      title: clean,
      position: (last?.position ?? 0) + GAP,
      createdById: user.id,
      completedAt: kindOf(column.kind) === "done" ? new Date() : null,
    },
  })
  await logActivity(column.boardId, user.id, "card.created", { title: clean }, card.id)
  return { ok: true, data: { id: card.id } }
}

export async function updateCardAction(
  slug: string,
  cardId: string,
  patch: { title?: string; description?: string; priority?: string; dueAt?: string | null },
): Promise<ActionResult> {
  const c = await cardCtx(slug, cardId)
  if (!c.ok) return c
  const data: Record<string, unknown> = {}

  if (patch.title !== undefined) {
    const clean = patch.title.trim().slice(0, 200)
    if (!clean) return { ok: false, error: "El título no puede quedar vacío." }
    data.title = clean
  }
  if (patch.description !== undefined) data.description = patch.description.slice(0, 8000)
  if (patch.priority !== undefined) {
    data.priority = (PRIORITY_KEYS as string[]).includes(patch.priority) ? patch.priority : "normal"
  }
  const dueAt = parseDate(patch.dueAt)
  if (dueAt !== undefined) data.dueAt = dueAt

  if (Object.keys(data).length === 0) return { ok: true }
  await prisma.card.update({ where: { id: cardId }, data })
  if (data.title) await logActivity(c.board.id, c.user.id, "card.renamed", { title: data.title }, cardId)
  return { ok: true }
}

export async function moveCardAction(
  slug: string,
  cardId: string,
  columnId: string,
  position: number,
): Promise<ActionResult> {
  const c = await cardCtx(slug, cardId)
  if (!c.ok) return c
  const column = await prisma.column.findFirst({
    where: { id: columnId, boardId: c.board.id },
    select: { id: true, name: true, kind: true },
  })
  if (!column) return { ok: false, error: "Esa columna ya no existe." }
  const current = await prisma.card.findUnique({ where: { id: cardId }, select: { columnId: true, title: true } })
  const goingToDone = kindOf(column.kind) === "done"
  const wasDone = await wasInDoneColumn(c.board.id, current?.columnId ?? "")
  await prisma.card.update({
    where: { id: cardId },
    data: { columnId, position, completedAt: goingToDone ? new Date() : null },
  })
  // Si dos tarjetas quedan con la misma posicion, se reordena la columna
  const siblings = await prisma.card.findMany({
    where: { columnId },
    orderBy: { position: "asc" },
    select: { id: true, position: true },
  })
  for (let i = 1; i < siblings.length; i++) {
    if (siblings[i].position - siblings[i - 1].position < 0.001) {
      let next = 1024
      for (const card of siblings) {
        await prisma.card.update({ where: { id: card.id }, data: { position: next } })
        next += 1024
      }
      break
    }
  }
  if (current && current.columnId !== columnId) {
    await logActivity(c.board.id, c.user.id, "card.moved", { title: current.title, to: column.name }, cardId)
    if (goingToDone && !wasDone) await logActivity(c.board.id, c.user.id, "card.done", { title: current.title }, cardId)
  }
  return { ok: true }
}

async function wasInDoneColumn(boardId: string, columnId: string) {
  if (!columnId) return false
  const col = await prisma.column.findFirst({ where: { id: columnId, boardId }, select: { kind: true } })
  return col ? kindOf(col.kind) === "done" : false
}

export async function deleteCardAction(slug: string, cardId: string): Promise<ActionResult> {
  const c = await cardCtx(slug, cardId)
  if (!c.ok) return c
  const title = await prisma.card.findUnique({ where: { id: cardId }, select: { title: true } })
  await prisma.card.delete({ where: { id: cardId } })
  await logActivity(c.board.id, c.user.id, "card.deleted", { title: title?.title ?? "" })
  return { ok: true }
}

export async function duplicateCardAction(slug: string, cardId: string): Promise<ActionResult<{ id: string }>> {
  const c = await cardCtx(slug, cardId)
  if (!c.ok) return c
  const source = await prisma.card.findUnique({
    where: { id: cardId },
    include: {
      assignees: true,
      labels: true,
      items: { orderBy: { position: "asc" } },
    },
  })
  if (!source) return { ok: false, error: "Esa tarea ya no existe." }
  const last = await prisma.card.findFirst({
    where: { columnId: source.columnId },
    orderBy: { position: "desc" },
    select: { position: true },
  })
  const copy = await prisma.card.create({
    data: {
      boardId: source.boardId,
      columnId: source.columnId,
      title: `${source.title} (copia)`.slice(0, 200),
      description: source.description,
      priority: source.priority,
      position: (last?.position ?? 0) + GAP,
      dueAt: source.dueAt,
      createdById: c.user.id,
      assignees: { create: source.assignees.map((a) => ({ userId: a.userId })) },
      labels: { create: source.labels.map((l) => ({ labelId: l.labelId })) },
      items: {
        create: source.items.map((it) => ({ text: it.text, done: it.done, assigneeId: it.assigneeId })),
      },
    },
  })
  return { ok: true, data: { id: copy.id } }
}

export async function setAssigneeAction(
  slug: string,
  cardId: string,
  userId: string,
  remove = false,
): Promise<ActionResult> {
  const c = await cardCtx(slug, cardId)
  if (!c.ok) return c
  if (remove) {
    await prisma.cardAssignee
      .delete({ where: { cardId_userId: { cardId, userId } } })
      .catch(() => {})
    return { ok: true }
  }
  const member = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId: c.board.id, userId } },
  })
  if (!member) return { ok: false, error: "Esa persona no está en el tablero." }
  await prisma.cardAssignee.upsert({
    where: { cardId_userId: { cardId, userId } },
    create: { cardId, userId },
    update: {},
  })
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
  await logActivity(c.board.id, c.user.id, "card.assigned", { title: c.card.title, to: target?.name ?? "" }, cardId)
  return { ok: true }
}

export async function setCardLabelAction(
  slug: string,
  cardId: string,
  labelId: string,
  add: boolean,
): Promise<ActionResult> {
  const c = await cardCtx(slug, cardId)
  if (!c.ok) return c
  if (add) {
    const label = await prisma.label.findFirst({ where: { id: labelId, boardId: c.board.id } })
    if (!label) return { ok: false, error: "Esa etiqueta ya no existe." }
    await prisma.cardLabel.upsert({
      where: { cardId_labelId: { cardId, labelId } },
      create: { cardId, labelId },
      update: {},
    })
  } else {
    await prisma.cardLabel
      .delete({ where: { cardId_labelId: { cardId, labelId } } })
      .catch(() => {})
  }
  return { ok: true }
}

export async function addItemAction(
  slug: string,
  cardId: string,
  text: string,
  assigneeId?: string | null,
): Promise<ActionResult<{ id: string }>> {
  const c = await cardCtx(slug, cardId)
  if (!c.ok) return c
  const clean = text.trim().slice(0, 300)
  if (!clean) return { ok: false, error: "Escribe el paso a realizar." }
  const last = await prisma.item.findFirst({
    where: { cardId },
    orderBy: { position: "desc" },
    select: { position: true },
  })
  const item = await prisma.item.create({
    data: {
      cardId,
      text: clean,
      position: (last?.position ?? 0) + GAP,
      assigneeId: assigneeId || null,
    },
  })
  return { ok: true, data: { id: item.id } }
}

export async function updateItemAction(
  slug: string,
  cardId: string,
  itemId: string,
  patch: { text?: string; done?: boolean; dueAt?: string | null; assigneeId?: string | null },
): Promise<ActionResult> {
  const c = await cardCtx(slug, cardId)
  if (!c.ok) return c
  const item = await prisma.item.findFirst({ where: { id: itemId, cardId } })
  if (!item) return { ok: false, error: "Ese paso ya no existe." }
  const data: Record<string, unknown> = {}
  if (patch.text !== undefined) {
    const clean = patch.text.trim().slice(0, 300)
    if (clean) data.text = clean
  }
  if (patch.done !== undefined) data.done = patch.done
  const dueAt = parseDate(patch.dueAt)
  if (dueAt !== undefined) data.dueAt = dueAt
  if (patch.assigneeId !== undefined) data.assigneeId = patch.assigneeId || null
  await prisma.item.update({ where: { id: itemId }, data })
  return { ok: true }
}

export async function deleteItemAction(slug: string, cardId: string, itemId: string): Promise<ActionResult> {
  const c = await cardCtx(slug, cardId)
  if (!c.ok) return c
  const item = await prisma.item.findFirst({ where: { id: itemId, cardId } })
  if (!item) return { ok: true }
  await prisma.item.delete({ where: { id: itemId } })
  return { ok: true }
}

export async function addCommentAction(slug: string, cardId: string, body: string): Promise<ActionResult> {
  const c = await cardCtx(slug, cardId)
  if (!c.ok) return c
  const clean = body.trim().slice(0, 4000)
  if (!clean) return { ok: false, error: "Escribe algo antes de enviar." }
  await prisma.comment.create({ data: { cardId, authorId: c.user.id, body: clean } })
  await logActivity(c.board.id, c.user.id, "card.commented", { title: c.card.title }, cardId)
  return { ok: true }
}

export async function deleteCommentAction(
  slug: string,
  cardId: string,
  commentId: string,
): Promise<ActionResult> {
  const c = await cardCtx(slug, cardId)
  if (!c.ok) return c
  const comment = await prisma.comment.findFirst({ where: { id: commentId, cardId } })
  if (!comment) return { ok: true }
  if (comment.authorId !== c.user.id && c.role !== "admin")
    return { ok: false, error: "Solo puedes borrar tus comentarios." }
  await prisma.comment.delete({ where: { id: commentId } })
  return { ok: true }
}
