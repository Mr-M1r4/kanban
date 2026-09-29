# Kanban

Tablero tipo Trello para equipos pequeños. Es una app **estática de Next.js**: no hay
servidor, así que se publica gratis en GitHub Pages, Vercel o Netlify.

- **Modo local** (por defecto): todo se guarda en el `localStorage` del navegador.
  Funciona al instante, sin cuentas ni base de datos. Ideal para usarlo solo o para
  probar la app. Ojo: los datos no se comparten entre dispositivos ni navegadores.
- **Modo equipo**: con Supabase como backend, el tablero se comparte en tiempo real
  entre personas, con permisos de administrador, invitaciones por correo y RLS.

En ambos modos: arrastrar y soltar, checklist, comentarios, etiquetas, prioridades,
fechas, responsables, búsqueda, filtros, actividad y diseño responsive.

## Ver la app publicada

<https://mr-m1r4.github.io/kanban/>

## Modo local

```bash
npm install
npm run dev          # desarrollo en http://localhost:3000
npm run build        # genera la carpeta out/
npm run preview      # sirve out/ en http://localhost:4000
```

La primera vez pide nombre de tablero, tu nombre y tu correo. Después ya entras
con el correo.

## Modo equipo (Supabase)

1. Crea un proyecto en <https://supabase.com>.
2. Abre **SQL Editor** y ejecuta `supabase/schema.sql` (crea tablas, índices y RLS).
3. En **Authentication → Sign In / Providers**, desactiva *Confirm email*: el equipo
   entra con su correo y el PIN compartido.
4. En **Project Settings → API** copia la URL y la clave `anon`.
5. Configura las variables (copia `.env.example` a `.env.local`):

```bash
NEXT_PUBLIC_BACKEND=supabase
NEXT_PUBLIC_BASE_PATH=
NEXT_PUBLIC_SUPABASE_URL=https://tuproyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

6. `npm run dev`.

La clave `anon` va incrustada en el bundle: eso es seguro porque todas las reglas de
acceso están en el RLS de `supabase/schema.sql`. **Nunca** pongas aquí la clave
`service_role`.

## Variables de entorno

| Variable | Para qué sirve |
| --- | --- |
| `NEXT_PUBLIC_BACKEND` | `local` o `supabase`. |
| `NEXT_PUBLIC_BASE_PATH` | Carpura de publicación. `/kanban` en GitHub Pages, vacío en la raíz de un dominio. |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto (solo modo equipo). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anon (solo modo equipo). |

## Publicar en GitHub Pages

El repositorio ya trae `.github/workflows/pages.yml`: cada `push` a `master`
compila y publica en `https://mr-m1r4.github.io/kanban/`.

Para cambiar el backend en la versión publicada, añade en **Settings → Secrets and
variables → Actions** las variables `NEXT_PUBLIC_BACKEND`,
`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (y deja
`NEXT_PUBLIC_BASE_PATH` en `/kanban`), y vuelve a lanzar el workflow.

En Settings → Pages, la fuente debe ser **GitHub Actions**.

## Estructura

```
app/                  rutas: / (mis tableros), /entrar, /t?b=slug, /invitar?token=...
components/           UI (tablero, tarjetas, paneles)
lib/api/              contratos y backends intercambiables
  types.ts            forma de los registros y del snapshot
  state.ts            snapshot -> estado que ve la interfaz
  local.ts            backend en localStorage
  supabase.ts         backend en Supabase
supabase/schema.sql   tablas, índices y RLS
```

El tablero vive en `/t?b=<slug>` y las invitaciones en `/invitar?token=<token>`
porque una exportación estática no admite rutas dinámicas: todas las páginas se
generan por adelantado.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` | Exporta el sitio a `out/`. |
| `npm run preview` | Sirve `out/` en el puerto 4000. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint. |
| `npm run check` | Los tres anteriores. |
