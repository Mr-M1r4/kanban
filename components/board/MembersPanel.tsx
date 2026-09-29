"use client"

import { useState } from "react"
import type { BoardState } from "@/lib/types"
import {
  addMemberAction,
  removeMemberAction,
  resendInviteAction,
  setMemberRoleAction,
} from "@/app/actions/board"
import { Avatar, Modal, ModalHeader, callAction, toast } from "@/components/ui"
import { IconCheck, IconCopy, IconLink, IconPlus, IconTrash, IconUsers } from "@/components/icons"
import { cn } from "@/lib/utils"

const copy = async (text: string, msg = "Enlace copiado") => {
  try {
    await navigator.clipboard.writeText(text)
    toast(msg, "ok")
  } catch {
    toast("No se pudo copiar. Cópialo manualmente.", "error")
  }
}

export function MembersPanel({
  board,
  onChanged,
  onClose,
}: {
  board: BoardState
  onChanged: () => void
  onClose: () => void
}) {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [invite, setInvite] = useState<{ url: string; who: string } | null>(null)
  const isAdmin = board.me.role === "admin"

  const add = async () => {
    const mail = email.trim()
    if (!mail) return
    setBusy(true)
    const res = await callAction(addMemberAction(board.slug, mail, name.trim() || undefined))
    setBusy(false)
    if (res) {
      setInvite({ url: res.data.inviteUrl, who: res.data.name })
      setEmail("")
      setName("")
      toast(`${res.data.name} agregado. Comparte el enlace.`, "ok")
      onChanged()
    }
  }

  return (
    <Modal open onClose={onClose} side labelledBy="panel-personas">
      <ModalHeader
        id="panel-personas"
        title={
          <span className="flex items-center gap-2">
            <IconUsers width={17} height={17} /> Personas
          </span>
        }
        onClose={onClose}
      />

      <div className="max-h-[calc(86vh-57px)] overflow-y-auto px-5 py-4">
        {isAdmin ? (
          <div className="card-surface p-3">
            <p className="text-sm font-medium">Agregar por correo</p>
            <p className="mt-0.5 text-xs text-board-muted">
              Se crea la persona y te damos un enlace para que entre. No necesita contraseña.
            </p>
            <div className="mt-2.5 space-y-2">
              <input
                className="input"
                type="email"
                placeholder="correo@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
              <input
                className="input"
                placeholder="Nombre (opcional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
              <button className="btn-primary w-full" onClick={add} disabled={busy || !email.trim()}>
                <IconPlus width={16} height={16} /> Agregar al tablero
              </button>
            </div>

            {invite && (
              <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5">
                <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-200">
                  <IconCheck width={13} height={13} /> {invite.who} está listo para entrar
                </p>
                <p className="mt-1.5 break-all rounded-md bg-black/30 px-2 py-1.5 font-mono text-[11px] text-emerald-100/90">
                  {invite.url}
                </p>
                <button className="btn-outline mt-2 w-full py-1.5 text-xs" onClick={() => copy(invite.url)}>
                  <IconCopy width={14} height={14} /> Copiar enlace
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="card-surface p-3 text-sm text-board-muted">
            Solo un administrador puede agregar o quitar personas.
          </p>
        )}

        <ul className="mt-4 space-y-1.5">
          {board.members.map((m) => (
            <li key={m.id} className="flex items-center gap-2.5 rounded-xl border border-board-line px-3 py-2">
              <Avatar person={m} size={32} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {m.name}
                  {m.userId === board.me.userId && <span className="text-[10px] text-board-muted">(tú)</span>}
                </p>
                <p className="truncate text-xs text-board-muted">
                  {m.email}
                  {m.openCards > 0 && ` · ${m.openCards} tarea${m.openCards === 1 ? "" : "s"}`}
                </p>
              </div>

              {m.hasPendingInvite ? (
                <button
                  className="chip bg-amber-500/15 text-amber-300"
                  onClick={async () => {
                    const res = await callAction(resendInviteAction(board.slug, m.id))
                    if (res) {
                      setInvite({ url: res.data.inviteUrl, who: m.name })
                      toast("Enlace nuevo generado", "ok")
                    }
                  }}
                  title="Generar un enlace nuevo de invitación"
                >
                  <IconLink width={12} height={12} /> Pendiente
                </button>
              ) : isAdmin && m.userId !== board.me.userId ? (
                <select
                  className="input h-8 w-auto py-1 pr-6 text-xs"
                  value={m.role}
                  onChange={async (e) => {
                    const res = await callAction(
                      setMemberRoleAction(board.slug, m.id, e.target.value as "member" | "admin"),
                    )
                    if (res) {
                      toast("Permisos actualizados", "ok")
                      onChanged()
                    }
                  }}
                >
                  <option value="member">Miembro</option>
                  <option value="admin">Admin</option>
                </select>
              ) : (
                <span className="chip bg-white/5 text-board-muted">{m.role === "admin" ? "admin" : "miembro"}</span>
              )}

              {isAdmin && m.userId !== board.me.userId && (
                <button
                  className="btn-ghost px-1.5 text-board-muted hover:text-red-300"
                  aria-label={`Quitar a ${m.name}`}
                  onClick={async () => {
                    if (!window.confirm(`¿Quitar a ${m.name} del tablero? Perderá acceso a las tareas.`)) return
                    const res = await callAction(removeMemberAction(board.slug, m.id))
                    if (res) {
                      toast(`${m.name} quitó del tablero`, "ok")
                      onChanged()
                    }
                  }}
                >
                  <IconTrash width={15} height={15} />
                </button>
              )}
            </li>
          ))}
        </ul>

        {isAdmin && (
          <div className="mt-4 rounded-xl border border-board-line bg-white/[0.02] p-3">
            <p className="text-xs uppercase tracking-wide text-board-muted">Enlace del tablero</p>
            <p className="mt-1 truncate font-mono text-[11px] text-board-text/80">
              {typeof window !== "undefined" ? window.location.origin : ""}/t/{board.slug}
            </p>
            <p className="mt-1.5 text-[11px] text-board-muted">
              Quien ya es miembro entra con su correo. Para los demás, usa el enlace de invitación.
            </p>
            <button
              className="btn-outline mt-2 w-full py-1.5 text-xs"
              onClick={() => copy(`${window.location.origin}/t/${board.slug}`, "Enlace del tablero copiado")}
            >
              <IconCopy width={14} height={14} /> Copiar enlace
            </button>
          </div>
        )}

        <p className={cn("mt-4 text-[11px] leading-relaxed text-board-muted")}>
          Cualquier persona que esté en la lista puede crear, mover y completar tareas. Los administradores
          además agregan gente y editan columnas y etiquetas.
        </p>
      </div>
    </Modal>
  )
}
