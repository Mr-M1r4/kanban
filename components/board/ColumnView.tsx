"use client"

import { useEffect, useRef, useState } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import type { ColumnDTO } from "@/lib/types"
import { cn, COLUMN_KINDS, kindOf } from "@/lib/utils"
import { CardView } from "@/components/board/CardView"
import { IconDots, IconPlus, IconTrash, IconX } from "@/components/icons"

type Props = {
  column: ColumnDTO
  meId: string
  isAdmin: boolean
  onOpenCard: (id: string) => void
  onCreateCard: (columnId: string, title: string) => Promise<void>
  onRenameColumn: (id: string, name: string) => Promise<void>
  onChangeKind: (id: string, kind: string) => Promise<void>
  onSetWip: (id: string, wip: number | null) => Promise<void>
  onDeleteColumn: (id: string) => Promise<void>
}

export function ColumnView({
  column,
  meId,
  isAdmin,
  onOpenCard,
  onCreateCard,
  onRenameColumn,
  onChangeKind,
  onSetWip,
  onDeleteColumn,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `col:${column.id}`,
    data: { type: "column" },
  })
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState("")
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(column.name)
  const [wip, setWip] = useState(column.wipLimit ? String(column.wipLimit) : "")
  const menuRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const kind = kindOf(column.kind)
  const dot = COLUMN_KINDS[kind].dot
  const overWip = column.wipLimit != null && column.cards.length > column.wipLimit

  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [menu])

  useEffect(() => {
    if (composing) textareaRef.current?.focus()
  }, [composing])

  useEffect(() => {
    setName(column.name)
    setWip(column.wipLimit ? String(column.wipLimit) : "")
  }, [column.name, column.wipLimit])

  const submit = async () => {
    const clean = draft.replace(/\s+/g, " ").trim()
    if (!clean) {
      setComposing(false)
      setDraft("")
      return
    }
    setDraft("")
    await onCreateCard(column.id, clean)
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex h-full w-[300px] shrink-0 flex-col rounded-2xl border border-board-line bg-board-panel/70",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
        {renaming ? (
          <input
            autoFocus
            className="input h-7 py-1 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              setRenaming(false)
              if (name.trim() && name.trim() !== column.name) onRenameColumn(column.id, name.trim())
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur()
              if (e.key === "Escape") {
                setName(column.name)
                setRenaming(false)
              }
            }}
          />
        ) : (
          <button
            className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
            onDoubleClick={() => isAdmin && setRenaming(true)}
            onClick={() => isAdmin && setRenaming(true)}
            title={isAdmin ? "Clic para renombrar" : undefined}
          >
            {column.name}
          </button>
        )}
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
            overWip ? "bg-red-500/15 text-red-300" : "bg-white/5 text-board-muted",
          )}
          title={column.wipLimit ? `Límite: ${column.wipLimit}` : undefined}
        >
          {column.cards.length}
          {column.wipLimit ? `/${column.wipLimit}` : ""}
        </span>

        {isAdmin && (
          <div className="relative" ref={menuRef}>
            <button
              className="btn-ghost -mr-1 px-1.5 py-1"
              onClick={() => setMenu((v) => !v)}
              aria-label="Opciones de la columna"
            >
              <IconDots width={16} height={16} />
            </button>
            {menu && (
              <div className="absolute right-0 top-9 z-30 w-60 rounded-xl border border-board-line bg-board-panel p-3 shadow-pop animate-slide-up">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-board-muted">
                  Se cuenta como
                </p>
                <div className="mb-3 flex gap-1">
                  {Object.entries(COLUMN_KINDS).map(([key, meta]) => (
                    <button
                      key={key}
                      onClick={() => {
                        onChangeKind(column.id, key)
                        setMenu(false)
                      }}
                      className={cn(
                        "flex-1 rounded-lg border px-1.5 py-1.5 text-[11px] font-medium transition",
                        kind === key
                          ? "border-board-accent bg-board-accent/15 text-white"
                          : "border-board-line text-board-muted hover:bg-white/5",
                      )}
                    >
                      <span className="mx-auto mb-1 block h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
                      {meta.label}
                    </button>
                  ))}
                </div>

                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-board-muted">
                  Límite de tareas
                </p>
                <div className="mb-3 flex gap-1.5">
                  <input
                    className="input h-8 py-1 text-sm"
                    inputMode="numeric"
                    placeholder="Sin límite"
                    value={wip}
                    onChange={(e) => setWip(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  />
                  <button
                    className="btn-outline h-8 px-2.5 text-xs"
                    onClick={() => {
                      onSetWip(column.id, wip ? Number(wip) : null)
                      setMenu(false)
                    }}
                  >
                    Guardar
                  </button>
                </div>

                <button
                  className="btn-danger w-full justify-start"
                  onClick={async () => {
                    setMenu(false)
                    if (window.confirm(`¿Borrar la columna "${column.name}"? Las tareas se mueven a la primera columna.`)) {
                      await onDeleteColumn(column.id)
                    }
                  }}
                >
                  <IconTrash width={15} height={15} /> Borrar columna
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <SortableContext items={column.cards.map((c) => `card:${c.id}`)} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-1">
          {column.cards.map((card) => (
            <CardView key={card.id} card={card} meId={meId} onOpen={onOpenCard} />
          ))}
          {column.cards.length === 0 && !composing && (
            <div
              className={cn(
                "rounded-xl border border-dashed border-board-line px-3 py-6 text-center text-xs text-board-muted",
              )}
            >
              Arrastra tareas aquí
            </div>
          )}
        </div>
      </SortableContext>

      <div className="p-2 pt-1">
        {composing ? (
          <div className="rounded-xl border border-board-line bg-board-panel2 p-2 shadow-card">
            <textarea
              ref={textareaRef}
              rows={2}
              className="w-full resize-none bg-transparent text-sm text-board-text placeholder:text-board-muted/70 focus:outline-none"
              placeholder="¿Qué hay que hacer? Enter para crear, Esc para cancelar."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
                if (e.key === "Escape") {
                  setDraft("")
                  setComposing(false)
                }
              }}
            />
            <div className="mt-1 flex items-center gap-2">
              <button className="btn-primary px-2.5 py-1 text-xs" onClick={submit}>
                Añadir
              </button>
              <button
                className="btn-ghost px-2 py-1 text-xs"
                onClick={() => {
                  setDraft("")
                  setComposing(false)
                }}
              >
                <IconX width={14} height={14} />
              </button>
              <span className="ml-auto text-[10px] text-board-muted">Shift+Enter = nueva línea</span>
            </div>
          </div>
        ) : (
          <button
            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm text-board-muted transition hover:bg-white/5 hover:text-board-text"
            onClick={() => setComposing(true)}
          >
            <IconPlus width={16} height={16} /> Añadir tarea
          </button>
        )}
      </div>
    </div>
  )
}
