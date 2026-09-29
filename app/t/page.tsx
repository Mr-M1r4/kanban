"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { BoardView } from "@/components/board/BoardView"
import { Spinner } from "@/components/ui"
import { getApi } from "@/lib/api"
import type { BoardState } from "@/lib/types"

export default function BoardPage() {
  return (
    <Suspense fallback={<Center />}>
      <Board />
    </Suspense>
  )
}

function Center({ text }: { text?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center gap-2 text-board-muted">
      <Spinner />
      {text && <span className="text-sm">{text}</span>}
    </main>
  )
}

function Board() {
  const api = getApi()
  const router = useRouter()
  const params = useSearchParams()
  const slug = params.get("b") || ""
  const [state, setState] = useState<BoardState | null>(null)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!slug) {
        router.replace("/")
        return
      }
      const session = await api.getSession()
      if (!alive) return
      if (!session) {
        router.replace("/entrar")
        return
      }
      const board = await api.getBoardState(slug)
      if (!alive) return
      if (!board) setDenied(true)
      else setState(board)
    })()
    return () => {
      alive = false
    }
  }, [api, router, slug])

  if (denied) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="card-surface w-full max-w-sm p-6 text-center">
          <h1 className="text-lg font-semibold">No tienes acceso a este tablero</h1>
          <p className="mt-2 text-sm text-board-muted">
            Pide a un administrador que te agregue por correo y te comparta el enlace de invitación.
          </p>
          <Link href="/" className="btn-primary mt-5 w-full py-2.5">
            Ir a mis tableros
          </Link>
        </div>
      </main>
    )
  }

  if (!state) return <Center text="Abriendo el tablero" />
  return <BoardView initial={state} />
}
