"use client"

import { localApi } from "./local"
import { supabaseApi } from "./supabase"
import type { Api } from "./types"

export const BACKEND: "local" | "supabase" =
  process.env.NEXT_PUBLIC_BACKEND === "supabase" ? "supabase" : "local"

let instance: Api | null = null

/** Un solo objeto de datos para toda la app. */
export function getApi(): Api {
  if (!instance) instance = BACKEND === "supabase" ? supabaseApi : localApi
  return instance
}
