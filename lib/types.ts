export type Role = "admin" | "member"

export type PersonDTO = {
  userId: string
  name: string
  email: string
  color: string
}

export type MemberDTO = PersonDTO & {
  id: string
  role: Role
  joinedAt: string | null
  invitedAt: string | null
  hasPendingInvite: boolean
  openCards: number
}

export type LabelDTO = {
  id: string
  name: string
  color: string
}

export type ItemDTO = {
  id: string
  text: string
  done: boolean
  position: number
  dueAt: string | null
  assignee: PersonDTO | null
}

export type CommentDTO = {
  id: string
  body: string
  createdAt: string
  author: PersonDTO
}

export type CardDTO = {
  id: string
  columnId: string
  title: string
  description: string
  priority: string
  position: number
  dueAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  createdBy: PersonDTO
  assignees: PersonDTO[]
  labels: LabelDTO[]
  items: ItemDTO[]
  comments: CommentDTO[]
  commentCount: number
}

export type ColumnDTO = {
  id: string
  name: string
  kind: string
  position: number
  wipLimit: number | null
  cards: CardDTO[]
}

export type ActivityDTO = {
  id: string
  type: string
  meta: string
  createdAt: string
  cardId: string | null
  cardTitle: string | null
  actor: PersonDTO | null
}

export type BoardState = {
  id: string
  name: string
  slug: string
  columns: ColumnDTO[]
  labels: LabelDTO[]
  members: MemberDTO[]
  me: {
    userId: string
    name: string
    email: string
    color: string
    role: Role
  }
  stats: {
    total: number
    done: number
    overdue: number
    mine: number
  }
  activity: ActivityDTO[]
}

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string }
