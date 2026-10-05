// The single data-access seam. Feature code imports from "@/lib/api" only; swap the adapter here
// (Supabase today, a real API later) and nothing else changes.
import type { SportsProvider, SyncBackend } from "./ports"
import { supabaseBackend } from "./supabase"
import { espn } from "../sports/espn"

export const syncBackend: SyncBackend = supabaseBackend
/** Sports data sources, tried in order (ESPN today). */
export const SPORTS_PROVIDERS: SportsProvider[] = [espn]

// Config helpers delegated to the active backend, so callers never reach for a specific one.
export const loadConfig = () => syncBackend.loadConfig()
export const envConfigured = syncBackend.envConfigured
export const badKey = (key: string) => syncBackend.badKey(key)
export const normUrl = (url: string) => syncBackend.normUrl(url)
export const parseAuthHash = (hash: string) => syncBackend.parseAuthHash(hash)
export const redirectTo = () => syncBackend.redirectTo()

export { ApiError } from "../sync/client"
export * from "./ports"
export type { PlaybackPresence, SyncConfig as Config, SyncSession as Session } from "./ports"
