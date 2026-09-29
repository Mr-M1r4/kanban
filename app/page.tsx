"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { BoardsHome } from "@/components/BoardsHome"
import { Spinner } from "@/components/ui"
import { getApi } from "@/lib/api"
import type { BoardSummary } from "@/lib/api/types"
import type { PersonDTO } from "@/lib/types"

export default function HomePage() {
  const api = getApi()
  const router = useRouter()
  const [me, setMe] = useState<PersonDTO | null>(null)
  const [boards, setBoards] = useState<BoardSummary[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const session = await api.getSession()
      if (!alive) return
      if (!session) {
        router.replace("/entrar")
        return
      }
      setMe(session)
      setBoards(await api.listBoards())
      setReady(true)
    })()
    return () => {
      alive = false
    }
  }, [api, router])

  if (!ready || !me) {
    return (
      <main className="flex min-h-screen items-center justify-center text-board-muted">
        <Spinner />
      </main>
    )
  }

  return (
    <BoardsHome
      me={me}
      boards={boards.map((b) => ({
        slug: b.slug,
        name: b.name,
        role: b.role,
        cards: b.cardCount,
        people: b.memberCount,
        pending: false,
      }))}
    />
  )
}
