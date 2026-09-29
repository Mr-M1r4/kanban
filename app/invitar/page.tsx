"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { IconArrowRight, IconLogo } from "@/components/icons"
import { Avatar, Spinner } from "@/components/ui"
import { getApi } from "@/lib/api"
import type { InviteInfo } from "@/lib/api/types"

export default function InvitePage() {
  return (
    <Suspense fallback={<Center />}>
      <Invite />
    </Suspense>
  )
}

function Center() {
  return (
    <main className="flex min-h-screen items-center justify-center text-board-muted">
      <Spinner />
    </main>
  )
}

function Invite() {
  const api = getApi()
  const router = useRouter()
  const params = useSearchParams()
  const t = params.get("token") || ""
  const [me, setMe] = useState<{ name: string; email: string; color: string } | null>(null)
  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [phase, setPhase] = useState<"loading" | "needLogin" | "ready" | "invalid">("loading")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (isAlive: () => boolean) => {
      if (!t) return
      const session = await api.getSession()
      if (!isAlive()) return
      if (!session) {
        setMe(null)
        setInvite(null)
        setPhase("needLogin")
        return
      }
      setMe(session)
      const info = await api.getInvite(t)
      if (!isAlive()) return
      if (!info) {
        setPhase("invalid")
        return
      }
      setInvite(info)
      setPhase("ready")
    },
    [api, t],
  )

  useEffect(() => {
    let alive = true
    void load(() => alive)
    return () => {
      alive = false
    }
  }, [load])

  if (phase === "needLogin") return <NeedLogin onSignedIn={() => load(() => true)} />

  if (phase === "invalid") {
    return (
      <Shell
        title="Invitación no válida"
        body="Este enlace ya no sirve. Pídele a un administrador del tablero que te envíe uno nuevo desde Personas."
      />
    )
  }

  if (phase !== "ready" || !invite) return <Center />

  const accept = async () => {
    setBusy(true)
    setError(null)
    const res = await api.acceptInvite(t)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    router.push(`/t?b=${encodeURIComponent(res.data.slug)}`)
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card-surface w-full max-w-sm p-6 text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-board-accent/15 text-board-accent">
          <IconLogo width={24} height={24} />
        </span>
        <Avatar person={{ name: me?.name || invite.name, color: me?.color || "#5b8cff" }} size={44} />
        <h1 className="mt-3 text-lg font-semibold">Hola, {me?.name || invite.name}</h1>
        <p className="mt-1.5 text-sm text-board-muted">
          Te invitaron al tablero <span className="text-board-text">{invite.boardName}</span>
          {!invite.pending && " (ya eres miembro, vuelve a entrar)"}.
        </p>
        {error && (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
        <button onClick={() => void accept()} className="btn-primary mt-5 w-full py-2.5" disabled={busy}>
          {busy ? <Spinner /> : null}
          Entrar al tablero {!busy && <IconArrowRight />}
        </button>
        <p className="mt-3 text-xs text-board-muted">Sin contraseñas. El enlace es de un solo uso.</p>
      </div>
    </main>
  )
}

function NeedLogin({ onSignedIn }: { onSignedIn: () => void | Promise<void> }) {
  const api = getApi()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    const res = await api.signIn(
      String(form.get("email") || ""),
      String(form.get("pin") || ""),
      String(form.get("name") || ""),
    )
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    await onSignedIn()
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card-surface w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold">Te invitaron a un tablero</h1>
        <p className="mt-1.5 text-sm text-board-muted">Escribe tu correo para aceptar la invitación.</p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <input name="email" type="email" required autoFocus className="input" placeholder="tucorreo@empresa.com" />
          {api.needsPin && (
            <input name="pin" type="password" required className="input" placeholder="PIN del equipo" />
          )}
          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full py-2.5" disabled={busy}>
            {busy ? <Spinner /> : null}
            Continuar
          </button>
        </form>
      </div>
    </main>
  )
}

function Shell({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card-surface w-full max-w-sm p-6 text-center">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-board-muted">{body}</p>
        <Link href="/entrar" className="btn-primary mt-5 w-full py-2.5">
          Ir a entrar
        </Link>
      </div>
    </main>
  )
}
