"use client"

import { useState } from "react"
import type { BoardState } from "@/lib/types"
import { Modal, ModalHeader, Avatar } from "@/components/ui"
import { IconActivity } from "@/components/icons"
import { timeAgo } from "@/lib/utils"

const TEXT: Record<string, string> = {
  "card.created": "creó la tarea",
  "card.renamed": "renombró la tarea",
  "card.moved": "movió la tarea a",
  "card.done": "completó la tarea",
  "card.deleted": "borró la tarea",
  "card.assigned": "asignó la tarea a",
  "card.commented": "comentó en la tarea",
  "member.invited": "invitó a",
  "member.joined": "entró al tablero",
  "member.removed": "quitó a",
  "column.created": "creó la columna",
  "column.deleted": "borró la columna",
  "board.renamed": "renombró el tablero a",
}

function describe(type: string, meta: string) {
  let data: Record<string, string> = {}
  try {
    data = JSON.parse(meta)
  } catch {
    data = {}
  }
  const verb = TEXT[type] ?? "hizo un cambio en"
  const parts = [verb]
  if (data.to) parts.push(String(data.to))
  if (data.name && !data.to) parts.push(`"${data.name}"`)
  if (data.title && !data.name) parts.push(`"${String(data.title).slice(0, 40)}"`)
  return parts.join(" ")
}

export function ActivityPanel({ board, onClose }: { board: BoardState; onClose: () => void }) {
  const [tab, setTab] = useState<"actividad" |("gente")>("actividad")
  return (
    <Modal open onClose={onClose} side labelledBy="panel-info">
      <ModalHeader
        id="panel-info"
        title={
          <span className="flex items-center gap-2">
            <IconActivity width={17} height={17} /> {tab === "actividad" ? "Actividad" : "Equipo"}
          </span>
        }
        onClose={onClose}
      >
        <div className="flex rounded-lg border border-board-line p-0.5 text-xs">
          {(["actividad", "gente"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                tab === t
                  ? "rounded-md bg-white/10 px-2.5 py-1 font-medium text-board-text"
                  : "rounded-md px-2.5 py-1 text-board-muted hover:text-board-text"
              }
            >
              {t === "actividad" ? "Actividad" : "Equipo"}
            </button>
          ))}
        </div>
      </ModalHeader>

      <div className="max-h-[calc(86vh-57px)] overflow-y-auto px-5 py-4">
        {tab === "actividad" ? (
          board.activity.length === 0 ? (
            <p className="text-sm text-board-muted">Todavía no hay movimientos.</p>
          ) : (
            <ul className="space-y-3">
              {board.activity.map((a) => (
            <li key={a.id} data-activity-item className="flex gap-2.5">
                  {a.actor ? (
                    <Avatar person={a.actor} size={26} />
                  ) : (
                    <span className="inline-block h-[26px] w-[26px] rounded-full border border-board-line" />
                  )}
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="leading-snug">
                      <b className="font-semibold">{a.actor?.name ?? "Alguien"}</b>{" "}
                      <span className="text-board-muted">{describe(a.type, a.meta)}</span>{" "}
                      {a.cardTitle && (
                        <span className="text-board-muted">
                          · <span className="text-board-text/80">{a.cardTitle}</span>
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-board-muted" suppressHydrationWarning>
                      {timeAgo(a.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : (
          <ul className="space-y-2">
            {board.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5">
                <Avatar person={m} size={30} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {m.name}
                    {m.userId === board.me.userId && <span className="text-[10px] text-board-muted"> (tú)</span>}
                  </p>
                  <p className="truncate text-xs text-board-muted">
                    {m.openCards} abierta{m.openCards === 1 ? "" : "s"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
