"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn, initials } from "@/lib/utils"
import { IconX } from "@/components/icons"
import type { PersonDTO } from "@/lib/types"

export function Avatar({
  person,
  size = 28,
  title,
  ring,
}: {
  person: Pick<PersonDTO, "name" | "color">
  size?: number
  title?: string
  ring?: boolean
}) {
  return (
    <span
      title={title ?? person.name}
      style={{
        width: size,
        height: size,
        background: `${person.color}22`,
        borderColor: person.color,
        color: person.color,
        fontSize: Math.max(9, size * 0.4),
      }}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full border font-semibold uppercase",
        ring && "ring-2 ring-board-bg",
      )}
    >
      {initials(person.name)}
    </span>
  )
}

export function AvatarStack({
  people,
  max = 4,
  size = 24,
}: {
  people: PersonDTO[]
  max?: number
  size?: number
}) {
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  return (
    <span className="flex items-center -space-x-1.5">
      {shown.map((p) => (
        <Avatar key={p.userId} person={p} size={size} ring />
      ))}
      {rest > 0 && (
        <span
          style={{ width: size, height: size, fontSize: Math.max(9, size * 0.38) }}
          className="inline-flex items-center justify-center rounded-full border border-board-line bg-board-panel font-semibold text-board-muted ring-2 ring-board-bg"
        >
          +{rest}
        </span>
      )}
    </span>
  )
}

export function Modal({
  open,
  onClose,
  children,
  className,
  side = false,
  labelledBy,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  side?: boolean
  labelledBy?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "relative max-h-[92vh] w-full overflow-hidden border border-board-line bg-board-panel shadow-pop animate-slide-up",
          side
            ? "sm:h-[86vh] sm:max-w-md sm:rounded-2xl"
            : "sm:max-w-2xl sm:rounded-2xl",
          "rounded-t-2xl sm:rounded-2xl",
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}

export function ModalHeader({
  title,
  onClose,
  children,
  id,
}: {
  title: ReactNode
  onClose: () => void
  children?: ReactNode
  id?: string
}) {
  return (
    <div className="flex items-center gap-3 border-b border-board-line px-5 py-4">
      <h2 id={id} className="min-w-0 flex-1 truncate text-base font-semibold">
        {title}
      </h2>
      {children}
      <button onClick={onClose} className="btn-ghost -mr-2 px-2" aria-label="Cerrar">
        <IconX />
      </button>
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-board-line border-t-board-accent",
        className,
      )}
    />
  )
}

type ToastTone = "ok" | "error" | "info"
type ToastItem = { id: number; text: string; tone: ToastTone }

let listeners: ((t: ToastItem) => void)[] = []

export function toast(text: string, tone: ToastTone = "ok") {
  const item = { id: Date.now() + Math.random(), text, tone }
  listeners.forEach((l) => l(item))
}

/** Ejecuta una acción del servidor y muestra el error en un toast. Devuelve null si falló. */
export async function callAction<T = undefined>(
  res: Promise<{ ok: true; data?: T } | { ok: false; error: string }>,
  okMessage?: string,
): Promise<{ ok: true; data: T } | null> {
  const r = await res
  if (!r.ok) {
    toast(r.error, "error")
    return null
  }
  if (okMessage) toast(okMessage, "ok")
  return { ok: true, data: r.data as T }
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])
  useEffect(() => {
    const listener = (t: ToastItem) => {
      setItems((p) => [...p.slice(-3), t])
      setTimeout(() => setItems((p) => p.filter((x) => x.id !== t.id)), 3400)
    }
    listeners.push(listener)
    return () => {
      listeners = listeners.filter((l) => l !== listener)
    }
  }, [])

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto max-w-md rounded-xl border px-4 py-2.5 text-sm shadow-pop animate-slide-up",
            t.tone === "ok" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
            t.tone === "error" && "border-red-500/40 bg-red-500/10 text-red-100",
            t.tone === "info" && "border-board-line bg-board-panel text-board-text",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-board-muted">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-board-muted">{hint}</span>}
    </label>
  )
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-sm text-board-text"
    >
      <span
        className={cn(
          "relative h-5 w-9 rounded-full transition",
          checked ? "bg-board-accent" : "bg-board-line",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
            checked ? "left-[1.15rem]" : "left-0.5",
          )}
        />
      </span>
      {label}
    </button>
  )
}
