"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable"
import type { BoardState, CardDTO, ColumnDTO } from "@/lib/types"
import { cn, kindOf, PRIORITIES } from "@/lib/utils"
import {
  createColumnAction,
  deleteColumnAction,
  getBoardStateAction,
  moveColumnAction,
  renameBoardAction,
  updateColumnAction,
} from "@/app/actions/board"
import { createCardAction, moveCardAction } from "@/app/actions/card"
import { ColumnView } from "@/components/board/ColumnView"
import { CardModal } from "@/components/board/CardModal"
import { MembersPanel } from "@/components/board/MembersPanel"
import { ActivityPanel } from "@/components/board/ActivityPanel"
import { SettingsPanel } from "@/components/board/SettingsPanel"
import { Avatar, AvatarStack, callAction, Toaster } from "@/components/ui"
import {
  IconActivity,
  IconAlert,
  IconBoard,
  IconCheck,
  IconFilter,
  IconLogout,
  IconSearch,
  IconSettings,
  IconUsers,
  IconX,
} from "@/components/icons"
import { logoutAction } from "@/app/actions/auth"

const GAP = 1024

type Filters = {
  q: string
  mine: boolean
  person: string | null
  labels: string[]
  priorities: string[]
  hideDone: boolean
}

const emptyFilters: Filters = { q: "", mine: false, person: null, labels: [], priorities: [], hideDone: false }

function positionBetween(before?: number, after?: number) {
  if (before === undefined && after === undefined) return GAP
  if (before === undefined) return (after as number) - GAP
  if (after === undefined) return before + GAP
  return (before + after) / 2
}

function moveCardLocal(columns: ColumnDTO[], cardId: string, toColumnId: string, toIndex: number): ColumnDTO[] {
  let card: CardDTO | undefined
  const without = columns.map((col) => {
    const idx = col.cards.findIndex((c) => c.id === cardId)
    if (idx === -1) return col
    card = col.cards[idx]
    return { ...col, cards: col.cards.filter((c) => c.id !== cardId) }
  })
  if (!card) return columns
  return without.map((col) =>
    col.id === toColumnId
      ? {
          ...col,
          cards: [...col.cards.slice(0, toIndex), { ...card!, columnId: col.id }, ...col.cards.slice(toIndex)],
        }
      : col,
  )
}

export function BoardView({ initial }: { initial: BoardState }) {
  const [board, setBoard] = useState(initial)
  const [drag, setDrag] = useState<{
    columns: ColumnDTO[]
    origin: { columnId: string; position: number }
    activeId: string
  } | null>(null)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const [panel, setPanel] = useState<null | "people" | "info" | "settings">(null)
  const [showFilters, setShowFilters] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [boardName, setBoardName] = useState(initial.name)
  const [addingColumn, setAddingColumn] = useState(false)
  const [columnName, setColumnName] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef(drag)
  dragRef.current = drag

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const refresh = useCallback(async () => {
    const next = await getBoardStateAction(initial.slug)
    if (next) setBoard(next)
  }, [initial.slug])

  useEffect(() => {
    const id = setInterval(() => {
      if (dragRef.current) return
      if (document.visibilityState === "visible") refresh()
    }, 7000)
    const onFocus = () => {
      if (!dragRef.current) refresh()
    }
    window.addEventListener("focus", onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener("focus", onFocus)
    }
  }, [refresh])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
      if (e.key === "/" && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === "Escape" && !typing) {
        setOpenCardId(null)
        setPanel(null)
        setShowFilters(false)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const isAdmin = board.me.role === "admin"
  const source = drag?.columns ?? board.columns

  const visibleColumns = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    return source
      .filter((col) => !(filters.hideDone && kindOf(col.kind) === "done"))
      .map((col) => ({
        ...col,
        cards: col.cards.filter((card) => {
          if (filters.mine && !card.assignees.some((a) => a.userId === board.me.userId)) return false
          if (filters.person && !card.assignees.some((a) => a.userId === filters.person)) return false
          if (filters.priorities.length && !filters.priorities.includes(card.priority)) return false
          if (filters.labels.length && !filters.labels.some((id) => card.labels.some((l) => l.id === id))) return false
          if (q) {
            const hay = `${card.title} ${card.description} ${card.items.map((i) => i.text).join(" ")}`.toLowerCase()
            if (!hay.includes(q)) return false
          }
          return true
        }),
      }))
  }, [source, filters, board.me.userId])

  const openCard = useMemo(
    () => board.columns.flatMap((c) => c.cards).find((c) => c.id === openCardId) ?? null,
    [board.columns, openCardId],
  )
  const draggedCard = useMemo(() => {
    if (!drag?.activeId.startsWith("card:")) return null
    const id = drag.activeId.slice(5)
    return source.flatMap((c) => c.cards).find((c) => c.id === id) ?? null
  }, [drag, source])
  const activeFilterCount =
    (filters.mine ? 1 : 0) +
    (filters.person ? 1 : 0) +
    filters.labels.length +
    filters.priorities.length +
    (filters.hideDone ? 1 : 0)

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id)
    if (id.startsWith("card:")) {
      const cardId = id.slice(5)
      const col = board.columns.find((c) => c.cards.some((card) => card.id === cardId))
      const card = col?.cards.find((c) => c.id === cardId)
      if (!col || !card) return
      setDrag({ columns: board.columns, origin: { columnId: col.id, position: card.position }, activeId: id })
    } else if (id.startsWith("col:")) {
      setDrag({ columns: board.columns, origin: { columnId: id.slice(4), position: 0 }, activeId: id })
    }
  }

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e
    if (!over || !dragRef.current) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    if (activeId.startsWith("card:")) {
      const cardId = activeId.slice(5)
      const cols = dragRef.current.columns
      if (overId.startsWith("card:")) {
        const overCardId = overId.slice(5)
        const toCol = cols.find((c) => c.cards.some((card) => card.id === overCardId))
        if (!toCol) return
        let index = toCol.cards.findIndex((c) => c.id === overCardId)
        const fromCol = cols.find((c) => c.cards.some((card) => card.id === cardId))
        if (fromCol?.id === toCol.id) {
          const fromIndex = fromCol.cards.findIndex((c) => c.id === cardId)
          if (fromIndex < index) index -= 1
          if (fromIndex === index) return
        }
        setDrag({ ...dragRef.current, columns: moveCardLocal(cols, cardId, toCol.id, index) })
      } else if (overId.startsWith("col:")) {
        const toCol = cols.find((c) => c.id === overId.slice(4))
        if (!toCol) return
        const fromCol = cols.find((c) => c.cards.some((card) => card.id === cardId))
        if (fromCol?.id === toCol.id && fromCol.cards[fromCol.cards.length - 1]?.id === cardId) return
        setDrag({ ...dragRef.current, columns: moveCardLocal(cols, cardId, toCol.id, toCol.cards.length) })
      }
    } else if (activeId.startsWith("col:")) {
      const colId = activeId.slice(4)
      const targetId = overId.startsWith("col:") ? overId.slice(4) : null
      if (!targetId || targetId === colId) return
      const ids = dragRef.current.columns.map((c) => c.id)
      const from = ids.indexOf(colId)
      const to = ids.indexOf(targetId)
      if (from === -1 || to === -1) return
      setDrag({ ...dragRef.current, columns: arrayMove(dragRef.current.columns, from, to) })
    }
  }

  const onDragEnd = async (e: DragEndEvent) => {
    const state = dragRef.current
    setDrag(null)
    if (!state) return
    const activeId = String(e.active.id)

    if (activeId.startsWith("card:")) {
      const cardId = activeId.slice(5)
      const target = state.columns.find((c) => c.cards.some((card) => card.id === cardId))
      if (!target) return
      const index = target.cards.findIndex((c) => c.id === cardId)
      const real = board.columns.find((c) => c.id === target.id)?.cards.filter((c) => c.id !== cardId) ?? []
      const before = target.cards[index - 1]
        ? real.find((c) => c.id === target.cards[index - 1].id)?.position
        : undefined
      const after = target.cards[index + 1]
        ? real.find((c) => c.id === target.cards[index + 1].id)?.position
        : undefined
      const position = positionBetween(before, after)
      if (state.origin.columnId === target.id && Math.abs(state.origin.position - position) < 0.5) return
      const res = await callAction(moveCardAction(board.slug, cardId, target.id, position))
      if (!res) {
        await refresh()
        return
      }
      refresh()
      return
    }

    if (activeId.startsWith("col:")) {
      const colId = activeId.slice(4)
      const ids = state.columns.map((c) => c.id)
      const index = ids.indexOf(colId)
      if (index === -1) return
      if (board.columns.findIndex((c) => c.id === colId) === index) return
      const real = board.columns.filter((c) => c.id !== colId)
      const before = index > 0 ? real.find((c) => c.id === ids[index - 1])?.position : undefined
      const after = index < ids.length - 1 ? real.find((c) => c.id === ids[index + 1])?.position : undefined
      const res = await callAction(moveColumnAction(board.slug, colId, positionBetween(before, after)))
      if (res) refresh()
    }
  }

  const createCard = async (columnId: string, title: string) => {
    const res = await callAction(createCardAction(board.slug, columnId, title), "Tarea creada")
    if (res) refresh()
  }

  const addColumn = async () => {
    const clean = columnName.trim()
    if (!clean) return
    setColumnName("")
    setAddingColumn(false)
    const res = await callAction(createColumnAction(board.slug, clean, "todo"), "Columna creada")
    if (res) refresh()
  }

  const open = openCard ? <CardModal card={openCard} board={board} onClose={() => setOpenCardId(null)} onChanged={refresh} /> : null

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-board-line bg-board-panel/60 px-3 py-2.5 backdrop-blur">
        <Link href="/" className="btn-ghost px-2" title="Todos mis tableros">
          <IconBoard />
        </Link>

        {renaming ? (
          <input
            autoFocus
            className="input h-8 w-48 py-1 text-sm"
            value={boardName}
            onChange={(e) => setBoardName(e.target.value)}
            onBlur={async () => {
              setRenaming(false)
              if (boardName.trim() && boardName.trim() !== board.name) {
                const res = await callAction(renameBoardAction(board.slug, boardName))
                if (res) refresh()
              }
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        ) : (
          <button
            className="max-w-[40vw] truncate text-[15px] font-semibold"
            onClick={() => isAdmin && setRenaming(true)}
            title={isAdmin ? "Clic para renombrar" : undefined}
          >
            {board.name}
          </button>
        )}

        <div className="hidden items-center gap-2 sm:flex">
          <Progress done={board.stats.done} total={board.stats.total} />
          {board.stats.overdue > 0 && (
            <span className="chip bg-red-500/15 text-red-300" title="Tareas con fecha vencida">
              <IconAlert width={12} height={12} /> {board.stats.overdue} vencida
              {board.stats.overdue === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          <div className="relative">
            <IconSearch
              width={15}
              height={15}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-board-muted"
            />
            <input
              ref={searchRef}
              className="input h-9 w-28 py-1.5 pl-8 text-sm sm:w-52"
              placeholder="Buscar…  ( / )"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            />
          </div>

          <button
            onClick={() => setFilters((f) => ({ ...f, mine: !f.mine }))}
            className={cn("btn-ghost px-2.5 text-sm", filters.mine && "bg-board-accent/15 text-board-accent")}
            title="Solo mis tareas"
          >
            Mías
            {board.stats.mine > 0 && <span className="text-xs tabular-nums">{board.stats.mine}</span>}
          </button>

          <div className="relative">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={cn(
                "btn-ghost px-2.5",
                (showFilters || activeFilterCount > 0) && "bg-white/10 text-board-text",
              )}
              title="Filtros"
            >
              <IconFilter width={16} height={16} />
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-board-accent px-1.5 text-[10px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {showFilters && (
              <FilterPopover
                board={board}
                filters={filters}
                setFilters={setFilters}
                onClose={() => setShowFilters(false)}
              />
            )}
          </div>

          <button onClick={() => setPanel("people")} className="btn-ghost px-2.5" title="Personas">
            <span className="flex items-center gap-1.5">
              <AvatarStack people={board.members.map(onlyPerson)} size={22} max={3} />
              <IconUsers width={16} height={16} />
            </span>
          </button>

          <button onClick={() => setPanel("info")} className="btn-ghost px-2" title="Actividad">
            <span className="relative">
              <IconActivity />
              {board.activity[0] && (
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-board-accent" />
              )}
            </span>
          </button>

          {isAdmin && (
            <button onClick={() => setPanel("settings")} className="btn-ghost px-2" title="Ajustes">
              <IconSettings />
            </button>
          )}

          <form action={logoutAction}>
            <button className="btn-ghost px-2" title="Salir" aria-label="Salir">
              <IconLogout />
            </button>
          </form>
        </div>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDrag(null)}
      >
        <main className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-3 py-3">
          <SortableContext items={visibleColumns.map((c) => `col:${c.id}`)} strategy={horizontalListSortingStrategy}>
            {visibleColumns.map((col) => (
              <ColumnView
                key={col.id}
                column={col}
                meId={board.me.userId}
                isAdmin={isAdmin}
                onOpenCard={setOpenCardId}
                onCreateCard={createCard}
                onRenameColumn={async (id, name) => {
                  const res = await callAction(updateColumnAction(board.slug, id, { name }))
                  if (res) refresh()
                }}
                onChangeKind={async (id, kind) => {
                  const res = await callAction(updateColumnAction(board.slug, id, { kind }))
                  if (res) refresh()
                }}
                onSetWip={async (id, wip) => {
                  const res = await callAction(updateColumnAction(board.slug, id, { wipLimit: wip }))
                  if (res) refresh()
                }}
                onDeleteColumn={async (id) => {
                  const res = await callAction(deleteColumnAction(board.slug, id), "Columna borrada")
                  if (res) refresh()
                }}
              />
            ))}
          </SortableContext>

          {isAdmin &&
            (addingColumn ? (
              <div className="w-[260px] shrink-0 rounded-2xl border border-board-line bg-board-panel p-2">
                <input
                  autoFocus
                  className="input py-1.5 text-sm"
                  placeholder="Nombre de la columna"
                  value={columnName}
                  onChange={(e) => setColumnName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addColumn()
                    if (e.key === "Escape") {
                      setColumnName("")
                      setAddingColumn(false)
                    }
                  }}
                />
                <div className="mt-2 flex gap-1.5">
                  <button className="btn-primary px-2.5 py-1 text-xs" onClick={addColumn}>
                    Crear
                  </button>
                  <button
                    className="btn-ghost px-2 py-1 text-xs"
                    onClick={() => {
                      setColumnName("")
                      setAddingColumn(false)
                    }}
                  >
                    <IconX width={14} height={14} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingColumn(true)}
                className="h-11 w-[200px] shrink-0 self-start rounded-2xl border border-dashed border-board-line px-3 text-left text-sm text-board-muted transition hover:border-[#38486b] hover:text-board-text"
              >
                + Añadir columna
              </button>
            ))}
        </main>

        <DragOverlay dropAnimation={null}>
          {draggedCard ? <OverlayCard card={draggedCard} /> : null}
        </DragOverlay>
      </DndContext>

      {open}
      {panel === "people" && <MembersPanel board={board} onChanged={refresh} onClose={() => setPanel(null)} />}
      {panel === "info" && <ActivityPanel board={board} onClose={() => setPanel(null)} />}
      {panel === "settings" && <SettingsPanel board={board} onChanged={refresh} onClose={() => setPanel(null)} />}
      <Toaster />
    </div>
  )
}

function onlyPerson(m: { userId: string; name: string; email: string; color: string }) {
  return { userId: m.userId, name: m.name, email: m.email, color: m.color }
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="flex items-center gap-2" title={`${done} de ${total} tareas terminadas`}>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-board-muted">
        {done}/{total}
      </span>
    </div>
  )
}

function OverlayCard({ card }: { card: CardDTO }) {
  return (
    <div className="w-[300px] rotate-2 rounded-xl border border-board-accent/50 bg-board-panel2 p-3 shadow-pop">
      <p className="text-[13.5px] font-medium leading-snug">{card.title}</p>
    </div>
  )
}

function FilterPopover({
  board,
  filters,
  setFilters,
  onClose,
}: {
  board: BoardState
  filters: Filters
  setFilters: React.Dispatch<React.SetStateAction<Filters>>
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [onClose])

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  return (
    <div
      ref={ref}
      className="absolute right-0 top-11 z-40 w-72 rounded-xl border border-board-line bg-board-panel p-3 shadow-pop animate-slide-up"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Filtros</p>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setFilters(emptyFilters)}>
          Limpiar
        </button>
      </div>

      <p className="mb-1.5 text-[11px] uppercase tracking-wide text-board-muted">Responsable</p>
      <div className="mb-3 flex flex-wrap gap-1">
        <button
          onClick={() => setFilters((f) => ({ ...f, person: null }))}
          className={cn(
            "rounded-md border px-2 py-1 text-xs",
            !filters.person ? "border-board-accent bg-board-accent/15 text-board-text" : "border-board-line text-board-muted",
          )}
        >
          Todos
        </button>
        {board.members.map((m) => (
          <button
            key={m.userId}
            onClick={() => setFilters((f) => ({ ...f, person: filters.person === m.userId ? null : m.userId }))}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
              filters.person === m.userId
                ? "border-board-accent bg-board-accent/15 text-board-text"
                : "border-board-line text-board-muted",
            )}
          >
            <Avatar person={m} size={16} />
            {m.name.split(" ")[0]}
          </button>
        ))}
      </div>

      <p className="mb-1.5 text-[11px] uppercase tracking-wide text-board-muted">Prioridad</p>
      <div className="mb-3 flex flex-wrap gap-1">
        {Object.entries(PRIORITIES).map(([key, p]) => (
          <button
            key={key}
            onClick={() => setFilters((f) => ({ ...f, priorities: toggle(f.priorities, key) }))}
            className={cn(
              "rounded-md border px-2 py-1 text-xs",
              filters.priorities.includes(key)
                ? "border-transparent"
                : "border-board-line text-board-muted",
            )}
            style={
              filters.priorities.includes(key) ? { background: `${p.color}33`, color: p.color } : undefined
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {board.labels.length > 0 && (
        <>
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-board-muted">Etiquetas</p>
          <div className="mb-3 flex flex-wrap gap-1">
            {board.labels.map((l) => (
              <button
                key={l.id}
                onClick={() => setFilters((f) => ({ ...f, labels: toggle(f.labels, l.id) }))}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs",
                  filters.labels.includes(l.id) ? "border-transparent" : "border-board-line text-board-muted",
                )}
                style={
                  filters.labels.includes(l.id) ? { background: `${l.color}33`, color: l.color } : undefined
                }
              >
                {l.name}
              </button>
            ))}
          </div>
        </>
      )}

      <button
        onClick={() => setFilters((f) => ({ ...f, hideDone: !f.hideDone }))}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm",
          filters.hideDone ? "border-board-accent bg-board-accent/15" : "border-board-line",
        )}
      >
        <span
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded border",
            filters.hideDone ? "border-board-accent bg-board-accent text-white" : "border-board-line",
          )}
        >
          {filters.hideDone && <IconCheck width={11} height={11} strokeWidth={3} />}
        </span>
        Ocultar la columna Terminadas
      </button>
    </div>
  )
}
