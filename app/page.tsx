import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { BoardsHome } from "@/components/BoardsHome"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/entrar")

  const boards = await prisma.boardMember.findMany({
    where: { userId: user.id },
    orderBy: { board: { createdAt: "desc" } },
    include: {
      board: {
        include: {
          _count: { select: { cards: true } },
          members: { select: { id: true } },
        },
      },
    },
  })

  return (
    <BoardsHome
      me={{ name: user.name, email: user.email, color: user.color }}
      boards={boards.map((m) => ({
        slug: m.board.slug,
        name: m.board.name,
        role: m.role === "admin" ? ("admin" as const) : ("member" as const),
        cards: m.board._count.cards,
        people: m.board.members.length,
        pending: !m.joinedAt,
      }))}
    />
  )
}
