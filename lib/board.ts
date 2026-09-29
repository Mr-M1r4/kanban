import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import type { ActivityDTO, BoardState, CardDTO, ColumnDTO, LabelDTO, MemberDTO, PersonDTO } from "@/lib/types"
import { kindOf, slugify } from "@/lib/utils"
import { DEFAULT_COLUMNS, DEFAULT_LABELS } from "@/lib/defaults"

const personOf = (u: { id: string; name: string; email: string; color: string }): PersonDTO => ({
  userId: u.id,
  name: u.name,
  email: u.email,
  color: u.color,
})

const personOrNull = (u: { id: string; name: string; email: string; color: string } | null) =>
  u ? personOf(u) : null

const toLabel = (l: { id: string; name: string; color: string }): LabelDTO => ({
  id: l.id,
  name: l.name,
  color: l.color,
})

export const boardInclude = Prisma.validator<Prisma.BoardInclude>()({
  members: { include: { user: true } },
  labels: { orderBy: { name: "asc" } },
  columns: {
    orderBy: { position: "asc" },
    include: {
      cards: {
        orderBy: { position: "asc" },
        include: {
          createdBy: true,
          assignees: { include: { user: true } },
          labels: { include: { label: true } },
          items: { orderBy: { position: "asc" }, include: { assignee: true } },
          comments: { orderBy: { createdAt: "asc" }, include: { author: true } },
        },
      },
    },
  },
})

export type BoardFull = Prisma.BoardGetPayload<{ include: typeof boardInclude }>
export type CardFull = BoardFull["columns"][number]["cards"][number]

/** Crea un tablero con sus columnas y etiquetas por defecto. */
export async function createBoardWithDefaults(name: string, user: { id: string }) {
  const base = slugify(name)
  const slug = await uniqueSlug(base)
  return prisma.board.create({
    data: {
      name,
      slug,
      members: { create: { userId: user.id, role: "admin", joinedAt: new Date() } },
      columns: { create: DEFAULT_COLUMNS.map((c, i) => ({ ...c, position: i * 1024 })) },
      labels: { create: DEFAULT_LABELS },
    },
  })
}

export async function uniqueSlug(base: string) {
  let slug = base
  let n = 2
  while (await prisma.board.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${n++}`
  }
  return slug
}


export function loadBoard(slug: string): Promise<BoardFull | null> {
  return prisma.board.findUnique({ where: { slug }, include: boardInclude })
}

function serializeCard(card: CardFull): CardDTO {
  return {
    id: card.id,
    columnId: card.columnId,
    title: card.title,
    description: card.description ?? "",
    priority: card.priority,
    position: card.position,
    dueAt: card.dueAt ? card.dueAt.toISOString() : null,
    completedAt: card.completedAt ? card.completedAt.toISOString() : null,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
    createdBy: personOf(card.createdBy),
    assignees: card.assignees
      .map((a) => personOf(a.user))
      .sort((a, b) => a.name.localeCompare(b.name)),
    labels: card.labels.map((cl) => toLabel(cl.label)),
    items: card.items.map((it) => ({
      id: it.id,
      text: it.text,
      done: it.done,
      position: it.position,
      dueAt: it.dueAt ? it.dueAt.toISOString() : null,
      assignee: personOrNull(it.assignee),
    })),
    comments: card.comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      author: personOf(c.author),
    })),
    commentCount: card.comments.length,
  }
}

export function serializeBoard(board: BoardFull, meUserId: string): BoardState {
  const columns: ColumnDTO[] = board.columns.map((col) => ({
    id: col.id,
    name: col.name,
    kind: kindOf(col.kind),
    position: col.position,
    wipLimit: col.wipLimit,
    cards: col.cards.map(serializeCard),
  }))

  const kindByColumn = new Map(board.columns.map((c) => [c.id, kindOf(c.kind)]))
  const allCards = columns.flatMap((c) => c.cards)
  const now = Date.now()
  const isOpen = (card: CardDTO) => kindByColumn.get(card.columnId) !== "done"
  const isAssignedTo = (card: CardDTO, userId: string) => card.assignees.some((a) => a.userId === userId)
  const isMine = (card: CardDTO) => isAssignedTo(card, meUserId)

  const members: MemberDTO[] = board.members.map((m) => ({
    id: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    color: m.user.color,
    role: m.role === "admin" ? "admin" : "member",
    joinedAt: m.joinedAt ? m.joinedAt.toISOString() : null,
    invitedAt: m.invitedAt ? m.invitedAt.toISOString() : null,
    hasPendingInvite: !m.joinedAt,
    openCards: allCards.filter((c) => isOpen(c) && isAssignedTo(c, m.userId)).length,
  }))

  const me = members.find((m) => m.userId === meUserId)

  return {
    id: board.id,
    name: board.name,
    slug: board.slug,
    columns,
    labels: board.labels.map(toLabel),
    members,
    me: {
      userId: meUserId,
      name: me?.name ?? "",
      email: me?.email ?? "",
      color: me?.color ?? "#5b8cff",
      role: me?.role ?? "member",
    },
    stats: {
      total: allCards.length,
      done: allCards.filter((c) => !isOpen(c)).length,
      overdue: allCards.filter((c) => c.dueAt && new Date(c.dueAt).getTime() < now).length,
      mine: allCards.filter((c) => isOpen(c) && isMine(c)).length,
    },
    activity: [],
  }
}

export async function getActivity(slug: string, limit = 30): Promise<ActivityDTO[]> {
  const rows = await prisma.activity.findMany({
    where: { board: { slug } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: true, card: { select: { title: true } } },
  })
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    meta: r.meta,
    createdAt: r.createdAt.toISOString(),
    cardId: r.cardId,
    cardTitle: r.card?.title ?? null,
    actor: personOrNull(r.actor),
  }))
}

export async function logActivity(
  boardId: string,
  actorId: string | null,
  type: string,
  meta: Record<string, unknown> = {},
  cardId?: string | null,
) {
  await prisma.activity
    .create({
      data: { boardId, actorId, type, meta: JSON.stringify(meta), cardId: cardId ?? null },
    })
    .catch(() => {})
}
