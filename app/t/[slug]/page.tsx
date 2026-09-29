import { notFound } from "next/navigation"
import { requireMembership } from "@/lib/auth"
import { getActivity, loadBoard, serializeBoard } from "@/lib/board"
import { BoardView } from "@/components/board/BoardView"

export const dynamic = "force-dynamic"

export default async function BoardPage({ params }: { params: { slug: string } }) {
  const membership = await requireMembership(params.slug)
  const board = await loadBoard(params.slug)
  if (!board) notFound()

  const state = serializeBoard(board, membership.userId)
  state.activity = await getActivity(params.slug, 30)

  return <BoardView initial={state} />
}
