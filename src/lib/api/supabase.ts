// Supabase (GoTrue + PostgREST) adapter for the SyncBackend port. The only file that knows Supabase exists.
import { api, badKey, envConfigured, loadConfig, normUrl, parseAuthHash, redirectTo } from "../sync/client"
import type { SyncBackend } from "./ports"

export const supabaseBackend: SyncBackend = {
  id: "supabase",
  loadConfig, envConfigured, badKey, normUrl, redirectTo, parseAuthHash,
  ...api,
}
