import { t } from "../i18n"
// Plain-fetch GoTrue + PostgREST client (no SDK). Only the public anon key is ever used.
export type Config = { url: string; anonKey: string }
export type Session = { access: string; refresh: string; exp: number; id: string; email: string } // exp = unix seconds

const CFG_KEY = "leen-sb-config"
const ENV: Config = { url: import.meta.env.VITE_SUPABASE_URL ?? "", anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "" }

/** null when the key is fine; otherwise why it was refused. Never accept a service-role / secret key in a client. */
export function badKey(k: string): string | null {
  if (/^sb_secret_/.test(k)) return t("sync.err.secretKey")
  try {
    const p = JSON.parse(atob(k.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
    if (p.role === "service_role") return t("sync.err.serviceRole")
  } catch { /* not a JWT: let the server decide */ }
  return null
}

export const normUrl = (u: string) => u.trim().replace(/\/+$/, "").replace(/\/(rest|auth)\/v1$/, "")

/** The sync server comes ONLY from the build environment (.env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) - one server for the whole app,
 *  never entered per user. Leftover per-device config from earlier builds is removed. */
export function loadConfig(): Config {
  try { localStorage.removeItem(CFG_KEY) } catch { /* ignore */ }
  return ENV.url && ENV.anonKey && !badKey(ENV.anonKey) ? { url: normUrl(ENV.url), anonKey: ENV.anonKey.trim() } : { url: "", anonKey: "" }
}
export const envConfigured = !!(ENV.url && ENV.anonKey)

type J = Record<string, unknown>
export class ApiError extends Error {
  status: number
  constructor(status: number, msg: string) { super(msg); this.status = status }
}

async function req(cfg: Config, path: string, o: { method?: string; body?: unknown; token?: string; headers?: Record<string, string>; onResponse?: (r: Response) => void } = {}): Promise<unknown> {
  // New-style keys (sb_publishable_...) are not JWTs: they go in the apikey header only. A user's access token (a JWT) always goes in Authorization;
  // the classic anon key (a JWT) is also sent there for signed-out calls, like the official client does.
  const headers: Record<string, string> = { apikey: cfg.anonKey, ...(o.token || !cfg.anonKey.startsWith("sb_") ? { Authorization: `Bearer ${o.token ?? cfg.anonKey}` } : {}), ...o.headers }
  if (o.body !== undefined) headers["Content-Type"] = "application/json"
  const c = new AbortController()
  const timer = setTimeout(() => c.abort(), 30000)
  try {
    const r = await fetch(cfg.url + path, { method: o.method ?? (o.body !== undefined ? "POST" : "GET"), headers, body: o.body === undefined ? undefined : JSON.stringify(o.body), signal: c.signal })
    o.onResponse?.(r)
    const t = await r.text()
    let j: J | null = null
    try { j = t ? JSON.parse(t) : null } catch { /* not json */ }
    if (!r.ok) throw new ApiError(r.status, readable(r.status, j))
    return j
  } finally {
    clearTimeout(timer)
  }
}

function readable(status: number, j: J | null): string {
  const m = String(j?.msg ?? j?.error_description ?? j?.message ?? j?.hint ?? j?.error ?? "")
  const code = String(j?.error_code ?? j?.code ?? "")
  if (/over_email_send_rate_limit|rate limit|^429$/i.test(code + m) || status === 429) return t("sync.err.rateLimit")
  if (/invalid_credentials|Invalid login/i.test(code + m)) return t("sync.err.badLogin")
  if (/otp_expired|expired|invalid/i.test(code + m) && /otp|token|code/i.test(code + m)) return t("sync.err.badCode")
  if (/user_already_exists|already registered/i.test(code + m)) return t("sync.err.exists")
  if (/email_not_confirmed/i.test(code + m)) return t("sync.err.unconfirmed")
  if (/weak_password/i.test(code + m)) return m || t("sync.err.weakPassword")
  if (/signup_disabled|otp_disabled/i.test(code + m)) return t("sync.err.signupDisabled")
  if (status === 404 || /user_data/.test(m) && /not find|does not exist/i.test(m)) return t("sync.err.noTable")
  if (status === 401 || status === 403) return m || t("sync.err.notAllowed")
  return m || t("sync.err.serverStatus", { status })
}

type AuthRes = { access_token?: string; refresh_token?: string; expires_at?: number; expires_in?: number; user?: { id: string; email?: string } }
const toSession = (r: AuthRes | null, email: string): Session | null =>
  r?.access_token && r.refresh_token && r.user
    ? { access: r.access_token, refresh: r.refresh_token, exp: r.expires_at ?? Math.floor(Date.now() / 1000) + (r.expires_in ?? 3600), id: r.user.id, email: r.user.email || email }
    : null

/** where email links come back to: this app (hash router ignores the token fragment and we clear it right away) */
export const redirectTo = () => location.origin + location.pathname

/** #access_token=...&refresh_token=...&type=signup|recovery|magiclink (from an email link) -> parsed, or null */
export function parseAuthHash(hash: string): { type: string; access: string; refresh: string; exp: number } | null {
  const q = new URLSearchParams(hash.replace(/^#\/?/, ""))
  const access = q.get("access_token"), refresh = q.get("refresh_token")
  if (!access || !refresh) return null
  return { type: q.get("type") ?? "magiclink", access, refresh, exp: Number(q.get("expires_at")) || Math.floor(Date.now() / 1000) + Number(q.get("expires_in") || 3600) }
}

export const api = {
  otpSend: (c: Config, email: string) => req(c, "/auth/v1/otp", { body: { email, create_user: true } }),
  otpVerify: async (c: Config, email: string, token: string) =>
    toSession((await req(c, "/auth/v1/verify", { body: { type: "email", email, token: token.trim() } })) as AuthRes, email),
  password: async (c: Config, email: string, password: string) =>
    toSession((await req(c, "/auth/v1/token?grant_type=password", { body: { email, password } })) as AuthRes, email),
  /** null when the project needs email confirmation first */
  signUp: async (c: Config, email: string, password: string) => toSession((await req(c, "/auth/v1/signup", { body: { email, password } })) as AuthRes, email),
  /** password reset email (the link opens this app with #access_token=...&type=recovery) */
  recover: (c: Config, email: string) => req(c, `/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo())}`, { body: { email } }),
  updatePassword: (c: Config, accessToken: string, password: string) => req(c, "/auth/v1/user", { method: "PUT", token: accessToken, body: { password } }),
  user: async (c: Config, accessToken: string) => (await req(c, "/auth/v1/user", { token: accessToken })) as { id: string; email?: string },
  refresh: async (c: Config, s: Session) => toSession((await req(c, "/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: s.refresh } })) as AuthRes, s.email),
  /** call a Postgres function (see the schema file); token = a signed-in user's access token for authenticated-only functions */
  rpc: (c: Config, name: string, body: unknown, token?: string) => req(c, `/rest/v1/rpc/${name}`, { body, token }),
  logout: (c: Config, s: Session) => req(c, "/auth/v1/logout", { method: "POST", body: {}, token: s.access }),

  async pull(c: Config, s: Session): Promise<{ row: { data: string; updated_at: string } | null; serverTime?: number }> {
    let serverTime: number | undefined
    const r = (await req(c, `/rest/v1/user_data?select=data,updated_at&user_id=eq.${s.id}`, { token: s.access, onResponse: (x) => { serverTime = Date.parse(x.headers.get("date") ?? "") || undefined } })) as { data: string; updated_at: string }[]
    return { row: r[0] ?? null, serverTime }
  },
  /** true = written; false = someone else wrote first (re-pull and retry) */
  async push(c: Config, s: Session, data: string, base: string | null, at: string): Promise<boolean> {
    const h = { Prefer: "return=representation" }
    if (base) {
      const r = (await req(c, `/rest/v1/user_data?user_id=eq.${s.id}&updated_at=eq.${encodeURIComponent(base)}`, { method: "PATCH", token: s.access, headers: h, body: { data, updated_at: at, version: 1 } })) as unknown[]
      return r.length > 0
    }
    // ponytail: ignore-duplicates (not merge) so a racing first write is never overwritten blindly
    const r = (await req(c, "/rest/v1/user_data?on_conflict=user_id", { token: s.access, headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: { user_id: s.id, data, updated_at: at, version: 1 } })) as unknown[]
    return r.length > 0
  },
  /** shared metadata cache: one row by key (RLS: any signed-in user may read); null = not cached */
  async metaGet(c: Config, s: Session, key: string): Promise<{ data: unknown; fetched_at: string } | null> {
    const r = (await req(c, `/rest/v1/meta_cache?select=data,fetched_at&key=eq.${encodeURIComponent(key)}`, { token: s.access })) as { data: unknown; fetched_at: string }[]
    return r[0] ?? null
  },
  /** how many rows the shared cache holds, and how many of them are title -> id lookups (PostgREST exact count, RLS applies) */
  async metaCount(c: Config, s: Session): Promise<{ total: number; ids: number }> {
    const n = async (filter: string) => {
      let range = ""
      await req(c, `/rest/v1/meta_cache?select=key&limit=1${filter}`, { token: s.access, headers: { Prefer: "count=exact" }, onResponse: (r) => { range = r.headers.get("content-range") ?? "" } })
      return Number(range.split("/")[1]) || 0
    }
    const [total, ids] = await Promise.all([n(""), n(`&key=like.${encodeURIComponent("*/resolve/*")}`)])
    return { total, ids }
  },
  /** writes only through meta_put(): the server validates, stamps the time and never replaces a row younger than 7 days */
  metaPut: (c: Config, s: Session, key: string, data: unknown) => req(c, "/rest/v1/rpc/meta_put", { token: s.access, body: { p_key: key, p_data: data } }),
  presencePut: (c: Config, s: Session, presence: import("@/lib/api/ports").PlaybackPresence) => req(c, "/rest/v1/playback_presence?on_conflict=user_id,device_id", { method: "POST", token: s.access, headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: { user_id: s.id, ...presence } }),
  async presenceGet(c: Config, s: Session) {
    return (await req(c, `/rest/v1/playback_presence?select=device_id,device_name,profile_name,item_id,item_name,item_kind,status,position,duration,updated_at&user_id=eq.${s.id}&status=neq.stopped&order=updated_at.desc`, { token: s.access })) as import("@/lib/api/ports").PlaybackPresence[]
  },
  presenceRemove: (c: Config, s: Session, deviceId: string, itemId: string) => req(c, `/rest/v1/playback_presence?user_id=eq.${s.id}&device_id=eq.${encodeURIComponent(deviceId)}&item_id=eq.${encodeURIComponent(itemId)}`, { method: "DELETE", token: s.access }),
  presencePrune: (c: Config, s: Session, before: string) => req(c, `/rest/v1/playback_presence?user_id=eq.${s.id}&updated_at=lt.${encodeURIComponent(before)}`, { method: "DELETE", token: s.access }),
  del: (c: Config, s: Session) => req(c, `/rest/v1/user_data?user_id=eq.${s.id}`, { method: "DELETE", token: s.access }),
}
