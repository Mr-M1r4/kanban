"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { LoginScreen } from "@/components/LoginScreen"
import { Spinner } from "@/components/ui"
import { getApi } from "@/lib/api"

export default function LoginPage() {
  return (
    <Suspense fallback={<Center />}>
      <Login />
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

function Login() {
  const api = getApi()
  const router = useRouter()
  const params = useSearchParams()
  const [state, setState] = useState<{ firstRun: boolean; ready: boolean } | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const session = await api.getSession()
      if (!alive) return
      if (session) {
        router.replace("/")
        return
      }
      setState({ firstRun: await api.isFirstRun(), ready: true })
    })()
    return () => {
      alive = false
    }
  }, [api, router])

  if (!state?.ready) return <Center />

  return (
    <LoginScreen
      firstRun={state.firstRun}
      pinRequired={api.needsPin}
      invalidInvite={params.get("error") === "invalido"}
    />
  )
}
