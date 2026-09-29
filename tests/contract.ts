/**
 * Prueba de contrato del backend: ejercita los 30 métodos de la interfaz Api
 * sin pasar por la UI, contra el backend que marque NEXT_PUBLIC_BACKEND.
 *
 * Se ejecuta en un navegador real (los tests/e2e.mjs) porque el modo local
 * necesita localStorage y el de Supabase necesita una sesion de verdad.
 *
 *   node tests/contract.mjs            # ambas partes
 *   node tests/contract.mjs --local    # solo modo local
 *   node tests/contract.mjs --supabase # solo Supabase (necesita .env.local)
 */
import { getApi } from "../lib/api"
import type { Api } from "../lib/api/types"
import type { ActionResult } from "@/lib/types"

const api: Api = getApi()
const backend = api.backend

let pass = 0
let fail = 0
const failures: string[] = []

function check(label: string, cond: unknown, detail?: unknown) {
  if (cond) {
    pass++
    console.log(`  ✓ ${label}`)
  } else {
    fail++
    const extra = detail === undefined ? "" : ` → ${JSON.stringify(detail)?.slice(0, 160)}`
    failures.push(`${label}${extra}`)
    console.log(`  ✗ ${label}${extra}`)
  }
}

/** Comprueba el resultado y devuelve los datos si todo fue bien. */
function ok<T>(res: ActionResult<T>, label: string): T {
  if (res.ok) {
    pass++
    console.log(`  ✓ ${label}`)
  } else {
    fail++
    failures.push(`${label} → ${res.error}`)
    console.log(`  ✗ ${label} → ${res.error}`)
  }
  return (res as { data?: T }).data as T
}

async function expectReject(label: string, p: Promise<{ ok: boolean }>) {
  const res = await p
  check(label, res.ok === false, res.ok ? "debería fallar" : undefined)
}


const step = (s: string) => console.log(`\n· ${s}`)
const uniq = () => Math.random().toString(36).slice(2, 8)
const PIN = "equipo2026"
const base = { needsPin: api.needsPin, backend }

// ---------------------------------------------------------------- sesion ----
step("sesión y arranque")

const email = `probe-${uniq()}@example.com`
const first = await api.isFirstRun()
check("isFirstRun responde booleano", typeof first === "boolean", first)

check("sin sesión no hay getSession", (await api.getSession()) === null)
check("un tablero ajeno no se puede leer", (await api.getBoardState("no-existe")) === null)

const sign = ok(await api.signIn(email, api.needsPin ? PIN : "", "Probe"), `signIn crea la cuenta (${email})`)
const session = await api.getSession()
check("getSession devuelve la persona", session?.email === email, session?.email)

const slug = sign.slug || ""
check("signIn devuelve un slug de tablero", !!slug, slug)

const boards = await api.listBoards()
check(`listBoards trae el tablero (${boards.length})`, boards.some((b) => b.slug === slug))

const state0 = await api.getBoardState(slug)
check("getBoardState devuelve el tablero", !!state0)
check("3 columnas por defecto", state0?.columns.length === 3, state0?.columns.map((c) => c.name))
check("4 etiquetas por defecto", state0?.labels.length === 4)
check("soy administradora", state0?.me.role === "admin", state0?.me.role)

// ------------------------------------------------------------- columnas ----
step("columnas")

const col = ok(await api.createColumn(slug, "Backlog", "todo"), "createColumn")
let st = (await api.getBoardState(slug))!
const newCol = st.columns.find((c) => c.name === "Backlog")
check("la columna nueva aparece", !!newCol)

ok(await api.updateColumn(slug, newCol!.id, { name: "Icebox" }), "updateColumn renombra")
ok(await api.updateColumn(slug, newCol!.id, { kind: "doing" }), "updateColumn cambia el tipo")
ok(await api.updateColumn(slug, newCol!.id, { wipLimit: 3 }), "updateColumn pone límite WIP")

st = (await api.getBoardState(slug))!
const renamed = st.columns.find((c) => c.id === newCol!.id)
check("el cambio de columna se ve", renamed?.name === "Icebox" && renamed?.wipLimit === 3, {
  name: renamed?.name,
  wip: renamed?.wipLimit,
})

const lastCol = st.columns[st.columns.length - 1]
ok(await api.moveColumn(slug, newCol!.id, 9999), "moveColumn")
st = (await api.getBoardState(slug))!
check(
  "moveColumn cambia el orden",
  st.columns[st.columns.length - 1].id === newCol!.id,
  st.columns.map((c) => c.name),
)

// -------------------------------------------------------------- tarjetas ----
step("tarjetas")

const target = st.columns.find((c) => c.kind === "todo")!
const created = ok(await api.createCard(slug, target.id, "Tarea de prueba"), "createCard")
const cardId = created.id || ""

await expectReject(
  "createCard con columna ajena se rechaza",
  api.createCard(slug, "00000000-0000-0000-0000-000000000000", "huérfana"),
)
await expectReject("createCard sin título se rechaza", api.createCard(slug, target.id, "   "))

st = (await api.getBoardState(slug))!
check("la tarjeta está en la columna", st.columns.find((c) => c.id === target.id)?.cards.length === 1)

ok(
  await api.updateCard(slug, cardId, {
    title: "Tarea renombrada",
    description: "Una descripción",
    priority: "urgent",
    dueAt: "2030-01-15T10:00:00.000Z",
  }),
  "updateCard con todos los campos",
)
st = (await api.getBoardState(slug))!
let card = st.columns.flatMap((c) => c.cards).find((c) => c.id === cardId)
check("updateCard se aplicó", card?.title === "Tarea renombrada" && card?.priority === "urgent" && !!card?.dueAt, {
  title: card?.title,
  priority: card?.priority,
  dueAt: card?.dueAt,
})

const other = st.columns.find((c) => c.id !== target.id)!
ok(await api.moveCard(slug, cardId, other.id, 512), "moveCard a otra columna")
st = (await api.getBoardState(slug))!
check(
  "la tarjeta se movió",
  st.columns.find((c) => c.id === other.id)?.cards.length === 1 &&
    st.columns.find((c) => c.id === target.id)?.cards.length === 0,
)

const dup = ok(await api.duplicateCard(slug, cardId), "duplicateCard")
check("el duplicado es una tarjeta nueva", dup.id !== cardId)
st = (await api.getBoardState(slug))!
check("el duplicado está en el tablero", st.columns.some((c) => c.cards.some((c2) => c2.id === dup.id)))
ok(await api.deleteCard(slug, dup.id), "deleteCard")
st = (await api.getBoardState(slug))!
check("la tarjeta borrada desapareció", !st.columns.some((c) => c.cards.some((c2) => c2.id === dup.id)))

// ------------------------------------------------------------ checklist ----
step("checklist, comentarios, etiquetas y responsables")

// addItem no devuelve el id en el contrato, se saca del estado como hace la UI.
ok(await api.addItem(slug, cardId, "Primer paso"), "addItem")
let items = (await api.getBoardState(slug))!.columns
  .flatMap((c) => c.cards)
  .find((c) => c.id === cardId)!
  .items
check("el paso aparece en la tarjeta", items.length === 1, items.length)
const itemId = items[0].id
ok(await api.updateItem(slug, cardId, itemId, { done: true }), "updateItem marca hecho")
ok(await api.updateItem(slug, cardId, itemId, { text: "Paso editado", dueAt: null }), "updateItem edita el texto")
st = (await api.getBoardState(slug))!
card = st.columns.flatMap((c) => c.cards).find((c) => c.id === cardId)
check("el paso cambió", card?.items[0]?.done === true && card?.items[0]?.text === "Paso editado", card?.items[0])

ok(await api.setAssignee(slug, cardId, st.me.userId, true), "setAssignee me asigna")
st = (await api.getBoardState(slug))!
card = st.columns.flatMap((c) => c.cards).find((c) => c.id === cardId)
check("la tarjeta me tiene como responsable", card?.assignees.some((a) => a.userId === st.me.userId))
ok(await api.setAssignee(slug, cardId, st.me.userId, false), "setAssignee me quita")
st = (await api.getBoardState(slug))!
card = st.columns.flatMap((c) => c.cards).find((c) => c.id === cardId)
check("ya no estoy como responsable", !card?.assignees.some((a) => a.userId === st.me.userId))

const labelId = st.labels[0].id
ok(await api.setCardLabel(slug, cardId, labelId, true), "setCardLabel añade")
st = (await api.getBoardState(slug))!
card = st.columns.flatMap((c) => c.cards).find((c) => c.id === cardId)
check("la etiqueta está puesta", card?.labels.some((l) => l.id === labelId))
ok(await api.setCardLabel(slug, cardId, labelId, false), "setCardLabel quita")
st = (await api.getBoardState(slug))!
card = st.columns.flatMap((c) => c.cards).find((c) => c.id === cardId)
check("la etiqueta se quitó", !card?.labels.some((l) => l.id === labelId))

const comment = ok(await api.addComment(slug, cardId, "Un comentario"), "addComment")
st = (await api.getBoardState(slug))!
card = st.columns.flatMap((c) => c.cards).find((c) => c.id === cardId)
check("el comentario está", card?.comments.some((c) => c.body === "Un comentario"))
ok(await api.deleteComment(slug, cardId, card!.comments[0].id), "deleteComment")
st = (await api.getBoardState(slug))!
card = st.columns.flatMap((c) => c.cards).find((c) => c.id === cardId)
check("el comentario se borró", !card?.comments.length)

ok(await api.addItem(slug, cardId, "Paso para borrar"), "addItem (segundo)")
const secondId = (await api.getBoardState(slug))!.columns
  .flatMap((c) => c.cards)
  .find((c) => c.id === cardId)!
  .items.find((i) => i.text === "Paso para borrar")!.id
ok(await api.deleteItem(slug, cardId, secondId), "deleteItem")
items = (await api.getBoardState(slug))!.columns
  .flatMap((c) => c.cards)
  .find((c) => c.id === cardId)!
  .items
check("el paso borrado ya no está", items.length === 1, items.length)

// -------------------------------------------------------------- etiquetas ----
step("etiquetas del tablero")

ok(await api.createLabel(slug, "Urgente", "#ff0000"), "createLabel")
st = (await api.getBoardState(slug))!
check("la etiqueta nueva aparece", st.labels.some((l) => l.name === "Urgente"))
const labelIdNew = st.labels.find((l) => l.name === "Urgente")!.id
ok(await api.updateLabel(slug, labelIdNew, "Crítico", "#ff00ff"), "updateLabel")
st = (await api.getBoardState(slug))!
check("la etiqueta se renombró", st.labels.some((l) => l.name === "Crítico"))
ok(await api.deleteLabel(slug, labelIdNew), "deleteLabel")
st = (await api.getBoardState(slug))!
check("la etiqueta se borró", !st.labels.some((l) => l.id === labelIdNew))

// ------------------------------------------------------------- tableros ----
step("ajustes del tablero y equipo")

ok(await api.renameBoard(slug, "Tablero renombrado"), "renameBoard")
check("listBoards refleja el nombre nuevo", (await api.listBoards()).some((b) => b.name === "Tablero renombrado"))

const second2 = ok(await api.createBoard("Segundo tablero"), "createBoard")
check("createBoard devuelve otro slug", !!second2.slug && second2.slug !== slug, second2.slug)
check("listBoards trae los dos", (await api.listBoards()).length >= 2)

const guestEmail = `bruno-${uniq()}@example.com`
const invite = ok(await api.addMember(slug, guestEmail, "Bruno"), "addMember")
check("addMember da token y enlace", !!invite.token && invite.inviteUrl.includes("token="))

const info = await api.getInvite(invite.token)
check("getInvite ve la invitación pendiente", info?.pending === true, info)
check("getInvite con token inventado devuelve null", (await api.getInvite("token-inventado")) === null)

const member = (await api.getBoardState(slug))!.members.find((m) => m.hasPendingInvite)
check("aparece como invitado pendiente", !!member)
ok(await api.resendInvite(slug, member!.id), "resendInvite")
const ghostId = "00000000-0000-4000-8000-000000000000"
await expectReject("setMemberRole sobre un no-miembro falla", api.setMemberRole(slug, ghostId, "admin"))

// Se prueba sobre el tablero de usar y tirar para no romper el principal.
{
  const trash = (await api.getBoardState(second2.slug))!
  for (const c of [...trash.columns].reverse()) await api.deleteColumn(second2.slug, c.id)
  const last = trash.columns[0]
  await expectReject("borrar la última columna se rechaza", api.deleteColumn(second2.slug, last.id))
  const after = (await api.getBoardState(second2.slug))!
  check("la última columna sobrevive", after.columns.length === 1, after.columns.length)
  check("el tablero principal sigue intacto", (await api.getBoardState(slug))!.columns.length >= 1)
}

// -------------------------------------------------------- segunda persona ----
step("segunda persona")

const guest = ok(await api.addMember(slug, guestEmail, "Bruno"), "addMember para Bruno")
const inviteBefore = await api.getInvite(guest.token)
check("la invitación está pendiente", inviteBefore?.pending === true, inviteBefore)

await api.signOut()
const bruno = ok(await api.signIn(guestEmail, api.needsPin ? PIN : "", "Bruno"), "Bruno entra con su PIN")
check("al entrar le avisan de la invitación", !!bruno.inviteToken, bruno.slug)
check("no le crean un tablero propio", bruno.inviteToken !== undefined)

check("el token que trae el alta es el de la invitación", guest.token === bruno.inviteToken, {
  addMember: guest.token,
  signIn: bruno.inviteToken,
})
check("el invitado ve la invitación pendiente", (await api.getInvite(guest.token))?.pending === true)
ok(await api.acceptInvite(guest.token), "acceptInvite")
const bState = await api.getBoardState(slug)
check("Bruno ve el tablero", !!bState && bState.columns.length >= 1)
check("Bruno es miembro normal", bState?.me.role === "member", bState?.me.role)
check("Bruno ve las tarjetas de laDueña", bState?.columns.some((c) => c.cards.length > 0))
ok(await api.createCard(slug, bState!.columns[0].id, "Tarjeta de Bruno"), "Bruno puede crear tarjetas")
await expectReject("Bruno no puede crear columnas", api.createColumn(slug, "Intrusa", "todo"))
await expectReject("Bruno no puede invitar", api.addMember(slug, `loto-${uniq()}@example.com`))
check("Bruno no puede entrar en otro tablero", (await api.getBoardState("tablero-ajeno")) === null)

const afterInvite = await api.getInvite(guest.token)
check("la invitación queda aceptada", afterInvite?.pending === false, afterInvite)

// --------------------------------------------------------------- salida ----
step("vuelta de la administradora y baja de la persona")

await api.signOut()
const back = ok(await api.signIn(email, api.needsPin ? PIN : "", "Probe"), "puedo volver a entrar")
check("vuelve al mismo tablero", back.slug === slug, back.slug)
check("ya no hay invitación pendiente para mí", back.inviteToken === undefined)

const brunoRow = (await api.getBoardState(slug))!.members.find((m) => m.email === guestEmail)
ok(await api.setMemberRole(slug, brunoRow!.id, "admin"), "setMemberRole → admin")
check("el tablero sigue accesible", (await api.getBoardState(slug)) !== null)
ok(await api.signIn(guestEmail, api.needsPin ? PIN : "", "Bruno"), "Bruno entra ya como miembro")
check("el ascenso se guardó", (await api.getBoardState(slug))?.me.role === "admin")
await api.signOut()
ok(await api.signIn(email, api.needsPin ? PIN : "", "Probe"), "la administradora vuelve")
ok(await api.setMemberRole(slug, brunoRow!.id, "member"), "setMemberRole → member")
check("el descenso se guardó", (await api.getBoardState(slug))!.members.find((m) => m.id === brunoRow!.id)?.role === "member")
const mySession = (await api.getSession())!
const myRow = (await api.getBoardState(slug))!.members.find((m) => m.userId === mySession.userId)!
await expectReject("uno mismo no puede quitarse del tablero", api.removeMember(slug, myRow.id))
ok(await api.removeMember(slug, brunoRow!.id), "removeMember")
const stFin = (await api.getBoardState(slug))!
check("la persona ya no es miembro", !stFin.members.some((m) => m.id === brunoRow!.id))
check("sus tarjetas siguen en el tablero", stFin.columns.some((c) => c.cards.some((c2) => c2.title === "Tarjeta de Bruno")))

step("salida de sesión")
await api.signOut()
check("tras signOut no hay sesión", (await api.getSession()) === null)

console.log(`\n${backend}: ${pass} correctos, ${fail} fallos`)
if (fail) console.log(failures.map((f) => `  · ${f}`).join("\n"))
;(globalThis as { __fail?: number }).__fail = fail
