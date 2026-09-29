"use client"

import { useEffect, useState } from "react"
import type { BoardState } from "@/lib/types"
import { Modal, ModalHeader, callAction, toast } from "@/components/ui"
import { IconSettings, IconTrash, IconX } from "@/components/icons"
import { cn } from "@/lib/utils"
import { getApi } from "@/lib/api"

const PALETTE = ["#5b8cff", "#22c55e", "#f97316", "#ef4444", "#9b6bff", "#ec4899", "#14b8a6", "#64748b"]

export function SettingsPanel({
  board,
  onChanged,
  onClose,
}: {
  board: BoardState
  onChanged: () => void
  onClose: () => void
}) {
  const api = getApi()
  const [name, setName] = useState(board.name)
  const [label, setLabel] = useState("")
  const [color, setColor] = useState(PALETTE[0])

  return (
    <Modal open onClose={onClose} side labelledBy="panel-ajustes">
      <ModalHeader
        id="panel-ajustes"
        title={
          <span className="flex items-center gap-2">
            <IconSettings width={17} height={17} /> Ajustes del tablero
          </span>
        }
        onClose={onClose}
      />

      <div className="max-h-[calc(86vh-57px)] space-y-5 overflow-y-auto px-5 py-4">
        <section>
          <p className="text-xs uppercase tracking-wide text-board-muted">Nombre del tablero</p>
          <div className="mt-1.5 flex gap-2">
            <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            <button
              className="btn-primary shrink-0"
              onClick={async () => {
                const res = await callAction(api.renameBoard(board.slug, name), "Nombre actualizado")
                if (res) onChanged()
              }}
            >
              Guardar
            </button>
          </div>
        </section>

        <section>
          <p className="text-xs uppercase tracking-wide text-board-muted">Etiquetas</p>
          <ul className="mt-2 space-y-1.5">
            {board.labels.map((l) => (
              <li key={l.id} className="flex items-center gap-2 rounded-lg border border-board-line px-2.5 py-1.5">
                <span className="h-3 w-3 rounded-full" style={{ background: l.color }} />
                <span className="flex-1 text-sm">{l.name}</span>
                <button
                  className="btn-ghost px-1.5 py-1 text-board-muted hover:text-red-300"
                  aria-label={`Borrar ${l.name}`}
                  onClick={async () => {
                    if (!window.confirm(`¿Borrar la etiqueta "${l.name}"? Se quitará de todas las tareas.`)) return
                    const res = await callAction(api.deleteLabel(board.slug, l.id), "Etiqueta borrada")
                    if (res) onChanged()
                  }}
                >
                  <IconTrash width={15} height={15} />
                </button>
              </li>
            ))}
            {board.labels.length === 0 && <li className="text-xs text-board-muted">Todavía no hay etiquetas.</li>}
          </ul>

          <div className="mt-3 rounded-xl border border-board-line p-3">
            <p className="text-xs font-medium text-board-muted">Nueva etiqueta</p>
            <input
              className="input mt-1.5"
              placeholder="Ej: Marketing"
              value={label}
              maxLength={24}
              onChange={(e) => setLabel(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-6 w-6 rounded-full border-2 transition",
                    color === c ? "border-white" : "border-transparent",
                  )}
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
              <button
                className="btn-primary ml-auto px-3 py-1.5 text-xs"
                onClick={async () => {
                  if (!label.trim()) return
                  const res = await callAction(api.createLabel(board.slug, label, color), "Etiqueta creada")
                  if (res) {
                    setLabel("")
                    onChanged()
                  }
                }}
              >
                Crear
              </button>
            </div>
          </div>
        </section>

        <section>
          <p className="text-xs uppercase tracking-wide text-board-muted">Cómo se organiza</p>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-board-muted">
            <li className="flex gap-2">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#94a3b8]" />
              <span>
                <b className="text-board-text">Programadas</b>: lo que está en la lista de espera. Nadie lo empezó.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#5b8cff]" />
              <span>
                <b className="text-board-text">En ejecución</b>: lo que alguien está haciendo ahora.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#22c55e]" />
              <span>
                <b className="text-board-text">Terminadas</b>: cuenta para el avance del tablero.
              </span>
            </li>
            <li className="pt-1">
              Puedes cambiar el nombre de cada columna, moverla de lugar y decidir a cuál de las tres cuenta
              desde el menú <span className="text-board-text">⋯</span> de la columna.
            </li>
          </ul>
        </section>

        <button className="btn-ghost w-full" onClick={onClose}>
          <IconX width={15} height={15} /> Cerrar
        </button>
      </div>
      {board.me.role !== "admin" && (
        <p className="px-5 pb-4 text-[11px] text-board-muted">
          Solo un administrador puede modificar el tablero.
        </p>
      )}
    </Modal>
  )
}
