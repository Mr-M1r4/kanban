import { prisma } from "@/lib/db"
import { acceptInviteAction } from "@/app/actions/auth"
import { IconArrowRight, IconLogo } from "@/components/icons"
import { Avatar } from "@/components/ui"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function InvitePage({ params }: { params: { token: string } }) {
  const invite = await prisma.boardMember.findUnique({
    where: { inviteToken: params.token },
    include: { board: true, user: true },
  })

  if (!invite) {
    return (
      <Shell
        title="Invitación no válida"
        body="Este enlace ya no sirve. Pídele a un administrador del tablero que te envíe uno nuevo desde Ajustes → Personas."
      />
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card-surface w-full max-w-sm p-6 text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-board-accent/15 text-board-accent">
          <IconLogo width={24} height={24} />
        </span>
        <Avatar person={invite.user} size={44} />
        <h1 className="mt-3 text-lg font-semibold">Hola, {invite.user.name}</h1>
        <p className="mt-1.5 text-sm text-board-muted">
          Te invitaron al tablero <span className="text-board-text">{invite.board.name}</span>
          {invite.joinedAt ? " (ya eres miembro, vuelve a entrar)" : ""}.
        </p>
        <form action={acceptInviteAction.bind(null, params.token)} className="mt-5">
          <button type="submit" className="btn-primary w-full py-2.5">
            Entrar al tablero <IconArrowRight />
          </button>
        </form>
        <p className="mt-3 text-xs text-board-muted">Sin contraseñas. El enlace es de un solo uso.</p>
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
