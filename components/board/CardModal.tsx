"use client"

import { useEffect, useState } from "react"
import type { BoardState, CardDTO, ItemDTO } from "@/lib/types"
import {
  addCommentAction,
  addItemAction,
  deleteCardAction,
  deleteCommentAction,
  deleteItemAction,
  duplicateCardAction,
  moveCardAction,
  setAssigneeAction,
  setCardLabelAction,
  updateCardAction,
  updateItemAction,
} from "@/app/actions/card"
import { Modal, ModalHeader, Avatar, callAction } from "@/components/ui"
import { cn, endOfToday, formatDue, kindOf, PRIORITIES, PRIORITY_KEYS, toInputDateTime } from "@/lib/utils"
import {
  IconCalendar,
  IconCheck,
  IconCheckList,
  IconComment,
  IconCopy,
  IconFlag,
  IconPlus,
  IconTrash,
  IconX,
} from "@/components/icons"

type Props = {
  card: CardDTO
  board: BoardState
  onClose: () => void
  onChanged: () => void
}

export function CardModal({ card, board, onClose, onChanged }: Props) {
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description)
  const [itemDraft, setItemDraft] = useState("")
  const [commentDraft, setCommentDraft] = useState("")
  const [busy, setBusy] = useState(false)

  const column = board.columns.find((c) => c.id === card.columnId)
  const isDone = column ? kindOf(column.kind) === "done" : false
  const doneItems = card.items.filter((i) => i.done).length
  const assignedIds = new Set(card.assignees.map((a) => a.userId))

  useEffect(() => {
    setTitle(card.title)
    setDescription(card.description)
  }, [card.id, card.title, card.description])

  const save = async (patch: Parameters<typeof updateCardAction>[2]) => {
    setBusy(true)
    await callAction(updateCardAction(board.slug, card.id, patch))
    setBusy(false)
    onChanged()
  }

  const addItem = async () => {
    const clean = itemDraft.trim()
    if (!clean) return
    setItemDraft("")
    setBusy(true)
    await callAction(addItemAction(board.slug, card.id, clean))
    setBusy(false)
    onChanged()
  }

  const post = async () => {
    const clean = commentDraft.trim()
    if (!clean) return
    setCommentDraft("")
    setBusy(true)
    await callAction(addCommentAction(board.slug, card.id, clean))
    setBusy(false)
    onChanged()
  }

  const toggleItem = async (item: ItemDTO) => {
    setBusy(true)
    await callAction(updateItemAction(board.slug, card.id, item.id, { done: !item.done }))
    setBusy(false)
    onChanged()
  }

  const setDue = (value: string | null) => save({ dueAt: value })

  const quickDate = (days: number, hour = 18) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    d.setHours(hour, 0, 0, 0)
    return d.toISOString()
  }

  return (
    <Modal open onClose={onClose} labelledBy="card-title">
      <ModalHeader
        id="card-title"
        title={
          <span className="flex items-center gap-2 text-sm text-board-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: isDone ? "#22c55e" : "#5b8cff" }} />
            {column?.name ?? "Tarea"}
          </span>
        }
        onClose={onClose}
      >
        <select
          className="input h-8 w-auto py-1 pr-7 text-xs"
          value={card.columnId}
          onChange={async (e) => {
            const target = e.target.value
            const count = board.columns.find((c) => c.id === target)?.cards.length ?? 0
            setBusy(true)
            await callAction(moveCardAction(board.slug, card.id, target, (count + 1) * 1024), "Tarea movida")
            setBusy(false)
            onChanged()
          }}
        >
          {board.columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </ModalHeader>

      <div className="max-h-[calc(92vh-57px)] overflow-y-auto px-5 py-4 sm:max-h-[calc(86vh-57px)]">
        <textarea
          className="w-full resize-none rounded-lg bg-transparent text-lg font-semibold leading-snug focus:outline-none"
          rows={2}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title.trim() && title.trim() !== card.title) save({ title })
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              e.currentTarget.blur()
            }
          }}
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-board-muted">Responsable</span>
          <div className="flex flex-wrap items-center gap-1">
            {board.members.map((m) => {
              const on = assignedIds.has(m.userId)
              return (
                <button
                  key={m.userId}
                  onClick={async () => {
                    setBusy(true)
                    await callAction(setAssigneeAction(board.slug, card.id, m.userId, on), on ? undefined : `Asignada a ${m.name}`)
                    setBusy(false)
                    onChanged()
                  }}
                  title={`${m.name}${on ? " · quitar" : " · asignar"}`}
                  className={cn(
                    "rounded-full transition",
                    on ? "ring-2 ring-board-accent" : "opacity-45 hover:opacity-90",
                  )}
                >
                  <Avatar person={m} size={26} />
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <span className="mb-1.5 block text-xs uppercase tracking-wide text-board-muted">Prioridad</span>
            <div className="flex gap-1">
              {PRIORITY_KEYS.map((key) => {
                const p = PRIORITIES[key]
                const on = card.priority === key
                return (
                  <button
                    key={key}
                    onClick={() => save({ priority: key })}
                    className={cn(
                      "flex-1 rounded-lg border px-1.5 py-1.5 text-[11px] font-medium transition",
                      on
                        ? "border-transparent text-[#0b1020]"
                        : "border-board-line text-board-muted hover:bg-white/5",
                    )}
                    style={on ? { background: p.color } : undefined}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs uppercase tracking-wide text-board-muted">Fecha límite</span>
            <div className="flex items-center gap-1.5">
              <input
                type="datetime-local"
                className="input py-1.5 text-sm"
                value={toInputDateTime(card.dueAt)}
                onChange={(e) => setDue(e.target.value ? new Date(e.target.value).toISOString() : null)}
              />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <button className="btn-outline px-2 py-1 text-[11px]" onClick={() => setDue(endOfToday().toISOString())}>
                Hoy
              </button>
              <button className="btn-outline px-2 py-1 text-[11px]" onClick={() => setDue(quickDate(1, 9))}>
                Mañana
              </button>
              <button className="btn-outline px-2 py-1 text-[11px]" onClick={() => setDue(quickDate(7))}>
                +7 días
              </button>
              {card.dueAt && (
                <button className="btn-ghost px-2 py-1 text-[11px]" onClick={() => setDue(null)}>
                  Quitar
                </button>
              )}
            </div>
            {card.dueAt && (
              <p
                suppressHydrationWarning
                className={cn(
                  "mt-1.5 flex items-center gap-1.5 text-[11px]",
                  formatDue(card.dueAt)?.tone === "late" ? "text-red-300" : "text-board-muted",
                )}
              >
                <IconCalendar width={12} height={12} /> {formatDue(card.dueAt)?.text}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4">
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-board-muted">Etiquetas</span>
          <div className="flex flex-wrap gap-1.5">
            {board.labels.map((l) => {
              const on = card.labels.some((cl) => cl.id === l.id)
              return (
                <button
                  key={l.id}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs font-medium transition",
                    on ? "border-transparent" : "border-board-line text-board-muted hover:bg-white/5",
                  )}
                  style={
                    on
                      ? { background: `${l.color}30`, color: l.color, borderColor: `${l.color}66` }
                      : undefined
                  }
                  onClick={async () => {
                    setBusy(true)
                    await callAction(setCardLabelAction(board.slug, card.id, l.id, !on))
                    setBusy(false)
                    onChanged()
                  }}
                >
                  {l.name}
                </button>
              )
            })}
            {board.labels.length === 0 && (
              <span className="text-xs text-board-muted">El administrador aún no crea etiquetas.</span>
            )}
          </div>
        </div>

        <div className="mt-5">
          <span className="mb-1.5 flex items-center gap-2 text-xs uppercase tracking-wide text-board-muted">
            <IconCheckList width={13} height={13} /> Pasos a seguir
            {card.items.length > 0 && (
              <span className="normal-case">
                {doneItems}/{card.items.length}
              </span>
            )}
          </span>

          {card.items.length > 0 && (
            <div className="mb-2 h-1 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${(doneItems / card.items.length) * 100}%` }}
              />
            </div>
          )}

          <ul className="space-y-1">
            {card.items.map((item) => (
              <li key={item.id} className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-white/[0.03]">
                <button
                  onClick={() => toggleItem(item)}
                  disabled={busy}
                  className={cn(
                    "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition",
                    item.done
                      ? "border-emerald-500 bg-emerald-500 text-[#0b1020]"
                      : "border-board-line hover:border-board-accent",
                  )}
                >
                  {item.done && <IconCheck width={12} height={12} strokeWidth={3} />}
                </button>
                <input
                  defaultValue={item.text}
                  onBlur={(e) => {
                    const clean = e.target.value.trim()
                    if (clean && clean !== item.text) {
                      void callAction(updateItemAction(board.slug, card.id, item.id, { text: clean }))
                      onChanged()
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur()
                  }}
                  className={cn(
                    "min-w-0 flex-1 bg-transparent text-sm focus:outline-none",
                    item.done && "text-board-muted line-through",
                  )}
                />
                <select
                  className="rounded-md bg-transparent text-[11px] text-board-muted opacity-0 focus:opacity-100 group-hover:opacity-100"
                  value={item.assignee?.userId ?? ""}
                  onChange={(e) => {
                    void callAction(updateItemAction(board.slug, card.id, item.id, { assigneeId: e.target.value || null }))
                    onChanged()
                  }}
                >
                  <option value="">—</option>
                  {board.members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={async () => {
                    await callAction(deleteItemAction(board.slug, card.id, item.id))
                    onChanged()
                  }}
                  className="text-board-muted opacity-0 transition hover:text-red-300 group-hover:opacity-100"
                  aria-label="Borrar paso"
                >
                  <IconX width={14} height={14} />
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-1.5 flex gap-1.5">
            <input
              className="input py-1.5 text-sm"
              placeholder="Añadir paso (Enter para guardar)"
              value={itemDraft}
              onChange={(e) => setItemDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addItem()
                }
              }}
            />
            <button className="btn-outline px-2.5" onClick={addItem} disabled={!itemDraft.trim()}>
              <IconPlus width={16} height={16} />
            </button>
          </div>
        </div>

        <div className="mt-5">
          <span className="mb-1.5 flex items-center gap-2 text-xs uppercase tracking-wide text-board-muted">
            <IconComment width={13} height={13} /> Conversación
          </span>

          <ul className="space-y-2.5">
            {card.comments.map((c) => (
              <li key={c.id} className="flex gap-2">
                <Avatar person={c.author} size={26} />
                <div className="min-w-0 flex-1 rounded-lg bg-white/[0.04] px-3 py-2">
                  <p className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold">{c.author.name}</span>
                    <span className="text-[10px] text-board-muted" suppressHydrationWarning>
                      {new Date(c.createdAt).toLocaleString("es", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {(c.author.userId === board.me.userId || board.me.role === "admin") && (
                      <button
                        onClick={async () => {
                          await callAction(deleteCommentAction(board.slug, card.id, c.id))
                          onChanged()
                        }}
                        className="ml-auto text-board-muted transition hover:text-red-300"
                        aria-label="Borrar comentario"
                      >
                        <IconTrash width={13} height={13} />
                      </button>
                    )}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-board-text/90">{c.body}</p>
                </div>
              </li>
            ))}
            {card.comments.length === 0 && (
              <li className="text-xs text-board-muted">Todavía no hay comentarios.</li>
            )}
          </ul>

          <div className="mt-3 flex gap-2">
            <Avatar person={board.me} size={30} />
            <div className="flex-1">
              <textarea
                className="input min-h-[64px] resize-y text-sm"
                placeholder="Escribe un comentario…"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    post()
                  }
                }}
              />
              <div className="mt-1.5 flex items-center gap-2">
                <button className="btn-primary px-3 py-1.5 text-xs" onClick={post} disabled={!commentDraft.trim()}>
                  Comentar
                </button>
                <span className="text-[10px] text-board-muted">Ctrl+Enter para enviar</span>
              </div>
            </div>
          </div>
        </div>

        <footer className="mt-6 flex flex-wrap items-center gap-2 border-t border-board-line pt-3 text-xs text-board-muted">
          <IconFlag width={13} height={13} />
          <span suppressHydrationWarning>
            Creada por {card.createdBy.name} ·{" "}
            {new Date(card.createdAt).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
          <span className="ml-auto flex gap-1.5">
            <button
              className="btn-outline px-2 py-1 text-xs"
              onClick={async () => {
                const ok = await callAction(duplicateCardAction(board.slug, card.id), "Tarea duplicada")
                if (ok) onChanged()
              }}
            >
              <IconCopy width={14} height={14} /> Duplicar
            </button>
            <button
              className="btn-danger px-2 py-1 text-xs"
              onClick={async () => {
                if (!window.confirm(`¿Borrar "${card.title}"?`)) return
                const ok = await callAction(deleteCardAction(board.slug, card.id), "Tarea borrada")
                if (ok) {
                  onChanged()
                  onClose()
                }
              }}
            >
              <IconTrash width={14} height={14} /> Borrar
            </button>
          </span>
        </footer>
      </div>
    </Modal>
  )
}
