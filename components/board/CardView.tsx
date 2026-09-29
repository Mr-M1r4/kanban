"use client"

import { memo } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { CardDTO } from "@/lib/types"
import { cn, formatDue, priorityOf } from "@/lib/utils"
import { AvatarStack } from "@/components/ui"
import { IconCalendar, IconCheckList, IconComment, IconFlag } from "@/components/icons"

type Props = {
  card: CardDTO
  meId: string
  onOpen: (id: string) => void
}

export const CardView = memo(function CardView({ card, meId, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `card:${card.id}`,
    data: { type: "card" },
  })

  const due = formatDue(card.dueAt)
  const priority = priorityOf(card.priority)
  const doneItems = card.items.filter((i) => i.done).length
  const totalItems = card.items.length
  const isMine = card.assignees.some((a) => a.userId === meId)

  return (
    <div
      ref={setNodeRef}
      data-card-id={card.id}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ...(isMine
          ? { borderLeftColor: card.assignees.find((a) => a.userId === meId)?.color }
          : {}),
      }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(card.id)}
      className={cn(
        "group relative cursor-grab touch-pan-y rounded-xl border border-board-line bg-board-panel2 p-3 shadow-card transition",
        "hover:border-[#3a4a70] focus:outline-none focus-visible:ring-2 focus-visible:ring-board-accent/50",
        isDragging && "z-10 rotate-1 opacity-40",
        isMine && "border-l-[3px]",
      )}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(card.id)
      }}
    >
      {isMine && (
        <span
          className="absolute left-0 top-3 h-[calc(100%-1.5rem)] w-[3px] rounded-full"
          style={{ background: card.assignees.find((a) => a.userId === meId)?.color }}
        />
      )}

      {card.labels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {card.labels.map((l) => (
            <span
              key={l.id}
              className="chip"
              style={{ background: `${l.color}22`, color: l.color }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}

      <p className="text-[13.5px] font-medium leading-snug text-board-text">{card.title}</p>

      {(due || totalItems > 0 || card.commentCount > 0 || card.priority !== "normal" || card.assignees.length > 0) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-board-muted">
          {card.priority !== "normal" && (
            <span className="chip" style={{ background: `${priority.color}1f`, color: priority.color }}>
              <IconFlag width={11} height={11} /> {priority.label}
            </span>
          )}
          {due && (
            <span
              suppressHydrationWarning
              className={cn(
                "chip",
                due.tone === "late" && "bg-red-500/15 text-red-300",
                due.tone === "soon" && "bg-amber-500/15 text-amber-300",
                due.tone === "later" && "bg-white/5 text-board-muted",
              )}
            >
              <IconCalendar width={11} height={11} /> {due.text}
            </span>
          )}
          {totalItems > 0 && (
            <span className="chip bg-white/5 text-board-muted">
              <IconCheckList width={11} height={11} /> {doneItems}/{totalItems}
            </span>
          )}
          {card.commentCount > 0 && (
            <span className="chip bg-white/5 text-board-muted">
              <IconComment width={11} height={11} /> {card.commentCount}
            </span>
          )}
          <span className="ml-auto">
            <AvatarStack people={card.assignees} size={20} max={3} />
          </span>
        </div>
      )}
    </div>
  )
})
