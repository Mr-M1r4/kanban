import type {
  ActivityDTO,
  BoardState,
  CardDTO,
  ColumnDTO,
  CommentDTO,
  ItemDTO,
  MemberDTO,
  PersonDTO,
  Role,
} from "@/lib/types"
import { kindOf } from "@/lib/utils"
import type { Row, Snapshot } from "./types"
import { toLabel } from "./types"

const personOf = (u: Row["users"] | null | undefined): PersonDTO => ({
  userId: u?.id ?? "",
  name: u?.name ?? "",
  email: u?.email ?? "",
  color: u?.color ?? "#5b8cff",
})

const personOrNull = (u: Row["users"] | null | undefined): PersonDTO | null =>
  u ? personOf(u) : null

/** Arregla las claves foraneas que en local guardamos sueltas. */
export function indexSnapshot(s: Snapshot): Snapshot {
  const userById = new Map(s.users.map((u) => [u.id, u]))
  return {
    ...s,
    members: s.members.map((m) => ({ ...m, user: userById.get(m.user_id) ?? null })),
  }
}

export function buildState(raw: Snapshot, meId: string): BoardState {
  const s = indexSnapshot(raw)
  const userById = new Map(s.users.map((u) => [u.id, u]))
  const labelsOf = new Map<string, Row["labels"][]>()
  for (const cl of s.cardLabels) {
    const l = s.labels.find((x) => x.id === cl.label_id)
    if (!l) continue
    const list = labelsOf.get(cl.card_id) ?? []
    list.push(l)
    labelsOf.set(cl.card_id, list)
  }
  const peopleOf = new Map<string, PersonDTO[]>()
  for (const a of s.assignees) {
    const list = peopleOf.get(a.card_id) ?? []
    const u = userById.get(a.user_id)
    if (u) list.push(personOf(u))
    peopleOf.set(a.card_id, list)
  }
  const itemsOf = new Map<string, Row["items"][]>()
  for (const it of s.items) itemsOf.set(it.card_id, [...(itemsOf.get(it.card_id) ?? []), it])
  const commentsOf = new Map<string, Row["comments"][]>()
  for (const c of s.comments) commentsOf.set(c.card_id, [...(commentsOf.get(c.card_id) ?? []), c])

  const toComment = (c: Row["comments"]): CommentDTO => ({
    id: c.id,
    body: c.body,
    createdAt: c.created_at,
    author: personOf(userById.get(c.author_id)),
  })

  const columns: ColumnDTO[] = [...s.columns]
    .sort((a, b) => a.position - b.position)
    .map((col) => {
      const cards: CardDTO[] = s.cards
        .filter((c) => c.column_id === col.id)
        .sort((a, b) => a.position - b.position)
        .map((c) => {
          const items: ItemDTO[] = (itemsOf.get(c.id) ?? [])
            .sort((a, b) => a.position - b.position)
            .map((it) => ({
              id: it.id,
              text: it.title,
              done: it.done,
              position: it.position,
              dueAt: it.due_at,
              assignee: personOrNull(it.assignee_id ? userById.get(it.assignee_id) : null),
            }))
          const comments: CommentDTO[] = (commentsOf.get(c.id) ?? [])
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map(toComment)
          return {
            id: c.id,
            columnId: col.id,
            title: c.title,
            description: c.description,
            priority: c.priority,
            position: c.position,
            dueAt: c.due_at,
            completedAt: c.completed_at,
            createdAt: c.created_at,
            updatedAt: c.updated_at,
            createdBy: personOf(userById.get(c.created_by)),
            assignees: peopleOf.get(c.id) ?? [],
            labels: (labelsOf.get(c.id) ?? []).map(toLabel),
            items,
            comments,
            commentCount: comments.length,
          }
        })
      return {
        id: col.id,
        name: col.title,
        kind: kindOf(col.kind),
        position: col.position,
        wipLimit: col.wip_limit,
        cards,
      }
    })

  const kindByColumn = new Map(columns.map((c) => [c.id, c.kind]))
  const allCards = columns.flatMap((c) => c.cards)
  const now = Date.now()
  const isOpen = (card: CardDTO) => kindByColumn.get(card.columnId) !== "done"
  const assignedTo = (card: CardDTO, userId: string) => card.assignees.some((a) => a.userId === userId)

  const members: MemberDTO[] = s.members.map((m) => {
    const user = m.user
    return {
      id: m.id,
      userId: m.user_id,
      name: user?.name ?? "",
      email: user?.email ?? "",
      color: user?.color ?? "#5b8cff",
      role: (m.role === "admin" ? "admin" : "member") as Role,
      joinedAt: m.created_at,
      invitedAt: m.created_at,
      hasPendingInvite: false,
      openCards: allCards.filter((c) => isOpen(c) && assignedTo(c, m.user_id)).length,
    }
  })

  for (const inv of s.invites) {
    if (inv.accepted_at) continue
    members.push({
      id: "inv:" + inv.id,
      userId: "",
      name: inv.name,
      email: inv.email,
      color: "#64748b",
      role: inv.role,
      joinedAt: null,
      invitedAt: inv.created_at,
      hasPendingInvite: true,
      openCards: 0,
    })
  }
  members.sort((a, b) => {
    if (a.hasPendingInvite !== b.hasPendingInvite) return a.hasPendingInvite ? 1 : -1
    return (a.name || a.email).localeCompare(b.name || b.email)
  })

  const me = members.find((m) => m.userId === meId && !m.hasPendingInvite)

  const activity: ActivityDTO[] = [...s.activity]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 30)
    .map((a) => ({
      id: a.id,
      type: a.type,
      meta: a.meta,
      createdAt: a.created_at,
      cardId: a.card_id,
      cardTitle: a.card_id ? (s.cards.find((c) => c.id === a.card_id)?.title ?? null) : null,
      actor: personOrNull(a.actor_id ? userById.get(a.actor_id) : null),
    }))

  return {
    id: s.board.id,
    name: s.board.name,
    slug: s.board.slug,
    columns,
    labels: s.labels.map(toLabel),
    members,
    me: {
      userId: meId,
      name: me?.name ?? "",
      email: me?.email ?? "",
      color: me?.color ?? "#5b8cff",
      role: me?.role ?? "member",
    },
    stats: {
      total: allCards.length,
      done: allCards.filter((c) => !isOpen(c)).length,
      overdue: allCards.filter((c) => c.dueAt && new Date(c.dueAt).getTime() < now).length,
      mine: allCards.filter((c) => isOpen(c) && assignedTo(c, meId)).length,
    },
    activity,
  }
}
