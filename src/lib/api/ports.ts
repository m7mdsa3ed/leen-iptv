// The data-access layer. Feature code talks to the outside world ONLY through these ports; the adapter
// behind each one (Supabase today, a real API later) is chosen in api/index.ts, never imported directly.

/** A sync/auth backend config: `url` is the API endpoint, `anonKey` the public key it expects. Adapters interpret both. */
export type SyncConfig = { url: string; anonKey: string }
/** A signed-in session (GoTrue shape; another adapter maps its own onto it). */
export type SyncSession = { access: string; refresh: string; exp: number; id: string; email: string }

/** The persistence + auth backend. Everything src/lib/sync does goes through this port. */
export interface SyncBackend {
  id: string
  loadConfig(): SyncConfig
  readonly envConfigured: boolean
  badKey(key: string): string | null
  normUrl(url: string): string
  redirectTo(): string
  parseAuthHash(hash: string): { type: string; access: string; refresh: string; exp: number } | null
  otpSend(c: SyncConfig, email: string): Promise<unknown>
  otpVerify(c: SyncConfig, email: string, token: string): Promise<SyncSession | null>
  password(c: SyncConfig, email: string, password: string): Promise<SyncSession | null>
  signUp(c: SyncConfig, email: string, password: string): Promise<SyncSession | null>
  recover(c: SyncConfig, email: string): Promise<unknown>
  updatePassword(c: SyncConfig, accessToken: string, password: string): Promise<unknown>
  user(c: SyncConfig, accessToken: string): Promise<{ id: string; email?: string }>
  refresh(c: SyncConfig, s: SyncSession): Promise<SyncSession | null>
  rpc(c: SyncConfig, name: string, body: unknown, token?: string): Promise<unknown>
  logout(c: SyncConfig, s: SyncSession): Promise<unknown>
  pull(c: SyncConfig, s: SyncSession): Promise<{ data: string; updated_at: string } | null>
  push(c: SyncConfig, s: SyncSession, data: string, base: string | null, at: string): Promise<boolean>
  del(c: SyncConfig, s: SyncSession): Promise<unknown>
  /** shared metadata cache (server table meta_cache) */
  metaGet(c: SyncConfig, s: SyncSession, key: string): Promise<{ data: unknown; fetched_at: string } | null>
  metaCount(c: SyncConfig, s: SyncSession): Promise<{ total: number; ids: number }>
  metaPut(c: SyncConfig, s: SyncSession, key: string, data: unknown): Promise<unknown>
}

// Sports ports live with the sports mappers (kept alias-free so the pure module stays node-runnable).
export type { Follow, GameStatus, LeagueRef, SportsCompetition, SportsConfig, SportsGame, SportsProvider, SportsTeam } from "../sports/types"
