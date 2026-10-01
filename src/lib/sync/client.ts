// Plain-fetch GoTrue + PostgREST client (no SDK). Only the public anon key is ever used.
export type Config = { url: string; anonKey: string }
export type Session = { access: string; refresh: string; exp: number; id: string; email: string } // exp = unix seconds

const CFG_KEY = "leen-sb-config"
const ENV: Config = { url: import.meta.env.VITE_SUPABASE_URL ?? "", anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "" }

/** null when the key is fine; otherwise why it was refused. Never accept a service-role / secret key in a client. */
export function badKey(k: string): string | null {
  if (/^sb_secret_/.test(k)) return "That is a secret key. Never put it in an app. Use the anon (public) key."
  try {
    const p = JSON.parse(atob(k.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
    if (p.role === "service_role") return "That is a service_role key (full database access). Never put it in an app. Use the anon (public) key."
  } catch { /* not a JWT: let the server decide */ }
  return null
}

export const normUrl = (u: string) => u.trim().replace(/\/+$/, "").replace(/\/(rest|auth)\/v1$/, "")

/** The Supabase project comes ONLY from the build environment (.env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) - one project for the whole app,
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

async function req(cfg: Config, path: string, o: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {}): Promise<unknown> {
  const headers: Record<string, string> = { apikey: cfg.anonKey, Authorization: `Bearer ${o.token ?? cfg.anonKey}`, ...o.headers }
  if (o.body !== undefined) headers["Content-Type"] = "application/json"
  const c = new AbortController()
  const timer = setTimeout(() => c.abort(), 30000)
  try {
    const r = await fetch(cfg.url + path, { method: o.method ?? (o.body !== undefined ? "POST" : "GET"), headers, body: o.body === undefined ? undefined : JSON.stringify(o.body), signal: c.signal })
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
  if (/over_email_send_rate_limit|rate limit|^429$/i.test(code + m) || status === 429) return "Too many attempts. Wait a minute and try again."
  if (/invalid_credentials|Invalid login/i.test(code + m)) return "Wrong email or password."
  if (/otp_expired|expired|invalid/i.test(code + m) && /otp|token|code/i.test(code + m)) return "That code is wrong or has expired. Request a new one."
  if (/user_already_exists|already registered/i.test(code + m)) return "That email already has an account. Sign in instead."
  if (/email_not_confirmed/i.test(code + m)) return "Confirm your email first (check your inbox), then sign in."
  if (/weak_password/i.test(code + m)) return m || "Password is too weak."
  if (/signup_disabled|otp_disabled/i.test(code + m)) return "Sign-ups are disabled in this Supabase project."
  if (status === 404 || /user_data/.test(m) && /not find|does not exist/i.test(m)) return "The user_data table is missing. Run supabase/schema.sql in the Supabase SQL editor."
  if (status === 401 || status === 403) return m || "Not allowed. Check the anon key or sign in again."
  return m || `The sync server answered ${status}.`
}

type AuthRes = { access_token?: string; refresh_token?: string; expires_at?: number; expires_in?: number; user?: { id: string; email?: string } }
const toSession = (r: AuthRes | null, email: string): Session | null =>
  r?.access_token && r.refresh_token && r.user
    ? { access: r.access_token, refresh: r.refresh_token, exp: r.expires_at ?? Math.floor(Date.now() / 1000) + (r.expires_in ?? 3600), id: r.user.id, email: r.user.email || email }
    : null

export const api = {
  otpSend: (c: Config, email: string) => req(c, "/auth/v1/otp", { body: { email, create_user: true } }),
  otpVerify: async (c: Config, email: string, token: string) =>
    toSession((await req(c, "/auth/v1/verify", { body: { type: "email", email, token: token.trim() } })) as AuthRes, email),
  password: async (c: Config, email: string, password: string) =>
    toSession((await req(c, "/auth/v1/token?grant_type=password", { body: { email, password } })) as AuthRes, email),
  /** null when the project needs email confirmation first */
  signUp: async (c: Config, email: string, password: string) => toSession((await req(c, "/auth/v1/signup", { body: { email, password } })) as AuthRes, email),
  refresh: async (c: Config, s: Session) => toSession((await req(c, "/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: s.refresh } })) as AuthRes, s.email),
  logout: (c: Config, s: Session) => req(c, "/auth/v1/logout", { method: "POST", body: {}, token: s.access }),

  async pull(c: Config, s: Session): Promise<{ data: string; updated_at: string } | null> {
    const r = (await req(c, `/rest/v1/user_data?select=data,updated_at&user_id=eq.${s.id}`, { token: s.access })) as { data: string; updated_at: string }[]
    return r[0] ?? null
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
  del: (c: Config, s: Session) => req(c, `/rest/v1/user_data?user_id=eq.${s.id}`, { method: "DELETE", token: s.access }),
}
