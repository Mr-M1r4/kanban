"use client"

import { useFormState, useFormStatus } from "react-dom"
import { loginAction, type FormState } from "@/app/actions/auth"
import { IconArrowRight, IconLogo } from "@/components/icons"
import { Spinner } from "@/components/ui"

const initial: FormState = {}

function Submit({ text }: { text: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn-primary w-full py-2.5 text-[15px]" disabled={pending}>
      {pending ? <Spinner /> : null}
      {text}
      {!pending && <IconArrowRight />}
    </button>
  )
}

export function LoginScreen({
  firstRun,
  pinRequired,
  invalidInvite,
}: {
  firstRun: boolean
  pinRequired: boolean
  invalidInvite: boolean
}) {
  const [state, formAction] = useFormState(loginAction, initial)
  const error = invalidInvite
    ? "Ese enlace de invitación ya no es válido. Pídele a un administrador uno nuevo."
    : state.error

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex items-center justify-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-board-accent/15 text-board-accent">
            <IconLogo width={22} height={22} />
          </span>
          <span className="text-xl font-semibold tracking-tight">Kanban</span>
        </div>

        <div className="card-surface p-6">
          <h1 className="text-lg font-semibold">
            {firstRun ? "Crea el primer tablero" : "Entra con tu correo"}
          </h1>
          <p className="mt-1.5 text-sm text-board-muted">
            {firstRun
              ? "Solo tú. Después irás a Ajustes → Personas y agregas a tu equipo por correo."
              : "Escribe el correo con el que te agregaron al tablero. Sin contraseñas."}
          </p>

          <form action={formAction} className="mt-5 space-y-3">
            {firstRun && (
              <>
                <input name="boardName" className="input" placeholder="Nombre del tablero" maxLength={60} />
                <input name="name" className="input" placeholder="Tu nombre" maxLength={60} />
              </>
            )}
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              className="input"
              placeholder="tucorreo@empresa.com"
            />
            {pinRequired && (
              <input
                name="pin"
                type="password"
                inputMode="numeric"
                required
                className="input"
                placeholder="PIN del equipo"
              />
            )}

            {error && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            )}

            <Submit text={firstRun ? "Crear tablero" : "Entrar"} />
          </form>
        </div>

        <p className="mt-4 px-2 text-center text-xs leading-relaxed text-board-muted">
          ¿Te invitaron y no puedes entrar? Pide que te agreguen desde el tablero y te comparten el
          enlace de invitación.
        </p>
      </div>
    </main>
  )
}
