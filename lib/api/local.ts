"use client"

import type { ActionResult, PersonDTO, Role } from "@/lib/types"
import { colorFor, kindOf, nameFromEmail, normalizeEmail, PRIORITY_KEYS, slugify } from "@/lib/utils"
import { DEFAULT_COLUMNS, DEFAULT_LABELS } from "@/lib/defaults"
import { buildState } from "./state"
import type { Api, BoardSummary, Db, InviteResult, Row, SignInResult, Snapshot } from "./types"
import { TABLES, token, uid } from "./types"

const DB_KEY = "kanban.local.db.v1"
const SESSION_KEY = "kanban.local.session.v1"
const GAP = 1024

const emptyDb = (): Db => ({
  users: [],
  boards: [],
  members: [],
  invites: [],
  columns: [],
  cards: [],
  labels: [],
  card_labels: [],
  card_assignees: [],
  items: [],
  comments: [],
  activity: [],
})

/* ----------------------------- almacenamiento ----------------------------- */

function read(): Db {
  if (typeof window === "undefined") return emptyDb()
  try {
    const raw = window.localStorage.getItem(DB_KEY)
    if (!raw) return emptyDb()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const db = emptyDb()
    for (const t of TABLES) {
      const rows = parsed[t]
      if (Array.isArray(rows)) Object.assign(db, { [t]: rows })
    }
    return db
  } catch {
    return emptyDb()
  }
}

function write(db: Db) {
  try {
    window.localStorage.setItem(DB_KEY, JSON.stringify(db))
  } catch {
    /* modo privado o cuota llena: la app sigue funcionando en memoria */
  }
}

/** Aplica un cambio y lo guarda. */
function edit<T>(fn: (db: Db) => T): T {
  const db = read()
  const out = fn(db)
  write(db)
  return out
}

const ok = <T,>(data?: T): ActionResult<T> => ({ ok: true, data } as ActionResult<T>)
const fail = <T = undefined,>(error: string): ActionResult<T> => ({ ok: false, error })

const now = () => new Date().toISOString()

function inviteUrl(t: string) {
  if (typeof window === "undefined") return `/invitar/?token=${t}`
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ""
  return `${window.location.origin}${base}/invitar/?token=${t}`
}

function log(
  db: Db,
  boardId: string,
  actorId: string | null,
  type: string,
  meta: Record<string, unknown> = {},
  cardId?: string | null,
) {
  db.activity.push({
    id: uid(),
    board_id: boardId,
    actor_id: actorId,
    type,
    meta: JSON.stringify(meta),
    card_id: cardId ?? null,
    created_at: now(),
  })
  if (db.activity.length > 400) db.activity = db.activity.slice(-400)
}

function findOrCreateUser(db: Db, email: string, name?: string) {
  const clean = normalizeEmail(email)
  let user = db.users.find((u) => u.email === clean)
  if (!user) {
    user = {
      id: uid(),
      email: clean,
      name: (name || nameFromEmail(clean)).slice(0, 60),
      color: colorFor(clean),
      created_at: now(),
    }
    db.users.push(user)
  } else if (name && name.trim() && user.name !== name.trim()) {
    user.name = name.trim().slice(0, 60)
  }
  return user
}

function uniqueSlug(db: Db, base: string) {
  let slug = base
  let n = 2
  while (db.boards.some((b) => b.slug === slug)) slug = `${base}-${n++}`
  return slug
}

function createBoardWithDefaults(db: Db, name: string, userId: string): Row["boards"] {
  const clean = name.trim().slice(0, 80) || "Mi Tablero"
  const board: Row["boards"] = {
    id: uid(),
    slug: uniqueSlug(db, slugify(clean) || "tablero"),
    name: clean,
    color: colorFor(clean),
    created_by: userId,
    created_at: now(),
  }
  db.boards.push(board)
  db.members.push({ id: uid(), board_id: board.id, user_id: userId, role: "admin", created_at: now() })
  DEFAULT_COLUMNS.forEach((c, i) =>
    db.columns.push({
      id: uid(),
      board_id: board.id,
      title: c.name,
      kind: c.kind,
      position: (i + 1) * GAP,
      wip_limit: null,
    }),
  )
  DEFAULT_LABELS.forEach((l) => db.labels.push({ id: uid(), board_id: board.id, name: l.name, color: l.color }))
  log(db, board.id, userId, "member.joined", { name: "" })
  return board
}

/* -------------------------------- contexto -------------------------------- */

type Ctx = {
  db: Db
  user: Row["users"]
  board: Row["boards"]
  role: Role
}

/** Devuelve el contexto o el texto del error. */
function ctx(db: Db, slug: string, admin = false): Ctx | string {
  const user = db.users.find((u) => u.id === sessionUserId())
  if (!user) return "Tu sesión expiró. Entra de nuevo."
  const board = db.boards.find((b) => b.slug === slug)
  if (!board) return "Ese tablero ya no existe."
  const member = db.members.find((m) => m.board_id === board.id && m.user_id === user.id)
  if (!member) return "No perteneces a este tablero."
  if (admin && member.role !== "admin") return "Solo un administrador puede hacer eso."
  return { db, user, board, role: member.role }
}

function sessionUserId(): string {
  if (typeof window === "undefined") return ""
  try {
    return window.localStorage.getItem(SESSION_KEY) || ""
  } catch {
    return ""
  }
}

function setSession(id: string) {
  try {
    if (id) window.localStorage.setItem(SESSION_KEY, id)
    else window.localStorage.removeItem(SESSION_KEY)
  } catch {
    /* sin espacio: la sesión dura lo que dure la pestaña */
  }
}

function snapshotOf(db: Db, board: Row["boards"]): Snapshot {
  const cards = db.cards.filter((c) => c.board_id === board.id)
  const cardIds = new Set(cards.map((c) => c.id))
  return {
    board,
    users: db.users,
    members: db.members.filter((m) => m.board_id === board.id),
    invites: db.invites.filter((i) => i.board_id === board.id),
    columns: db.columns.filter((c) => c.board_id === board.id),
    cards,
    labels: db.labels.filter((l) => l.board_id === board.id),
    cardLabels: db.card_labels.filter((cl) => cardIds.has(cl.card_id)),
    assignees: db.card_assignees.filter((a) => cardIds.has(a.card_id)),
    items: db.items.filter((i) => cardIds.has(i.card_id)),
    comments: db.comments.filter((c) => cardIds.has(c.card_id)),
    activity: db.activity.filter((a) => a.board_id === board.id),
  }
}

/* --------------------------------- adapter -------------------------------- */

export const localApi: Api = {
  backend: "local",
  needsPin: false,

  async getSession(): Promise<PersonDTO | null> {
    const db = read()
    const user = db.users.find((u) => u.id === sessionUserId())
    if (!user) return null
    return { userId: user.id, name: user.name, email: user.email, color: user.color }
  },

  async isFirstRun(): Promise<boolean> {
    return read().boards.length === 0
  },

  async signIn(email: string, _pin: string, name: string, boardName = ""): Promise<ActionResult<SignInResult>> {
    const clean = normalizeEmail(email)
    if (!clean || !clean.includes("@")) return fail("Escribe un correo válido.")
    return edit((db) => {
      const user = findOrCreateUser(db, clean, name)
      setSession(user.id)
      const first = db.members.find((m) => m.user_id === user.id)
      if (!first) {
        // Si le invitaron y todavia no entro, que vaya a la invitacion en vez
        // de crear un tablero personal de propina.
        const invite = db.invites.find((i) => i.email === clean && !i.accepted_at)
        if (invite) return ok({ slug: "", name: user.name, inviteToken: invite.token })
        const board = createBoardWithDefaults(db, boardName.trim() || "Mi Tablero", user.id)
        return ok({ slug: board.slug, name: user.name })
      }
      const board = db.boards.find((b) => b.id === first.board_id)!
      return ok({ slug: board.slug, name: user.name })
    })
  },

  async signOut() {
    setSession("")
  },

  async listBoards(): Promise<BoardSummary[]> {
    const db = read()
    const me = sessionUserId()
    return db.members
      .filter((m) => m.user_id === me)
      .map((m) => {
        const board = db.boards.find((b) => b.id === m.board_id)!
        return {
          id: board.id,
          name: board.name,
          slug: board.slug,
          color: board.color,
          role: m.role,
          memberCount: db.members.filter((x) => x.board_id === board.id).length,
          cardCount: db.cards.filter((c) => c.board_id === board.id).length,
        }
      })
      .filter((b) => !!b.slug)
  },

  async createBoard(name: string): Promise<ActionResult<SignInResult>> {
    return edit((db) => {
      const me = db.users.find((u) => u.id === sessionUserId())
      if (!me) return fail("Entra de nuevo para crear un tablero.")
      const board = createBoardWithDefaults(db, name, me.id)
      return ok({ slug: board.slug, name: me.name })
    })
  },

  async getInvite(t: string) {
    const db = read()
    const inv = db.invites.find((i) => i.token === t)
    if (!inv) return null
    const board = db.boards.find((b) => b.id === inv.board_id)
    if (!board) return null
    return { name: inv.name, email: inv.email, boardName: board.name, pending: !inv.accepted_at }
  },

  async acceptInvite(t: string): Promise<ActionResult<SignInResult>> {
    return edit((db) => {
      const invite = db.invites.find((i) => i.token === t)
      if (!invite) return fail("Ese enlace ya no sirve.")
      const me = db.users.find((u) => u.id === sessionUserId())
      if (!me) return fail("Entra con tu correo para aceptar la invitación.")
      const board = db.boards.find((b) => b.id === invite.board_id)
      if (!board) return fail("Ese tablero ya no existe.")
      if (!db.members.some((m) => m.board_id === board.id && m.user_id === me.id)) {
        db.members.push({
          id: uid(),
          board_id: board.id,
          user_id: me.id,
          role: invite.role,
          created_at: now(),
        })
        log(db, board.id, me.id, "member.joined", { name: me.name })
      }
      invite.accepted_at = now()
      return ok({ slug: board.slug, name: me.name })
    })
  },

  async getBoardState(slug: string) {
    const db = read()
    const board = db.boards.find((b) => b.slug === slug)
    if (!board) return null
    const me = sessionUserId()
    if (!db.members.some((m) => m.board_id === board.id && m.user_id === me)) return null
    return buildState(snapshotOf(db, board), me)
  },

  async renameBoard(slug, name) {
    return edit((db) => {
      const c = ctx(db, slug, true)
      if (typeof c === "string") return fail(c)
      const clean = name.trim().slice(0, 80)
      if (!clean) return fail("El nombre no puede quedar vacío.")
      c.board.name = clean
      log(db, c.board.id, c.user.id, "board.renamed", { to: clean })
      return ok()
    })
  },

  async addMember(slug, email, name) {
    return edit((db) => {
      const c = ctx(db, slug, true)
      if (typeof c === "string") return fail(c)
      const clean = normalizeEmail(email)
      if (!clean.includes("@")) return fail("Escribe un correo válido.")
      if (db.members.some((m) => m.board_id === c.board.id && m.user_id === db.users.find((u) => u.email === clean)?.id))
        return fail(`${clean} ya está en el tablero.`)
      const pending = db.invites.find((i) => i.board_id === c.board.id && i.email === clean && !i.accepted_at)
      const who = findOrCreateUser(db, clean, name)
      const inv = pending ?? {
        id: uid(),
        board_id: c.board.id,
        email: clean,
        name: who.name,
        role: "member" as Role,
        token: token(),
        created_by: c.user.id,
        created_at: now(),
        accepted_at: null,
      }
      if (!pending) {
        db.invites.push(inv)
        log(db, c.board.id, c.user.id, "member.invited", { to: who.name })
      }
      return ok({ inviteUrl: inviteUrl(inv.token), name: who.name, token: inv.token })
    })
  },

  async resendInvite(slug, memberId) {
    return edit((db) => {
      const c = ctx(db, slug, true)
      if (typeof c === "string") return fail(c)
      const inv = db.invites.find((i) => i.id === memberId.replace(/^inv:/, ""))
      if (!inv) return fail("Esa invitación ya no existe.")
      inv.token = token()
      inv.accepted_at = null
      return ok({ inviteUrl: inviteUrl(inv.token), name: inv.name, token: inv.token })
    })
  },

  async setMemberRole(slug, memberId, role) {
    return edit((db) => {
      const c = ctx(db, slug, true)
      if (typeof c === "string") return fail(c)
      if (memberId.startsWith("inv:")) {
        const inv = db.invites.find((i) => i.id === memberId.slice(4))
        if (inv) inv.role = role
        return ok()
      }
      const m = db.members.find((x) => x.id === memberId && x.board_id === c.board.id)
      if (!m) return fail("Esa persona ya no está en el tablero.")
      m.role = role
      return ok()
    })
  },

  async removeMember(slug, memberId) {
    return edit((db) => {
      const c = ctx(db, slug, true)
      if (typeof c === "string") return fail(c)
      if (memberId.startsWith("inv:")) {
        db.invites = db.invites.filter((i) => i.id !== memberId.slice(4))
        return ok()
      }
      const m = db.members.find((x) => x.id === memberId && x.board_id === c.board.id)
      if (!m) return ok()
      if (m.user_id === c.user.id) return fail("No te puedes quitar a ti mismo.")
      db.members = db.members.filter((x) => x.id !== m.id)
      db.card_assignees = db.card_assignees.filter((a) => !(a.card_id && db.cards.find((c2) => c2.id === a.card_id)?.board_id === c.board.id && a.user_id === m.user_id))
      log(db, c.board.id, c.user.id, "member.removed", { to: db.users.find((u) => u.id === m.user_id)?.name ?? "" })
      return ok()
    })
  },

  async createColumn(slug, name, kind) {
    return edit((db) => {
      const c = ctx(db, slug, true)
      if (typeof c === "string") return fail(c)
      const clean = name.trim().slice(0, 40)
      if (!clean) return fail("Escribe el nombre de la columna.")
      const last = Math.max(0, ...db.columns.filter((x) => x.board_id === c.board.id).map((x) => x.position))
      db.columns.push({
        id: uid(),
        board_id: c.board.id,
        title: clean,
        kind: kindOf(kind),
        position: last + GAP,
        wip_limit: null,
      })
      log(db, c.board.id, c.user.id, "column.created", { name: clean })
      return ok()
    })
  },

  async updateColumn(slug, columnId, patch) {
    return edit((db) => {
      const c = ctx(db, slug, true)
      if (typeof c === "string") return fail(c)
      const col = db.columns.find((x) => x.id === columnId && x.board_id === c.board.id)
      if (!col) return fail("Esa columna ya no existe.")
      if (patch.name !== undefined) {
        const clean = patch.name.trim().slice(0, 40)
        if (!clean) return fail("El nombre no puede quedar vacío.")
        col.title = clean
      }
      if (patch.kind !== undefined) col.kind = kindOf(patch.kind)
      if (patch.wipLimit !== undefined) {
        col.wip_limit = patch.wipLimit === null || patch.wipLimit <= 0 ? null : patch.wipLimit
      }
      return ok()
    })
  },

  async moveColumn(slug, columnId, position) {
    return edit((db) => {
      const c = ctx(db, slug)
      if (typeof c === "string") return fail(c)
      const col = db.columns.find((x) => x.id === columnId && x.board_id === c.board.id)
      if (!col) return fail("Esa columna ya no existe.")
      col.position = position
      rebalance(db, c.board.id, "columns")
      return ok()
    })
  },

  async deleteColumn(slug, columnId) {
    return edit((db) => {
      const c = ctx(db, slug, true)
      if (typeof c === "string") return fail(c)
      const col = db.columns.find((x) => x.id === columnId && x.board_id === c.board.id)
      if (!col) return fail("Esa columna ya no existe.")
      // las tareas se van a la primera columna que quede
      const first = db.columns
        .filter((x) => x.board_id === c.board.id && x.id !== columnId)
        .sort((a, b) => a.position - b.position)[0]
      const cards = db.cards.filter((x) => x.column_id === columnId)
      if (first) {
        let next = Math.max(0, ...db.cards.filter((x) => x.column_id === first.id).map((x) => x.position))
        for (const card of cards) {
          card.column_id = first.id
          card.position = (next += GAP)
          card.completed_at = kindOf(first.kind) === "done" ? now() : null
          card.updated_at = now()
        }
      } else {
        const cardIds = new Set(cards.map((x) => x.id))
        db.cards = db.cards.filter((x) => x.column_id !== columnId)
        db.card_labels = db.card_labels.filter((x) => !cardIds.has(x.card_id))
        db.card_assignees = db.card_assignees.filter((x) => !cardIds.has(x.card_id))
        db.items = db.items.filter((x) => !cardIds.has(x.card_id))
        db.comments = db.comments.filter((x) => !cardIds.has(x.card_id))
      }
      db.columns = db.columns.filter((x) => x.id !== columnId)
      log(db, c.board.id, c.user.id, "column.deleted", { name: col.title })
      return ok()
    })
  },

  async createLabel(slug, name, color) {
    return edit((db) => {
      const c = ctx(db, slug, true)
      if (typeof c === "string") return fail(c)
      const clean = name.trim().slice(0, 24)
      if (!clean) return fail("Escribe el nombre de la etiqueta.")
      if (db.labels.some((l) => l.board_id === c.board.id && l.name.toLowerCase() === clean.toLowerCase()))
        return fail("Ya existe una etiqueta con ese nombre.")
      db.labels.push({ id: uid(), board_id: c.board.id, name: clean, color })
      return ok()
    })
  },

  async updateLabel(slug, labelId, name, color) {
    return edit((db) => {
      const c = ctx(db, slug, true)
      if (typeof c === "string") return fail(c)
      const l = db.labels.find((x) => x.id === labelId && x.board_id === c.board.id)
      if (!l) return fail("Esa etiqueta ya no existe.")
      if (name.trim()) l.name = name.trim().slice(0, 24)
      if (color) l.color = color
      return ok()
    })
  },

  async deleteLabel(slug, labelId) {
    return edit((db) => {
      const c = ctx(db, slug, true)
      if (typeof c === "string") return fail(c)
      db.card_labels = db.card_labels.filter((x) => x.label_id !== labelId)
      db.labels = db.labels.filter((x) => x.id !== labelId)
      return ok()
    })
  },

  async createCard(slug, columnId, title) {
    return edit((db) => {
      const c = ctx(db, slug)
      if (typeof c === "string") return fail(c)
      const col = db.columns.find((x) => x.id === columnId && x.board_id === c.board.id)
      if (!col) return fail("Esa columna ya no existe.")
      const clean = title.trim().slice(0, 200)
      if (!clean) return fail("Escribe el título de la tarea.")
      const last = Math.max(0, ...db.cards.filter((x) => x.column_id === columnId).map((x) => x.position))
      const card: Row["cards"] = {
        id: uid(),
        board_id: c.board.id,
        column_id: columnId,
        title: clean,
        description: "",
        priority: "normal",
        position: last + GAP,
        due_at: null,
        completed_at: kindOf(col.kind) === "done" ? now() : null,
        created_by: c.user.id,
        created_at: now(),
        updated_at: now(),
      }
      db.cards.push(card)
      log(db, c.board.id, c.user.id, "card.created", { title: clean }, card.id)
      return ok({ id: card.id })
    })
  },

  async updateCard(slug, cardId, patch) {
    return edit((db) => {
      const c = ctx(db, slug)
      if (typeof c === "string") return fail(c)
      const card = db.cards.find((x) => x.id === cardId && x.board_id === c.board.id)
      if (!card) return fail("Esa tarea ya no existe.")
      if (patch.title !== undefined) {
        const clean = patch.title.trim().slice(0, 200)
        if (!clean) return fail("El título no puede quedar vacío.")
        card.title = clean
        log(db, c.board.id, c.user.id, "card.renamed", { title: clean }, card.id)
      }
      if (patch.description !== undefined) card.description = patch.description.slice(0, 8000)
      if (patch.priority !== undefined) card.priority = (PRIORITY_KEYS as string[]).includes(patch.priority) ? patch.priority : "normal"
      if (patch.dueAt !== undefined) card.due_at = patch.dueAt || null
      card.updated_at = now()
      return ok()
    })
  },

  async moveCard(slug, cardId, columnId, position) {
    return edit((db) => {
      const c = ctx(db, slug)
      if (typeof c === "string") return fail(c)
      const card = db.cards.find((x) => x.id === cardId && x.board_id === c.board.id)
      const col = db.columns.find((x) => x.id === columnId && x.board_id === c.board.id)
      if (!card || !col) return fail("Esa tarea ya no existe.")
      const from = db.columns.find((x) => x.id === card.column_id)
      const wasDone = from ? kindOf(from.kind) === "done" : false
      const goingToDone = kindOf(col.kind) === "done"
      card.column_id = columnId
      card.position = position
      card.completed_at = goingToDone ? now() : null
      card.updated_at = now()
      rebalance(db, c.board.id, "cards", columnId)
      if (from && from.id !== col.id) {
        log(db, c.board.id, c.user.id, "card.moved", { title: card.title, to: col.title }, card.id)
        if (goingToDone && !wasDone) log(db, c.board.id, c.user.id, "card.done", { title: card.title }, card.id)
      }
      return ok()
    })
  },

  async deleteCard(slug, cardId) {
    return edit((db) => {
      const c = ctx(db, slug)
      if (typeof c === "string") return fail(c)
      const card = db.cards.find((x) => x.id === cardId && x.board_id === c.board.id)
      if (!card) return ok()
      db.cards = db.cards.filter((x) => x.id !== cardId)
      db.card_labels = db.card_labels.filter((x) => x.card_id !== cardId)
      db.card_assignees = db.card_assignees.filter((x) => x.card_id !== cardId)
      db.items = db.items.filter((x) => x.card_id !== cardId)
      db.comments = db.comments.filter((x) => x.card_id !== cardId)
      log(db, c.board.id, c.user.id, "card.deleted", { title: card.title })
      return ok()
    })
  },

  async duplicateCard(slug, cardId) {
    return edit((db) => {
      const c = ctx(db, slug)
      if (typeof c === "string") return fail(c)
      const src = db.cards.find((x) => x.id === cardId && x.board_id === c.board.id)
      if (!src) return fail("Esa tarea ya no existe.")
      const last = Math.max(0, ...db.cards.filter((x) => x.column_id === src.column_id).map((x) => x.position))
      const copy: Row["cards"] = {
        ...src,
        id: uid(),
        title: `${src.title} (copia)`.slice(0, 200),
        position: last + GAP,
        completed_at: null,
        created_by: c.user.id,
        created_at: now(),
        updated_at: now(),
      }
      db.cards.push(copy)
      for (const a of db.card_assignees.filter((x) => x.card_id === src.id))
        db.card_assignees.push({ card_id: copy.id, user_id: a.user_id })
      for (const l of db.card_labels.filter((x) => x.card_id === src.id))
        db.card_labels.push({ card_id: copy.id, label_id: l.label_id })
      const items = db.items
        .filter((x) => x.card_id === src.id)
        .sort((a, b) => a.position - b.position)
        .map((it, i) => ({
          id: uid(),
          card_id: copy.id,
          title: it.title,
          done: it.done,
          position: (i + 1) * GAP,
          due_at: it.due_at,
          assignee_id: it.assignee_id,
        }))
      db.items.push(...items)
      return ok({ id: copy.id })
    })
  },

  async setAssignee(slug, cardId, userId, on) {
    return edit((db) => {
      const c = ctx(db, slug)
      if (typeof c === "string") return fail(c)
      const card = db.cards.find((x) => x.id === cardId && x.board_id === c.board.id)
      if (!card) return fail("Esa tarea ya no existe.")
      const has = db.card_assignees.some((a) => a.card_id === cardId && a.user_id === userId)
      if (on) {
        if (!db.members.some((m) => m.board_id === c.board.id && m.user_id === userId))
          return fail("Esa persona no está en el tablero.")
        if (!has) {
          db.card_assignees.push({ card_id: cardId, user_id: userId })
          log(db, c.board.id, c.user.id, "card.assigned", { title: card.title, to: db.users.find((u) => u.id === userId)?.name ?? "" }, cardId)
        }
      } else {
        db.card_assignees = db.card_assignees.filter((a) => !(a.card_id === cardId && a.user_id === userId))
      }
      return ok()
    })
  },

  async setCardLabel(slug, cardId, labelId, on) {
    return edit((db) => {
      const c = ctx(db, slug)
      if (typeof c === "string") return fail(c)
      const card = db.cards.find((x) => x.id === cardId && x.board_id === c.board.id)
      if (!card) return fail("Esa tarea ya no existe.")
      const has = db.card_labels.some((l) => l.card_id === cardId && l.label_id === labelId)
      if (on) {
        if (!db.labels.some((l) => l.id === labelId && l.board_id === c.board.id))
          return fail("Esa etiqueta ya no existe.")
        if (!has) db.card_labels.push({ card_id: cardId, label_id: labelId })
      } else {
        db.card_labels = db.card_labels.filter((l) => !(l.card_id === cardId && l.label_id === labelId))
      }
      return ok()
    })
  },

  async addItem(slug, cardId, text, dueAt, assigneeId) {
    return edit((db) => {
      const c = ctx(db, slug)
      if (typeof c === "string") return fail(c)
      const card = db.cards.find((x) => x.id === cardId && x.board_id === c.board.id)
      if (!card) return fail("Esa tarea ya no existe.")
      const clean = text.trim().slice(0, 200)
      if (!clean) return fail("Escribe el paso.")
      const last = Math.max(0, ...db.items.filter((x) => x.card_id === cardId).map((x) => x.position))
      db.items.push({
        id: uid(),
        card_id: cardId,
        title: clean,
        done: false,
        position: last + GAP,
        due_at: dueAt || null,
        assignee_id: assigneeId || null,
      })
      return ok()
    })
  },

  async updateItem(slug, cardId, itemId, patch) {
    return edit((db) => {
      const c = ctx(db, slug)
      if (typeof c === "string") return fail(c)
      const it = db.items.find((x) => x.id === itemId && x.card_id === cardId)
      if (!it) return fail("Ese paso ya no existe.")
      if (patch.text !== undefined) it.title = patch.text.trim().slice(0, 200)
      if (patch.done !== undefined) it.done = patch.done
      if (patch.dueAt !== undefined) it.due_at = patch.dueAt || null
      if (patch.assigneeId !== undefined) it.assignee_id = patch.assigneeId || null
      return ok()
    })
  },

  async deleteItem(slug, cardId, itemId) {
    return edit((db) => {
      const c = ctx(db, slug)
      if (typeof c === "string") return fail(c)
      db.items = db.items.filter((x) => x.id !== itemId || x.card_id !== cardId)
      return ok()
    })
  },

  async addComment(slug, cardId, body) {
    return edit((db) => {
      const c = ctx(db, slug)
      if (typeof c === "string") return fail(c)
      const card = db.cards.find((x) => x.id === cardId && x.board_id === c.board.id)
      if (!card) return fail("Esa tarea ya no existe.")
      const clean = body.trim().slice(0, 2000)
      if (!clean) return fail("Escribe algo primero.")
      db.comments.push({ id: uid(), card_id: cardId, author_id: c.user.id, body: clean, created_at: now() })
      log(db, c.board.id, c.user.id, "card.commented", { title: card.title }, cardId)
      return ok()
    })
  },

  async deleteComment(slug, cardId, commentId) {
    return edit((db) => {
      const c = ctx(db, slug)
      if (typeof c === "string") return fail(c)
      db.comments = db.comments.filter((x) => !(x.id === commentId && x.card_id === cardId))
      return ok()
    })
  },
}

/** Reparte posiciones 1024, 2048... cuando dos quedan casi iguales. */
function rebalance(db: Db, boardId: string, what: "cards" | "columns", columnId?: string) {
  if (what === "columns") {
    const cols = db.columns.filter((c) => c.board_id === boardId).sort((a, b) => a.position - b.position)
    if (cols.some((c, i) => i > 0 && c.position - cols[i - 1].position < 0.001))
      cols.forEach((c, i) => (c.position = (i + 1) * GAP))
    return
  }
  const cards = db.cards
    .filter((c) => c.board_id === boardId && c.column_id === columnId)
    .sort((a, b) => a.position - b.position)
  if (cards.some((c, i) => i > 0 && c.position - cards[i - 1].position < 0.001))
    cards.forEach((c, i) => (c.position = (i + 1) * GAP))
}
