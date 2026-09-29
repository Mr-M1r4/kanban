"use client"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { ActionResult, PersonDTO, Role } from "@/lib/types"
import { colorFor, kindOf, nameFromEmail, normalizeEmail, PRIORITY_KEYS, slugify } from "@/lib/utils"
import { buildState } from "./state"
import type { Api, BoardSummary, InviteResult, Row, SignInResult, Snapshot, Table } from "./types"
import { token, uid } from "./types"

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

let client: SupabaseClient | null = null
function sb(): SupabaseClient {
  if (!client) {
    if (!URL || !KEY) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY")
    client = createClient(URL, KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "kanban.supabase.auth" },
    })
  }
  return client
}

const ok = <T,>(data?: T): ActionResult<T> => ({ ok: true, data } as ActionResult<T>)
const fail = <T = undefined,>(error: string): ActionResult<T> => ({ ok: false, error })
const now = () => new Date().toISOString()

/** Envuelve una operacion: exige sesion y convierte errores de Supabase. */
async function run<T>(fn: (me: string) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  let me = ""
  try {
    const { data, error } = await sb().auth.getUser()
    if (error || !data.user) return fail("Tu sesión expiró. Entra de nuevo.")
    me = data.user.id
    return await fn(me)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("Faltan NEXT_PUBLIC")) throw e
    // El mensaje que ve la persona es generico, pero el motivo real se queda
    // en la consola: sin esto un rechazo de RLS parece un fallo de red.
    console.error("[kanban]", msg)
    return fail("No se pudo guardar el cambio. Revisa tu conexión.")
  }
}

/**
 * Ejecuta una escritura y convierte el error de Supabase en una excepcion.
 * Sin esto un rechazo de RLS pasaria por guardado correcto.
 */
async function write<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data
}

async function first<T>(q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? [])[0] as T
}

async function all<T>(q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

const table = (t: Table) => sb().from(t as string)

function inviteUrl(t: string) {
  if (typeof window === "undefined") return `/invitar/?token=${t}`
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ""
  return `${window.location.origin}${base}/invitar/?token=${t}`
}

async function log(me: string, boardId: string, type: string, meta: Record<string, unknown> = {}, cardId?: string | null) {
  await table("activity")
    .insert({ id: uid(), board_id: boardId, actor_id: me, type, meta: JSON.stringify(meta), card_id: cardId ?? null, created_at: now() })
    .then(() => undefined, () => undefined)
}

async function ensureProfile(me: string, email: string, name?: string) {
  const existing = await first<Row["users"]>(table("users").select("*").eq("id", me))
  if (existing) return existing
  const clean = normalizeEmail(email)
  const row: Row["users"] = {
    id: me,
    email: clean,
    name: (name || nameFromEmail(clean)).slice(0, 60),
    color: colorFor(clean),
    created_at: now(),
  }
  await write(table("users").insert(row))
  return row
}

/**
 * Crea el tablero con sus columnas y etiquetas.
 *
 * Va contra la funcion create_board_with_defaults: el RLS no permite insertar
 * el primer miembro ni las columnas a mano, y que el slug este libre se
 * comprueba dentro de la funcion (las politicas de lectura ocultan los
 * tableros de otras personas, asi que desde el cliente no se podria ver).
 */
async function createBoardWithDefaults(name: string) {
  const clean = name.trim().slice(0, 80) || "Mi Tablero"
  const { data, error } = await sb().rpc("create_board_with_defaults", {
    p_name: clean,
    p_slug: slugify(clean) || "tablero",
  })
  if (error) throw new Error(error.message)
  // La funcion devuelve una fila, pero segun la version llega como objeto o
  // como lista de una: se acepta cualquiera de las dos.
  const board = (Array.isArray(data) ? data[0] : data) as Row["boards"] | null
  if (!board) throw new Error("No se pudo crear el tablero.")
  // El color se elige en el cliente; la funcion pone uno por defecto.
  const color = colorFor(clean)
  await write(table("boards").update({ color }).eq("id", board.id))
  return { ...board, color }
}

/** Board + rol de quien pregunta. Falla si no es miembro. */
async function boardCtx(slug: string, me: string, admin = false) {
  const board = await first<Row["boards"]>(table("boards").select("*").eq("slug", slug))
  if (!board) return null
  const member = await first<Row["members"]>(table("members").select("*").eq("board_id", board.id).eq("user_id", me))
  if (!member || !board) return null
  if (admin && member.role !== "admin") return null
  return { board, role: member.role }
}

export const supabaseApi: Api = {
  backend: "supabase",
  needsPin: true,

  async getSession(): Promise<PersonDTO | null> {
    const { data, error } = await sb().auth.getUser()
    if (error || !data.user) return null
    const profile = await first<Row["users"]>(table("users").select("*").eq("id", data.user.id))
    const p = profile
    return {
      userId: data.user.id,
      name: p?.name || nameFromEmail(data.user.email || ""),
      email: p?.email || data.user.email || "",
      color: p?.color || colorFor(data.user.email || ""),
    }
  },

  async isFirstRun(): Promise<boolean> {
    const { data } = await sb().auth.getUser()
    if (!data.user) return false
    const mine = await first<{ id: string }>(table("boards").select("id").eq("created_by", data.user.id))
    return !mine
  },

  async signIn(email, pin, name, boardName = ""): Promise<ActionResult<SignInResult>> {
    const clean = normalizeEmail(email)
    if (!clean.includes("@")) return fail("Escribe un correo válido.")
    if (!URL || !KEY) return fail("Este tablero no tiene base de datos conectada.")
    const password = pin.trim() || "kanban"
    let signedIn = false
    const attempt = await sb().auth.signInWithPassword({ email: clean, password })
    if (!attempt.error) signedIn = true
    if (!signedIn) {
      const created = await sb().auth.signUp({ email: clean, password, options: { data: { name } } })
      if (created.error && !/already registered/i.test(created.error.message)) {
        return fail("Correo o PIN incorrectos.")
      }
      if (!created.data.session) {
        const retry = await sb().auth.signInWithPassword({ email: clean, password })
        if (retry.error) return fail("Correo o PIN incorrectos.")
      }
    }
    const me = (await sb().auth.getUser()).data.user
    if (!me) return fail("Correo o PIN incorrectos.")
    const profile = await ensureProfile(me.id, clean, name)
    // Sin ordenar, Postgres devuelve cualquier membresia y se entra a un
    // tablero distinto cada vez. La mas antigua manda.
    const first_membership = await first<Row["members"]>(
      table("members").select("*").eq("user_id", me.id).order("created_at", { ascending: true }),
    )
    if (!first_membership) {
      // Si le invitaron y todavia no entro, que vaya a la invitacion en vez de
      // crear un tablero personal de propina.
      const invite = await first<Row["invites"]>(
        table("invites").select("*").eq("email", clean).is("accepted_at", null),
      )
      if (invite) return ok({ slug: "", name: profile.name, inviteToken: invite.token })
      const board = await createBoardWithDefaults(boardName.trim() || "Mi Tablero")
      return ok({ slug: board.slug, name: profile.name })
    }
    const board = await first<Row["boards"]>(table("boards").select("*").eq("id", first_membership.board_id))
    return ok({ slug: board?.slug ?? "", name: profile?.name ?? "" })
  },

  async signOut() {
    await sb().auth.signOut()
  },

  async listBoards(): Promise<BoardSummary[]> {
    const { data } = await sb().auth.getUser()
    if (!data.user) return []
    const memberships = await all<Row["members"]>(table("members").select("*").eq("user_id", data.user.id))
    const list = memberships
    const out: BoardSummary[] = []
    for (const m of list) {
      const board = await first<Row["boards"]>(table("boards").select("*").eq("id", m.board_id))
      if (!board) continue
      const [members, cards] = await Promise.all([
        all<{ id: string }>(table("members").select("id").eq("board_id", board.id)),
        all<{ id: string }>(table("cards").select("id").eq("board_id", board.id)),
      ])
      out.push({
        id: board.id,
        name: board.name,
        slug: board.slug,
        color: board.color,
        role: m.role,
        memberCount: members.length,
        cardCount: cards.length,
      })
    }
    return out
  },

  async createBoard(name): Promise<ActionResult<SignInResult>> {
    return run(async (me) => {
      const profile = await first<Row["users"]>(table("users").select("*").eq("id", me))
      const board = await createBoardWithDefaults(name)
      return ok({ slug: board.slug, name: profile?.name ?? "" })
    })
  },

  async getInvite(t) {
    const { data } = await sb().auth.getUser()
    if (!data.user) return null
    const inv = await first<Row["invites"]>(table("invites").select("*").eq("token", t))
    if (!inv) return null
    const board = (await first(table("boards").select("*").eq("id", inv.board_id))) as Row["boards"] | undefined
    if (!board) return null
    return { name: inv.name, email: inv.email, boardName: board.name, pending: !inv.accepted_at }
  },

  async acceptInvite(t): Promise<ActionResult<SignInResult>> {
    return run(async (me) => {
      const invite = await first<Row["invites"]>(table("invites").select("*").eq("token", t).is("accepted_at", null))
      if (!invite) return fail("Ese enlace ya no sirve.")
      const existing = await first<Row["members"]>(table("members").select("*").eq("board_id", invite.board_id).eq("user_id", me))
      if (!existing) {
        await write(table("members").insert({ id: uid(), board_id: invite.board_id, user_id: me, role: invite.role, created_at: now() }))
        await log(me, invite.board_id, "member.joined", { name: "" })
      }
      await write(table("invites").update({ accepted_at: now() }).eq("id", invite.id))
      const board = await first<Row["boards"]>(table("boards").select("*").eq("id", invite.board_id))
      const profile = await first<Row["users"]>(table("users").select("*").eq("id", me))
      return ok({ slug: board?.slug ?? "", name: profile?.name ?? invite.name })
    })
  },

  async getBoardState(slug) {
    const { data } = await sb().auth.getUser()
    if (!data.user) return null
    const ctx = await boardCtx(slug, data.user.id)
    if (!ctx) return null
    const bid = ctx.board.id
    const [users, members, invites, columns, cards, labels] = await Promise.all([
      all<Row["users"]>(table("users").select("*")),
      all<Row["members"]>(table("members").select("*").eq("board_id", bid)),
      all<Row["invites"]>(table("invites").select("*").eq("board_id", bid)),
      all<Row["columns"]>(table("columns").select("*").eq("board_id", bid)),
      all<Row["cards"]>(table("cards").select("*").eq("board_id", bid)),
      all<Row["labels"]>(table("labels").select("*").eq("board_id", bid)),
    ])
    const cardList = cards
    const ids = cardList.map((c) => c.id)
    const empty: never[] = []
    const [cardLabels, assignees, items, comments, activity] = await Promise.all([
      ids.length ? all<Row["card_labels"]>(table("card_labels").select("*").in("card_id", ids)) : empty,
      ids.length ? all<Row["card_assignees"]>(table("card_assignees").select("*").in("card_id", ids)) : empty,
      ids.length ? all<Row["items"]>(table("items").select("*").in("card_id", ids)) : empty,
      ids.length ? all<Row["comments"]>(table("comments").select("*").in("card_id", ids)) : empty,
      all<Row["activity"]>(
        table("activity").select("*").eq("board_id", bid).order("created_at", { ascending: false }).limit(30),
      ),
    ])
    const snapshot: Snapshot = {
      board: ctx.board,
      users: users as Row["users"][],
      members: members as Row["members"][],
      invites: invites as Row["invites"][],
      columns: columns as Row["columns"][],
      cards: cardList,
      labels: labels as Row["labels"][],
      cardLabels,
      assignees,
      items,
      comments,
      activity: activity as Row["activity"][],
    }
    return buildState(snapshot, data.user.id)
  },

  async renameBoard(slug, name) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me, true)
      if (!ctx) return fail("Solo un administrador puede renombrar el tablero.")
      const clean = name.trim().slice(0, 80)
      if (!clean) return fail("El nombre no puede quedar vacío.")
      await write(table("boards").update({ name: clean }).eq("id", ctx.board.id))
      await log(me, ctx.board.id, "board.renamed", { to: clean })
      return ok()
    })
  },

  async addMember(slug, email, name): Promise<ActionResult<InviteResult>> {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me, true)
      if (!ctx) return fail("Solo un administrador puede agregar gente.")
      const clean = normalizeEmail(email)
      if (!clean.includes("@")) return fail("Escribe un correo válido.")
      const pending = await first<Row["invites"]>(
        table("invites").select("*").eq("board_id", ctx.board.id).eq("email", clean).is("accepted_at", null),
      )
      const inv = pending ?? {
        id: uid(),
        board_id: ctx.board.id,
        email: clean,
        name: (name || nameFromEmail(clean)).slice(0, 60),
        role: "member" as Role,
        token: token(),
        created_by: me,
        created_at: now(),
        accepted_at: null,
      }
      if (!pending) {
        await write(table("invites").insert(inv))
        await log(me, ctx.board.id, "member.invited", { to: inv.name })
      }
      return ok({ inviteUrl: inviteUrl(inv.token), name: inv.name, token: inv.token })
    })
  },

  async resendInvite(slug, memberId): Promise<ActionResult<InviteResult>> {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me, true)
      if (!ctx) return fail("Solo un administrador puede hacer eso.")
      const invId = memberId.replace(/^inv:/, "")
      const before = await first<Row["invites"]>(table("invites").select("*").eq("id", invId))
      if (!before) return fail("Esa invitacion ya no existe.")
      const fresh = token()
      await write(table("invites").update({ token: fresh, accepted_at: null }).eq("id", invId))
      return ok({ inviteUrl: inviteUrl(fresh), name: before.name, token: fresh })
    })
  },

  async setMemberRole(slug, memberId, role) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me, true)
      if (!ctx) return fail("Solo un administrador puede cambiar permisos.")
      if (memberId.startsWith("inv:")) {
        const changed = (await write(table("invites").update({ role }).eq("id", memberId.slice(4)).select("id"))) ?? []
        if (!changed.length) return fail("Esa invitacion ya no existe.")
        return ok()
      }
      const changed =
        (await write(
          table("members").update({ role }).eq("id", memberId).eq("board_id", ctx.board.id).select("id"),
        )) ?? []
      if (!changed.length) return fail("Esa persona ya no es miembro del tablero.")
      return ok()
    })
  },

  async removeMember(slug, memberId) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me, true)
      if (!ctx) return fail("Solo un administrador puede quitar gente.")
      if (memberId.startsWith("inv:")) {
        const gone = (await write(table("invites").delete().eq("id", memberId.slice(4)).select("id"))) ?? []
        if (!gone.length) return fail("Esa invitacion ya no existe.")
        return ok()
      }
      if (memberId === "") return fail("No te puedes quitar a ti mismo.")
      const victim = await first<Row["members"]>(
        table("members").select("*").eq("id", memberId).eq("board_id", ctx.board.id),
      )
      if (!victim) return fail("Esa persona ya no es miembro del tablero.")
      if (victim.user_id === me) return fail("No te puedes quitar a ti mismo.")
      await write(table("card_assignees").delete().eq("user_id", victim.user_id).in(
        "card_id",
        (await all<{ id: string }>(table("cards").select("id").eq("board_id", ctx.board.id))).map((c) => (c as { id: string }).id),
      ))
      await write(table("members").delete().eq("id", memberId))
      const user = await first<Row["users"]>(table("users").select("*").eq("id", victim.user_id))
      await log(me, ctx.board.id, "member.removed", { to: user?.name ?? "" })
      return ok()
    })
  },

  async createColumn(slug, name, kind) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me, true)
      if (!ctx) return fail("Solo un administrador puede crear columnas.")
      const clean = name.trim().slice(0, 40)
      if (!clean) return fail("Escribe el nombre de la columna.")
      const last = Math.max(
        0,
        ...(await all<{ position: number }>(table("columns").select("position").eq("board_id", ctx.board.id))).map(
          (c) => c.position,
        ),
      )
      await write(table("columns").insert({
        id: uid(),
        board_id: ctx.board.id,
        title: clean,
        kind: kindOf(kind),
        position: last + 1024,
        wip_limit: null,
      }))
      await log(me, ctx.board.id, "column.created", { name: clean })
      return ok()
    })
  },

  async updateColumn(slug, columnId, patch) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me, true)
      if (!ctx) return fail("Solo un administrador puede editar columnas.")
      const data: Record<string, unknown> = {}
      if (patch.name !== undefined) {
        const clean = patch.name.trim().slice(0, 40)
        if (!clean) return fail("El nombre no puede quedar vacío.")
        data.title = clean
      }
      if (patch.kind !== undefined) data.kind = kindOf(patch.kind)
      if (patch.wipLimit !== undefined) data.wip_limit = patch.wipLimit === null || patch.wipLimit <= 0 ? null : patch.wipLimit
      if (Object.keys(data).length) await table("columns").update(data).eq("id", columnId).eq("board_id", ctx.board.id)
      return ok()
    })
  },

  async moveColumn(slug, columnId, position) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me)
      if (!ctx) return fail("No perteneces a este tablero.")
      await write(table("columns").update({ position }).eq("id", columnId).eq("board_id", ctx.board.id))
      await rebalance("columns", ctx.board.id)
      return ok()
    })
  },

  async deleteColumn(slug, columnId) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me, true)
      if (!ctx) return fail("Solo un administrador puede borrar columnas.")
      const col = await first<Row["columns"]>(
        table("columns").select("*").eq("id", columnId).eq("board_id", ctx.board.id),
      )
      if (!col) return fail("Esa columna ya no existe.")
      const total = await all<{ id: string }>(table("columns").select("id").eq("board_id", ctx.board.id))
      if (total.length <= 1) return fail("El tablero necesita al menos una columna.")
      const cards = (await all<{ id: string }>(table("cards").select("id").eq("column_id", columnId))) as { id: string }[]
      if (cards.length) {
        const ids = cards.map((c) => c.id)
        await write(table("card_labels").delete().in("card_id", ids))
        await write(table("card_assignees").delete().in("card_id", ids))
        await write(table("items").delete().in("card_id", ids))
        await write(table("comments").delete().in("card_id", ids))
        await write(table("cards").delete().in("id", ids))
      }
      await write(table("columns").delete().eq("id", columnId))
      await log(me, ctx.board.id, "column.deleted", { name: col.title })
      return ok()
    })
  },

  async createLabel(slug, name, color) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me, true)
      if (!ctx) return fail("Solo un administrador puede crear etiquetas.")
      const clean = name.trim().slice(0, 24)
      if (!clean) return fail("Escribe el nombre de la etiqueta.")
      const dupe = await first(table("labels").select("id").eq("board_id", ctx.board.id).ilike("name", clean)
      )
      if (dupe) return fail("Ya existe una etiqueta con ese nombre.")
      await write(table("labels").insert({ id: uid(), board_id: ctx.board.id, name: clean, color }))
      return ok()
    })
  },

  async updateLabel(slug, labelId, name, color) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me, true)
      if (!ctx) return fail("Solo un administrador puede editar etiquetas.")
      const data: Record<string, unknown> = {}
      if (name.trim()) data.name = name.trim().slice(0, 24)
      if (color) data.color = color
      if (Object.keys(data).length) await table("labels").update(data).eq("id", labelId).eq("board_id", ctx.board.id)
      return ok()
    })
  },

  async deleteLabel(slug, labelId) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me, true)
      if (!ctx) return fail("Solo un administrador puede borrar etiquetas.")
      await write(table("card_labels").delete().eq("label_id", labelId))
      await write(table("labels").delete().eq("id", labelId))
      return ok()
    })
  },

  async createCard(slug, columnId, title) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me)
      if (!ctx) return fail("No perteneces a este tablero.")
      const col = await first<Row["columns"]>(
        table("columns").select("*").eq("id", columnId).eq("board_id", ctx.board.id),
      )
      if (!col) return fail("Esa columna ya no existe.")
      const clean = title.trim().slice(0, 200)
      if (!clean) return fail("Escribe el título de la tarea.")
      const last = Math.max(
        0,
        ...(await all<{ position: number }>(table("cards").select("position").eq("column_id", columnId))).map(
          (c) => c.position,
        ),
      )
      const card: Row["cards"] = {
        id: uid(),
        board_id: ctx.board.id,
        column_id: columnId,
        title: clean,
        description: "",
        priority: "normal",
        position: last + 1024,
        due_at: null,
        completed_at: kindOf(col.kind) === "done" ? now() : null,
        created_by: me,
        created_at: now(),
        updated_at: now(),
      }
      await write(table("cards").insert(card))
      await log(me, ctx.board.id, "card.created", { title: clean }, card.id)
      return ok({ id: card.id })
    })
  },

  async updateCard(slug, cardId, patch) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me)
      if (!ctx) return fail("No perteneces a este tablero.")
      const card = await first<Row["cards"]>(table("cards").select("*").eq("id", cardId).eq("board_id", ctx.board.id))
      if (!card) return fail("Esa tarea ya no existe.")
      const data: Record<string, unknown> = {}
      if (patch.title !== undefined) {
        const clean = patch.title.trim().slice(0, 200)
        if (!clean) return fail("El título no puede quedar vacío.")
        data.title = clean
      }
      if (patch.description !== undefined) data.description = patch.description.slice(0, 8000)
      if (patch.priority !== undefined) data.priority = (PRIORITY_KEYS as string[]).includes(patch.priority) ? patch.priority : "normal"
      if (patch.dueAt !== undefined) data.due_at = patch.dueAt || null
      if (!Object.keys(data).length) return ok()
      data.updated_at = now()
      await write(table("cards").update(data).eq("id", cardId))
      if (data.title) await log(me, ctx.board.id, "card.renamed", { title: data.title }, cardId)
      return ok()
    })
  },

  async moveCard(slug, cardId, columnId, position) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me)
      if (!ctx) return fail("No perteneces a este tablero.")
      const [card, col] = await Promise.all([
        first(table("cards").select("*").eq("id", cardId).eq("board_id", ctx.board.id)),
        first(table("columns").select("*").eq("id", columnId).eq("board_id", ctx.board.id)),
      ])
      const c = card as Row["cards"] | undefined
      const column = col as Row["columns"] | undefined
      if (!c || !column) return fail("Esa tarea ya no existe.")
      const from = await first<Row["columns"]>(table("columns").select("*").eq("id", c.column_id))
      const wasDone = from ? kindOf(from.kind) === "done" : false
      const goingToDone = kindOf(column.kind) === "done"
      await table("cards")
        .update({ column_id: columnId, position, completed_at: goingToDone ? now() : null, updated_at: now() })
        .eq("id", cardId)
      await rebalance("cards", ctx.board.id, columnId)
      if (from && from.id !== column.id) {
        await log(me, ctx.board.id, "card.moved", { title: c.title, to: column.title }, cardId)
        if (goingToDone && !wasDone) await log(me, ctx.board.id, "card.done", { title: c.title }, cardId)
      }
      return ok()
    })
  },

  async deleteCard(slug, cardId) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me)
      if (!ctx) return fail("No perteneces a este tablero.")
      const card = await first<Row["cards"]>(table("cards").select("*").eq("id", cardId).eq("board_id", ctx.board.id))
      if (!card) return ok()
      await write(table("card_labels").delete().eq("card_id", cardId))
      await write(table("card_assignees").delete().eq("card_id", cardId))
      await write(table("items").delete().eq("card_id", cardId))
      await write(table("comments").delete().eq("card_id", cardId))
      await write(table("cards").delete().eq("id", cardId))
      await log(me, ctx.board.id, "card.deleted", { title: card.title })
      return ok()
    })
  },

  async duplicateCard(slug, cardId) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me)
      if (!ctx) return fail("No perteneces a este tablero.")
      const src = await first<Row["cards"]>(table("cards").select("*").eq("id", cardId).eq("board_id", ctx.board.id))
      if (!src) return fail("Esa tarea ya no existe.")
      const last = Math.max(
        0,
        ...(await all<{ position: number }>(table("cards").select("position").eq("column_id", src.column_id))).map(
          (c) => c.position,
        ),
      )
      const copy: Row["cards"] = {
        ...src,
        id: uid(),
        title: `${src.title} (copia)`.slice(0, 200),
        position: last + 1024,
        completed_at: null,
        created_by: me,
        created_at: now(),
        updated_at: now(),
      }
      await write(table("cards").insert(copy))
      const [assignees, labels, items] = await Promise.all([
        all<Row["card_assignees"]>(table("card_assignees").select("*").eq("card_id", src.id)),
        all<Row["card_labels"]>(table("card_labels").select("*").eq("card_id", src.id)),
        all<Row["items"]>(table("items").select("*").eq("card_id", src.id)),
      ])
      if (assignees.length) await table("card_assignees").insert(assignees.map((a) => ({ card_id: copy.id, user_id: a.user_id })))
      if (labels.length) await table("card_labels").insert(labels.map((l) => ({ card_id: copy.id, label_id: l.label_id })))
      const ordered = [...items].sort((a, b) => a.position - b.position)
      if (ordered.length)
        await write(table("items").insert(
          ordered.map((it, i) => ({
            id: uid(),
            card_id: copy.id,
            title: it.title,
            done: it.done,
            position: (i + 1) * 1024,
            due_at: it.due_at,
            assignee_id: it.assignee_id,
          })),
        ))
      return ok({ id: copy.id })
    })
  },

  async setAssignee(slug, cardId, userId, on) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me)
      if (!ctx) return fail("No perteneces a este tablero.")
      const card = await first<Row["cards"]>(table("cards").select("*").eq("id", cardId).eq("board_id", ctx.board.id))
      if (!card) return fail("Esa tarea ya no existe.")
      if (on) {
        const member = await first<Row["members"]>(table("members").select("*").eq("board_id", ctx.board.id).eq("user_id", userId))
        if (!member) return fail("Esa persona no está en el tablero.")
        const has = await first<{ card_id: string }>(table("card_assignees").select("*").eq("card_id", cardId).eq("user_id", userId))
        if (!has) {
          await write(table("card_assignees").insert({ card_id: cardId, user_id: userId }))
          const user = await first<Row["users"]>(table("users").select("*").eq("id", userId))
          await log(me, ctx.board.id, "card.assigned", { title: card.title, to: user?.name ?? "" }, cardId)
        }
      } else {
        await write(table("card_assignees").delete().eq("card_id", cardId).eq("user_id", userId))
      }
      return ok()
    })
  },

  async setCardLabel(slug, cardId, labelId, on) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me)
      if (!ctx) return fail("No perteneces a este tablero.")
      const card = await first<Row["cards"]>(table("cards").select("*").eq("id", cardId).eq("board_id", ctx.board.id))
      if (!card) return fail("Esa tarea ya no existe.")
      if (on) {
        const label = await first<{ id: string }>(table("labels").select("id").eq("id", labelId).eq("board_id", ctx.board.id))
        if (!label) return fail("Esa etiqueta ya no existe.")
        const has = await first<{ card_id: string }>(table("card_labels").select("*").eq("card_id", cardId).eq("label_id", labelId))
        if (!has) await table("card_labels").insert({ card_id: cardId, label_id: labelId })
      } else {
        await write(table("card_labels").delete().eq("card_id", cardId).eq("label_id", labelId))
      }
      return ok()
    })
  },

  async addItem(slug, cardId, text, dueAt, assigneeId) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me)
      if (!ctx) return fail("No perteneces a este tablero.")
      const card = await first<Row["cards"]>(table("cards").select("*").eq("id", cardId).eq("board_id", ctx.board.id))
      if (!card) return fail("Esa tarea ya no existe.")
      const clean = text.trim().slice(0, 200)
      if (!clean) return fail("Escribe el paso.")
      const last = Math.max(
        0,
        ...(await all<{ position: number }>(table("items").select("position").eq("card_id", cardId))).map(
          (i) => i.position,
        ),
      )
      await write(table("items").insert({
        id: uid(),
        card_id: cardId,
        title: clean,
        done: false,
        position: last + 1024,
        due_at: dueAt || null,
        assignee_id: assigneeId || null,
      }))
      return ok()
    })
  },

  async updateItem(slug, cardId, itemId, patch) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me)
      if (!ctx) return fail("No perteneces a este tablero.")
      const item = await first<Row["items"]>(table("items").select("*").eq("id", itemId).eq("card_id", cardId))
      if (!item) return fail("Ese paso ya no existe.")
      const data: Record<string, unknown> = {}
      if (patch.text !== undefined) data.title = patch.text.trim().slice(0, 200)
      if (patch.done !== undefined) data.done = patch.done
      if (patch.dueAt !== undefined) data.due_at = patch.dueAt || null
      if (patch.assigneeId !== undefined) data.assignee_id = patch.assigneeId || null
      if (Object.keys(data).length) await table("items").update(data).eq("id", itemId)
      return ok()
    })
  },

  async deleteItem(slug, cardId, itemId) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me)
      if (!ctx) return fail("No perteneces a este tablero.")
      await write(table("items").delete().eq("id", itemId).eq("card_id", cardId))
      return ok()
    })
  },

  async addComment(slug, cardId, body) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me)
      if (!ctx) return fail("No perteneces a este tablero.")
      const card = await first<Row["cards"]>(table("cards").select("*").eq("id", cardId).eq("board_id", ctx.board.id))
      if (!card) return fail("Esa tarea ya no existe.")
      const clean = body.trim().slice(0, 2000)
      if (!clean) return fail("Escribe algo primero.")
      await write(table("comments").insert({ id: uid(), card_id: cardId, author_id: me, body: clean, created_at: now() }))
      await log(me, ctx.board.id, "card.commented", { title: card.title }, cardId)
      return ok()
    })
  },

  async deleteComment(slug, cardId, commentId) {
    return run(async (me) => {
      const ctx = await boardCtx(slug, me)
      if (!ctx) return fail("No perteneces a este tablero.")
      const comment = await first<Row["comments"]>(
        table("comments").select("*").eq("id", commentId).eq("card_id", cardId),
      )
      if (!comment) return ok()
      if (comment.author_id !== me) return fail("Solo puedes borrar tus comentarios.")
      await write(table("comments").delete().eq("id", commentId))
      return ok()
    })
  },
}

async function rebalance(what: "cards" | "columns", boardId: string, columnId?: string) {
  const name: Table = what
  const q =
    what === "columns"
      ? table(name).select("id, position").eq("board_id", boardId)
      : table(name).select("id, position").eq("board_id", boardId).eq("column_id", columnId as string)
  const rows = await all<{ id: string; position: number }>(q as never)
  if (rows.length < 2) return
  const ordered = rows.sort((a, b) => a.position - b.position)
  const clash = ordered.some((r, i) => i > 0 && r.position - ordered[i - 1].position < 0.001)
  if (!clash) return
  for (const [i, r] of ordered.entries()) {
    await table(name).update({ position: (i + 1) * 1024 }).eq("id", r.id)
  }
}
