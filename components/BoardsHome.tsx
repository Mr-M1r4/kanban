"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Avatar } from "@/components/ui"
import { IconBoard, IconLogout, IconPlus } from "@/components/icons"
import { getApi } from "@/lib/api"

type Board = {
  slug: string
  name: string
  role: "admin" | "member"
  cards: number
  people: number
  pending: boolean
}

export function BoardsHome({
  me,
  boards,
}: {
  me: { name: string; email: string; color: string }
  boards: Board[]
}) {
  const api = getApi()
  const router = useRouter()
  const [name, setName] = useState("")
  const [pending, setPending] = useState(false)

  const create = async () => {
    const clean = name.trim()
    if (clean.length < 2) return
    setPending(true)
    const res = await api.createBoard(clean)
    setPending(false)
    if (res.ok) {
      setName("")
      router.push(`/t?b=${encodeURIComponent(res.data.slug)}`)
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-10">
      <header className="mb-8 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-board-accent/15 text-board-accent">
          <IconBoard width={22} height={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">Tus tableros</h1>
          <p className="truncate text-sm text-board-muted">{me.email}</p>
        </div>
        <Avatar person={me} size={34} />
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void api.signOut().then(() => router.push("/entrar"))
          }}
        >
          <button className="btn-ghost px-2" title="Salir" aria-label="Salir">
            <IconLogout />
          </button>
        </form>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {boards.map((b) => (
          <li key={b.slug}>
            <a
              href={`/t?b=${encodeURIComponent(b.slug)}`}
              className="card-surface block p-4 transition hover:border-[#38486b] hover:bg-[#1d2740]"
            >
              <div className="flex items-center gap-2">
                <h2 className="min-w-0 flex-1 truncate font-medium">{b.name}</h2>
                {b.role === "admin" && (
                  <span className="chip bg-board-accent/15 text-board-accent">admin</span>
                )}
              </div>
              <p className="mt-1.5 text-sm text-board-muted">
                {b.cards} {b.cards === 1 ? "tarea" : "tareas"} · {b.people}{" "}
                {b.people === 1 ? "persona" : "personas"}
                {b.pending ? " · invitación pendiente" : ""}
              </p>
            </a>
          </li>
        ))}
        {boards.length === 0 && (
          <li className="card-surface col-span-full p-6 text-center text-sm text-board-muted">
            Todavía no estás en ningún tablero. Crea el primero o entra con un enlace de invitación.
          </li>
        )}
      </ul>

      <div className="card-surface mt-4 flex gap-2 p-3">
        <input
          className="input"
          placeholder="Nombre del nuevo tablero"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
            if (e.key === "Enter") void create()
          }}
        />
        <button className="btn-primary shrink-0" onClick={() => void create()} disabled={pending || name.trim().length < 2}>
          <IconPlus /> Crear
        </button>
      </div>
    </main>
  )
}
