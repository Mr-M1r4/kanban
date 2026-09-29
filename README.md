# Kanban

Tablero de tareas para equipo, estilo Trello pero más simple: **Programadas → En ejecución → Terminadas**,
sin contraseñas. Agregas a la gente por correo, les mandas un enlace y ya pueden trabajar.

- Crear, mover y completar tareas arrastrando
- Asignar varios responsables por tarea
- Checklist de pasos a seguir, comentarios, etiquetas, prioridad y fecha límite
- Filtros (por persona, prioridad, etiqueta), búsqueda y "solo mis tareas"
- Límite de tareas por columna (WIP) y barra de avance
- Registro de actividad: quién hizo qué
- Funciona bien en el celular

---

## 1. Arrancar en local (2 minutos)

```bash
cp .env.example .env
docker compose up -d db        # base de datos
npm install
npm run setup                  # crea las tablas y un tablero de ejemplo
npm run dev
```

Abre <http://localhost:3000/t/demo> y entra con cualquiera de estos correos (sin contraseña):

| Correo             | Rol     |
| ------------------ | ------- |
| `ana@demo.local`   | admin   |
| `bruno@demo.local` | miembro |
| `carla@demo.local` | miembro |

Para empezar de cero (sin datos de ejemplo): `npm run db:push` y abre la app; la primera
persona que entre crea el tablero.

---

## 2. Ponerlo en línea

La forma más rápida es un servidor con Docker (VPS, Hetzner, DigitalOcean, tu máquina) + un
dominio apuntando por DNS.

### 2.1 En el servidor

```bash
git clone <tu-repo> kanban && cd kanban

# .env con tus valores
cp .env.example .env
```

```env
DATABASE_URL="postgresql://kanban:clave-segura@db:5432/kanban?schema=public"
APP_URL="https://kanban.tudominio.com"   # sin barra final; se usa en los enlaces de invitación
BOARD_PIN=""                             # opcional: PIN de 4-8 dígitos que se pide al entrar
```

En `docker-compose.yml` pon la contraseña real de Postgres en `services.db.environment.POSTGRES_PASSWORD`
y en `DATABASE_URL`, y levanta:

```bash
docker compose up -d --build
docker compose exec web npx prisma db push   # solo la primera vez
```

### 2.2 HTTPS con Caddy (automático)

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
# ...agrega el repo de caddy y:
sudo apt install caddy
```

`/etc/caddy/Caddyfile`:

```
kanban.tudominio.com {
    reverse_proxy localhost:3000
}
```

Listo: Caddy pide el certificado y renueva solo. Si ya usas nginx o Apache, sirve el mismo
`localhost:3000` desde ahí en lugar de usar Caddy.

### 2.3 Después de subir cambios

```bash
git pull && docker compose up -d --build
```

### Otras plataformas

El `Dockerfile` es estándar, así que también funciona en **Railway**, **Render**, **Fly.io** o
**Coolify**: crea el servicio con la imagen del repo, variables `DATABASE_URL` y `APP_URL`, y comando
`npx prisma db push && npm start`.

---

## 3. Cómo se usa

**Entrar.** Cada persona escribe su correo. No hay contraseñas. Si quieres una barrera extra, define
`BOARD_PIN` en el `.env` y todos tendrán que escribirlo.

**Agregar gente.** Botón *Personas* → escribe el correo → el tablero genera un enlace de
invitación; se lo mandas por WhatsApp/correo y la persona entra con un clic (el enlace es de un solo
uso). También puedes copiar el enlace del tablero para los que ya son miembros.

**Administrar vs. trabajar.** Cualquier miembro crea, mueve y completa tareas. Los administradores
además agregan gente, editan columnas (nombre, orden, a cuál de las tres cuenta, límite WIP) y
gestionan etiquetas.

**Las tres columnas.** *Programadas* = lo que está en la cola, *En ejecución* = lo que alguien está
haciendo, *Terminadas* = lo cerrado. La columna "Terminadas" es la que mueve la barra de avance, y
puedes mover cualquier columna para que cuente como terminada.

**Atajos.** `/` busca, `Esc` cierra, `Ctrl+Enter` manda un comentario.

El tablero se actualiza solo cada 7 segundos, así que varias personas pueden trabajar a la vez sobre
el mismo tablero.

---

## 4. Variables de entorno

| Variable       | Obligatoria | Para qué                                                        |
| -------------- | ----------- | --------------------------------------------------------------- |
| `DATABASE_URL` | sí          | Conexión a Postgres                                               |
| `APP_URL`      | sí          | URL pública; se usa para armar los enlaces de invitación          |
| `BOARD_PIN`    | no          | Si tiene valor, se pide al entrar además del correo               |

---

## 5. Comandos

```bash
npm run dev        # desarrollo (http://localhost:3000)
npm run build      # build de producción
npm start          # arranque en producción
npm run typecheck  # revisar tipos
npm run lint       # revisar estilo
npm run db:push    # aplicar el schema a la base
npm run db:seed    # tablero de ejemplo
npm run db:studio  # explorador de la base de datos
```

---

## 6. Estructura

```
app/
  entrar/            login (correo) y creación del primer tablero
  invitacion/[token] aceptación de la invitación
  t/[slug]/          el tablero
  actions/           acciones del servidor (auth, tablero, tarjetas)
components/
  board/             tablero, columnas, tarjeta, paneles y ajustes
lib/                 base de datos, sesión, utilidades
prisma/              schema y datos de ejemplo
```

La sesión es una cookie `httpOnly` de 60 días; las acciones validan la pertenencia al tablero en
cada operación.

---

## 7. Seguridad

El acceso es por correo sin contraseña: quien conozca el correo de alguien puede entrar como esa
persona. Para un equipo pequeño que se conoce está bien; si necesitas más:

1. Define `BOARD_PIN` (barrera simple, suficiente para redes internas).
2. Deja el tablero privado y no publiques el enlace.
3. Si prefieres contraseña real, el punto de entrada es `app/actions/auth.ts`: ahí se crea la
   sesión, así que alcanza con agregar un campo de contraseña y su verificación.
