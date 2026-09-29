import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { LoginScreen } from "@/components/LoginScreen"

export const dynamic = "force-dynamic"

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { error?: string }
}) {
  const user = await getCurrentUser()
  if (user) redirect("/")
  const totalUsers = await prisma.user.count()
  const pinRequired = (process.env.BOARD_PIN || "").trim().length > 0

  return (
    <LoginScreen
      firstRun={totalUsers === 0}
      pinRequired={pinRequired}
      invalidInvite={searchParams?.error === "invalido"}
    />
  )
}
