import type { ActionResult, BoardState, LabelDTO, PersonDTO, Role } from "@/lib/types"

/* ------------------------------------------------------------------ *
 * Registros crudos. Son los mismos nombres que las tablas de Supabase,
 * asi el backend local y el de Supabase comparten todo el formateo.
 * ------------------------------------------------------------------ */

export type Row = {
  users: {
    id: string
    email: string
    name: string
    color: string
    created_at: string
  }
  boards: {
    id: string
    slug: string
    name: string
    color: string
    created_by: string | null
    created_at: string
  }
  members: {
    id: string
    board_id: string
    user_id: string
    role: Role
    created_at: string
  }
  invites: {
    id: string
    board_id: string
    email: string
    name: string
    role: Role
    token: string
    created_by: string
    created_at: string
    accepted_at: string | null
  }
  columns: {
    id: string
    board_id: string
    title: string
    kind: string
    position: number
    wip_limit: number | null
  }
  cards: {
    id: string
    board_id: string
    column_id: string
    title: string
    description: string
    priority: string
    position: number
    due_at: string | null
    completed_at: string | null
    created_by: string
    created_at: string
    updated_at: string
  }
  labels: { id: string; board_id: string; name: string; color: string }
  card_labels: { card_id: string; label_id: string }
  card_assignees: { card_id: string; user_id: string }
  items: {
    id: string
    card_id: string
    title: string
    done: boolean
    position: number
    due_at: string | null
    assignee_id: string | null
  }
  comments: {
    id: string
    card_id: string
    author_id: string
    body: string
    created_at: string
  }
  activity: {
    id: string
    board_id: string
    actor_id: string | null
    type: string
    meta: string
    card_id: string | null
    created_at: string
  }
}

export type Table = keyof Row

/** Todo lo que hace falta para armar un tablero. */
export type Snapshot = {
  board: Row["boards"]
  users: Row["users"][]
  members: (Row["members"] & { user?: Row["users"] | null })[]
  invites: Row["invites"][]
  columns: Row["columns"][]
  cards: Row["cards"][]
  labels: Row["labels"][]
  cardLabels: Row["card_labels"][]
  assignees: Row["card_assignees"][]
  items: Row["items"][]
  comments: Row["comments"][]
  activity: Row["activity"][]
}

export type BoardSummary = {
  id: string
  name: string
  slug: string
  color: string
  role: Role
  memberCount: number
  cardCount: number
}

export type InviteResult = { inviteUrl: string; name: string; token: string }

export type SignInResult = { slug: string; name: string; /** Hay una invitación pendiente para este correo. */
  inviteToken?: string }

export type InviteInfo = {
  name: string
  email: string
  boardName: string
  pending: boolean
}

/** Todo lo que la interfaz puede pedir. Cada metodo devuelve el mismo
 *  formato que antes devolvian las server actions. */
export interface Api {
  backend: "local" | "supabase"
  /** Si el backend pide un PIN/contrasena compartida ademas del correo. */
  needsPin: boolean
  getSession(): Promise<PersonDTO | null>
  /** Si no hay ningun tablero todavia, para mostrar "crea el primero". */
  isFirstRun(): Promise<boolean>
  signIn(email: string, pin: string, name: string, boardName?: string): Promise<ActionResult<SignInResult>>
  signOut(): Promise<void>
  listBoards(): Promise<BoardSummary[]>
  createBoard(name: string): Promise<ActionResult<SignInResult>>
  getInvite(token: string): Promise<InviteInfo | null>
  acceptInvite(token: string): Promise<ActionResult<SignInResult>>

  getBoardState(slug: string): Promise<BoardState | null>
  renameBoard(slug: string, name: string): Promise<ActionResult>

  addMember(slug: string, email: string, name?: string): Promise<ActionResult<InviteResult>>
  resendInvite(slug: string, memberId: string): Promise<ActionResult<InviteResult>>
  setMemberRole(slug: string, memberId: string, role: Role): Promise<ActionResult>
  removeMember(slug: string, memberId: string): Promise<ActionResult>

  createColumn(slug: string, name: string, kind: string): Promise<ActionResult>
  updateColumn(
    slug: string,
    columnId: string,
    patch: { name?: string; kind?: string; wipLimit?: number | null },
  ): Promise<ActionResult>
  moveColumn(slug: string, columnId: string, position: number): Promise<ActionResult>
  deleteColumn(slug: string, columnId: string): Promise<ActionResult>

  createLabel(slug: string, name: string, color: string): Promise<ActionResult>
  updateLabel(slug: string, labelId: string, name: string, color: string): Promise<ActionResult>
  deleteLabel(slug: string, labelId: string): Promise<ActionResult>

  createCard(slug: string, columnId: string, title: string): Promise<ActionResult<{ id: string }>>
  updateCard(
    slug: string,
    cardId: string,
    patch: { title?: string; description?: string; priority?: string; dueAt?: string | null },
  ): Promise<ActionResult>
  moveCard(slug: string, cardId: string, columnId: string, position: number): Promise<ActionResult>
  deleteCard(slug: string, cardId: string): Promise<ActionResult>
  duplicateCard(slug: string, cardId: string): Promise<ActionResult<{ id: string }>>
  setAssignee(slug: string, cardId: string, userId: string, on: boolean): Promise<ActionResult>
  setCardLabel(slug: string, cardId: string, labelId: string, on: boolean): Promise<ActionResult>

  addItem(
    slug: string,
    cardId: string,
    text: string,
    dueAt?: string | null,
    assigneeId?: string | null,
  ): Promise<ActionResult>
  updateItem(
    slug: string,
    cardId: string,
    itemId: string,
    patch: { text?: string; done?: boolean; dueAt?: string | null; assigneeId?: string | null },
  ): Promise<ActionResult>
  deleteItem(slug: string, cardId: string, itemId: string): Promise<ActionResult>

  addComment(slug: string, cardId: string, body: string): Promise<ActionResult>
  deleteComment(slug: string, cardId: string, commentId: string): Promise<ActionResult>
}

/* ------------------------------ utiles ------------------------------ */

/** Base completa del modo local. */
export type Db = {
  users: Row["users"][]
  boards: Row["boards"][]
  members: Row["members"][]
  invites: Row["invites"][]
  columns: Row["columns"][]
  cards: Row["cards"][]
  labels: Row["labels"][]
  card_labels: Row["card_labels"][]
  card_assignees: Row["card_assignees"][]
  items: Row["items"][]
  comments: Row["comments"][]
  activity: Row["activity"][]
}

export const TABLES: (keyof Db)[] = [
  "users",
  "boards",
  "members",
  "invites",
  "columns",
  "cards",
  "labels",
  "card_labels",
  "card_assignees",
  "items",
  "comments",
  "activity",
]

/**
 * Identificador con forma de UUID v4, que es lo que espera Postgres.
 * randomUUID() solo existe en contextos seguros (https o localhost), asi que
 * en un hosting por http plano se construye a mano con getRandomValues, que si
 * esta disponible ahi. Un id con otra forma haria fallar todos los inserts.
 */
export function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function token(): string {
  const bytes = new Uint8Array(24)
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function toLabel(l: Row["labels"]): LabelDTO {
  return { id: l.id, name: l.name, color: l.color }
}
