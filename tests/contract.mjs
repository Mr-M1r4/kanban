/**
 * Corre la prueba de contrato (tests/contract.ts) contra un backend.
 *
 *   node tests/contract.mjs local
 *   node tests/contract.mjs supabase
 *
 * Se ejecuta en Node con un window simulado porque el modo local solo necesita
 * localStorage y crypto, y el de Supabase solo necesita fetch. Para el modo
 * supabase lee las variables de .env.local.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { webcrypto } from "node:crypto"
import { fileURLToPath, pathToFileURL } from "node:url"

const mode = process.argv[2] || "local"
const entry = process.argv[3] || "tests/contract.ts"
if (!["local", "supabase"].includes(mode)) {
  console.error("uso: node tests/contract.mjs [local|supabase]")
  process.exit(2)
}

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const env = { ...process.env, NEXT_PUBLIC_BACKEND: mode, NEXT_PUBLIC_BASE_PATH: "" }

if (mode === "supabase") {
  const file = join(root, ".env.local")
  if (!existsSync(file)) {
    console.error("Falta .env.local con NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY")
    process.exit(2)
  }
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "")
  }
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error(".env.local no define la URL y la clave de Supabase")
    process.exit(2)
  }
}

/* --- lo que el navegador le daria al backend ------------------------- */
const store = new Map()
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
}
// En Node 18 el global crypto no existe dentro de un modulo ESM.
if (!globalThis.crypto) globalThis.crypto = webcrypto
globalThis.localStorage = localStorage
// supabase-js busca un WebSocket nativo y Node 18 no lo trae.
if (!globalThis.WebSocket) {
  const { WebSocket } = await import("ws")
  globalThis.WebSocket = WebSocket
}
globalThis.window = {
  localStorage,
  location: { origin: "https://prueba.local", href: "https://prueba.local/" },
  addEventListener() {},
  removeEventListener() {},
  document: { visibilityState: "visible" },
}

/* --- compila el TypeScript y lo importa ------------------------------- */
const dir = mkdtempSync(join(tmpdir(), "kanban-contract-"))
const bundle = join(dir, "contract.mjs")

try {
  const defines = Object.entries(env)
    .filter(([k]) => k.startsWith("NEXT_PUBLIC_"))
    .flatMap(([k, v]) => [`--define:process.env.${k}=${JSON.stringify(v)}`])

  execFileSync(
    join(root, "node_modules/.bin/esbuild"),
    [
      join(root, entry),
      "--bundle",
      "--format=esm",
      "--platform=neutral",
      "--main-fields=module,main",
      `--outfile=${bundle}`,
      "--log-level=error",
      ...defines,
    ],
    { cwd: root, stdio: ["ignore", "inherit", "inherit"] },
  )

  await import(pathToFileURL(bundle).href)
  process.exit(globalThis.__fail ?? 0)
} catch (err) {
  console.error("la prueba revienta:", err instanceof Error ? err.message : err)
  process.exit(1)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
