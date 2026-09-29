import { PrismaClient } from "@prisma/client"
import { DEFAULT_COLUMNS, DEFAULT_LABELS } from "../lib/defaults"

const prisma = new PrismaClient()

const PEOPLE = [
  { email: "ana@demo.local", name: "Ana Ruiz", color: "#5b8cff", role: "admin" as const },
  { email: "bruno@demo.local", name: "Bruno Díaz", color: "#2fb3a3", role: "member" as const },
  { email: "carla@demo.local", name: "Carla Mendes", color: "#f2a33c", role: "member" as const },
]

const inDays = (d: number, hour = 18) => {
  const x = new Date()
  x.setDate(x.getDate() + d)
  x.setHours(hour, 0, 0, 0)
  return x
}

async function main() {
  const existing = await prisma.board.findUnique({ where: { slug: "demo" } })
  if (existing) {
    console.log("El tablero de demostración ya existe (http://localhost:3000/t/demo).")
    return
  }

  const board = await prisma.board.create({
    data: {
      name: "Proyecto Demo",
      slug: "demo",
      columns: { create: DEFAULT_COLUMNS.map((c, i) => ({ ...c, position: i * 1024 })) },
      labels: { create: DEFAULT_LABELS },
    },
    include: { columns: { orderBy: { position: "asc" } } },
  })

  const users = []
  for (const p of PEOPLE) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      create: { email: p.email, name: p.name, color: p.color },
      update: { name: p.name, color: p.color },
    })
    await prisma.boardMember.create({
      data: { boardId: board.id, userId: user.id, role: p.role, joinedAt: new Date() },
    })
    users.push(user)
  }

  const [todo, doing, done] = board.columns
  const labels = await prisma.label.findMany({ where: { boardId: board.id } })
  const label = (n: string) => labels.find((l) => l.name === n)?.id

  const cards: {
    col: string
    title: string
    desc: string
    priority: string
    due: Date | null
    assignees: string[]
    labels: (string | undefined)[]
    items: { text: string; done: boolean; assignee?: string }[]
    comments?: { author: string; body: string }[]
  }[] = [
    {
      col: todo.id,
      title: "Diseñar la pantalla de inicio de sesión",
      desc: "Mockups en Figma + revisión con el equipo. Debe funcionar en móvil.",
      priority: "high",
      due: inDays(4),
      assignees: [users[2].id],
      labels: [label("Diseño")],
      items: [
        { text: "Bocetos de las dos variantes", done: true, assignee: users[2].id },
        { text: "Alta de componentes en el sistema de diseño", done: false, assignee: users[2].id },
        { text: "Revisión con el equipo", done: false },
      ],
      comments: [{ author: users[0].id, body: "Recuerde mantener el mismo tono que el resto del producto." }],
    },
    {
      col: todo.id,
      title: "Configurar los correos transaccionales",
      desc: "Alta de plantillas y pruebas de envío.",
      priority: "normal",
      due: inDays(9),
      assignees: [users[1].id],
      labels: [label("Desarrollo")],
      items: [
        { text: "Plantilla de bienvenida", done: true, assignee: users[1].id },
        { text: "Plantilla de recuperación de contraseña", done: false, assignee: users[1].id },
      ],
    },
    {
      col: todo.id,
      title: "Corregir el error de la suma total en el carrito",
      desc: "Con redondeo, el total se va un centavo cuando hay descuentos.",
      priority: "urgent",
      due: inDays(-1),
      assignees: [users[1].id, users[2].id],
      labels: [label("Bug")],
      items: [{ text: "Reproducir con dos descuentos", done: true, assignee: users[1].id }],
    },
    {
      col: doing.id,
      title: "Migrar la base de datos a la versión nueva",
      desc: "Hacer la migración en una copia primero y medir cuánto tarda.",
      priority: "high",
      due: inDays(1),
      assignees: [users[1].id],
      labels: [label("Desarrollo")],
      items: [
        { text: "Copia de seguridad", done: true, assignee: users[1].id },
        { text: "Migración en entorno de pruebas", done: true, assignee: users[1].id },
        { text: "Medir tiempos y ajustar índices", done: false, assignee: users[1].id },
      ],
      comments: [
        { author: users[1].id, body: "La copia de esta noche tardó 4 minutos, viene bien de tiempo." },
        { author: users[0].id, body: "Perfecto, sigamos con las pruebas." },
      ],
    },
    {
      col: doing.id,
      title: "Escribir la guía de estilo de los correos",
      desc: "Tono, saludo, firmas y qué no escribir nunca.",
      priority: "low",
      due: inDays(6),
      assignees: [users[2].id],
      labels: [label("Diseño")],
      items: [{ text: "Ejemplos antes/después", done: false, assignee: users[2].id }],
    },
    {
      col: done.id,
      title: "Definir la paleta de colores de la marca",
      desc: "Se Approbó en la reunión del lunes.",
      priority: "normal",
      due: inDays(-3),
      assignees: [users[2].id],
      labels: [label("Diseño")],
      items: [
        { text: "Primaria, secundaria y de acento", done: true, assignee: users[2].id },
        { text: "Contraste accesible", done: true, assignee: users[2].id },
      ],
    },
    {
      col: done.id,
      title: "Poner en marcha los avisos automáticos",
      desc: "Funcionando desde el lunes.",
      priority: "normal",
      due: inDays(-6),
      assignees: [users[1].id],
      labels: [label("Mejora"), label("Desarrollo")],
      items: [{ text: "Configurar cron", done: true, assignee: users[1].id }],
    },
  ]

  let i = 0
  for (const c of cards) {
    const card = await prisma.card.create({
      data: {
        boardId: board.id,
        columnId: c.col,
        title: c.title,
        description: c.desc,
        priority: c.priority,
        position: ++i * 1024,
        dueAt: c.due,
        completedAt: c.col === done.id ? inDays(-1) : null,
        createdById: users[0].id,
        assignees: { create: c.assignees.map((userId) => ({ userId })) },
        labels: { create: c.labels.filter(Boolean).map((labelId) => ({ labelId: labelId as string })) },
        items: {
          create: c.items.map((it, idx) => ({
            text: it.text,
            done: it.done,
            position: (idx + 1) * 1024,
            assigneeId: it.assignee,
          })),
        },
        comments: {
          create: (c.comments ?? []).map((cm) => ({ authorId: cm.author, body: cm.body })),
        },
      },
    })
    await prisma.activity.createMany({
      data: [
        {
          boardId: board.id,
          cardId: card.id,
          actorId: users[0].id,
          type: "card.created",
          meta: JSON.stringify({ title: c.title }),
          createdAt: new Date(Date.now() - (cards.length - i) * 5400000),
        },
      ],
    })
  }

  console.log(`
Listo. Tablero de demostración creado.

  http://localhost:3000/t/demo

Entra con cualquiera de estos correos (sin contraseña):
${PEOPLE.map((p) => `  · ${p.email}  (${p.role})`).join("\n")}
`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
