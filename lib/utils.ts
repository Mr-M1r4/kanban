import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const APP_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")

const AVATAR_COLORS = [
  "#5b8cff",
  "#e0607e",
  "#2fb3a3",
  "#f2a33c",
  "#9b6bff",
  "#3ec46d",
  "#ff7a45",
  "#00a8b5",
  "#d94f70",
  "#7f8fa6",
]

export function colorFor(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "tablero"
  )
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function isEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
}

export const PRIORITIES = {
  urgent: { label: "Urgente", short: "U", color: "#ef4444", rank: 0 },
  high: { label: "Alta", short: "A", color: "#f97316", rank: 1 },
  normal: { label: "Normal", short: "N", color: "#64748b", rank: 2 },
  low: { label: "Baja", short: "B", color: "#38bdf8", rank: 3 },
} as const

export type PriorityKey = keyof typeof PRIORITIES
export const PRIORITY_KEYS = Object.keys(PRIORITIES) as PriorityKey[]

export const COLUMN_KINDS = {
  todo: { label: "Programadas", dot: "#94a3b8" },
  doing: { label: "En ejecucion", dot: "#5b8cff" },
  done: { label: "Terminadas", dot: "#22c55e" },
} as const

export type ColumnKind = keyof typeof COLUMN_KINDS
export const COLUMN_KIND_KEYS = Object.keys(COLUMN_KINDS) as ColumnKind[]

export function priorityOf(key: string) {
  return PRIORITIES[(key as PriorityKey) in PRIORITIES ? (key as PriorityKey) : "normal"]
}

export function kindOf(key: string): ColumnKind {
  return (COLUMN_KIND_KEYS as string[]).includes(key) ? (key as ColumnKind) : "todo"
}

export function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfToday() {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

export function formatDue(date: Date | string | null) {
  if (!date) return null
  const d = new Date(date)
  const day = new Date(d)
  day.setHours(0, 0, 0, 0)
  const today = startOfToday()
  const diffDays = Math.round((day.getTime() - today.getTime()) / 86400000)
  const time = d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })
  if (diffDays === 0) return { text: `Hoy ${time}`, tone: "soon" as const, days: 0 }
  if (diffDays === 1) return { text: `Mañana ${time}`, tone: "soon" as const, days: 1 }
  if (diffDays === -1) return { text: `Ayer ${time}`, tone: "late" as const, days: -1 }
  if (diffDays < 0) return { text: `Venció hace ${Math.abs(diffDays)} d`, tone: "late" as const, days: diffDays }
  if (diffDays <= 7) return { text: `${diffDays} días`, tone: "soon" as const, days: diffDays }
  return {
    text: d.toLocaleDateString("es", { day: "2-digit", month: "short" }),
    tone: "later" as const,
    days: diffDays,
  }
}

export function timeAgo(date: Date | string) {
  const d = new Date(date).getTime()
  const secs = Math.round((Date.now() - d) / 1000)
  if (secs < 45) return "ahora"
  const mins = Math.round(secs / 60)
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.round(hours / 24)
  if (days < 30) return `hace ${days} d`
  return new Date(date).toLocaleDateString("es", { day: "2-digit", month: "short" })
}

export function toInputDateTime(date: Date | string | null) {
  if (!date) return ""
  const d = new Date(date)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
