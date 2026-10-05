// Cloud sync: GoTrue + PostgREST over fetch, merged with src/lib/sync/merge.ts, optionally AES-GCM encrypted.
import { create } from "zustand"
import { get as idbGet, set as idbSet } from "idb-keyval"
import { useApp } from "../store"
import { useHistory, flushHistory } from "../history"
import { explain } from "../net"
import { t } from "../i18n"
import { useNotify } from "../notify"
import { ApiError, badKey, envConfigured, loadConfig, parseAuthHash, syncBackend as api, type Config, type PlaybackPresence, type Session } from "@/lib/api"
import type { Item } from "../types"
import { isTv } from "../device"
import { canEncrypt, deriveKey, exportKey, importKey, newSalt, needsHttps, open, parseBlob, seal, WrongPassphrase, type Key } from "./crypto"
import { applySnapshot, buildSnapshot, clockSkewMin, dupSources, flatten, merge, mergeSummary, stable, stamp, type AppSlice, type Day, type Snapshot } from "./merge"
import { useSyncMeta } from "./meta"

export type SyncStatus = { state: "off" | "signed-out" | "idle" | "syncing" | "error"; lastSyncAt: number; error?: string; needPass?: boolean }
export type { Config, Session }

const SESS = "leen-sb-session", KEYS = "leen-sb-key"
const DEBOUNCE = 5000, MIN_AUTO = 60000 // progress ticks every 10s: batch change-triggered syncs to one per minute

const useS = create<{ cfg: Config; session: Session | null; status: SyncStatus; hasPass: boolean; recovery: string | null }>(() => ({
  cfg: { url: "", anonKey: "" }, session: null, recovery: null, status: { state: "off", lastSyncAt: 0 }, hasPass: false,
}))

let key: Key | null = null
let running: Promise<void> | null = null
let again = false
let fails = 0
let blockedUntil = 0
let tStamp = 0, tSync = 0, applying = false
const PRESENCE_ID = "leen-device-id"
const TAB_ID = Math.random().toString(36).slice(2, 8)
function presenceId() {
  try {
    let id = sessionStorage.getItem(PRESENCE_ID)
    if (!id) { id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; sessionStorage.setItem(PRESENCE_ID, id) }
    return `${id}-${TAB_ID}`
  } catch { return `${Date.now().toString(36)}-${TAB_ID}` }
}
function presenceDeviceName() {
  return `${isTv ? "TV" : matchMedia("(pointer: coarse)").matches ? "Mobile" : "Desktop"}${window.name ? ` (${window.name.slice(0, 20)})` : ""}`
}
let presencePoller = 0
let presencePrunedAt = 0
const presenceStore = create<{ devices: PlaybackPresence[]; error: string | null }>(() => ({ devices: [], error: null }))
let presenceWrite: Promise<void> = Promise.resolve()
let activePresence: { item: Item; profileName: string; status: "playing" | "paused" } | null = null

export function publishPlaybackPresence(item: Item, status: PlaybackPresence["status"] | "stopped", profileName: string, position: number, duration: number): Promise<void> {
  const { cfg, session } = useS.getState()
  if (!cfgOk(cfg) || !session) return Promise.resolve()
  const deviceId = presenceId()
  if (status === "stopped") {
    activePresence = null
    presenceWrite = presenceWrite.then(async () => {
      try {
        const auth = await sharedAuth()
        if (auth) await api.presenceRemove(auth.cfg, auth.session, deviceId, item.id)
        presenceStore.setState({ error: null })
      } catch (e) { presenceStore.setState({ error: explain(e) }) }
    })
    return presenceWrite
  }
  const presence: PlaybackPresence = {
    device_id: deviceId, device_name: presenceDeviceName(),
    profile_name: profileName, item_id: item.id, item_name: item.name,
    item_kind: item.kind === "series" ? "episode" : item.kind, status,
    position: Number.isFinite(position) ? Math.max(0, position) : 0,
    duration: Number.isFinite(duration) ? Math.max(0, duration) : 0,
    updated_at: new Date().toISOString(),
  }
  activePresence = { item, profileName, status }
  presenceWrite = presenceWrite.then(async () => {
    try {
      const auth = await sharedAuth()
      if (auth) await api.presencePut(auth.cfg, auth.session, presence)
      presenceStore.setState({ error: null })
    } catch (e) { presenceStore.setState({ error: explain(e) }) }
  })
  return presenceWrite
}

async function pollPresence() {
  const { cfg, session } = useS.getState()
  if (!cfgOk(cfg) || !session || document.hidden) return
  try {
    const auth = await sharedAuth()
    if (!auth) return
    if (Date.now() - presencePrunedAt > 60_000) {
      const cutoff = new Date(Date.now() - 60_000).toISOString()
      await api.presencePrune(auth.cfg, auth.session, cutoff)
      presencePrunedAt = Date.now()
    }
    const devices = await api.presenceGet(auth.cfg, auth.session)
    presenceStore.setState({ devices, error: null })
  } catch (e) { presenceStore.setState({ error: explain(e) }) }
}

export function usePlaybackPresence() {
  return presenceStore()
}

function startPresencePolling() {
  if (presencePoller) return
  void pollPresence()
  presencePoller = window.setInterval(() => void pollPresence(), 15000)
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void pollPresence() })
}

if (typeof window !== "undefined") {
  window.setInterval(() => {
    if (activePresence) {
      const { item, profileName, status } = activePresence
      const v = document.querySelector("video")
      const { cfg, session } = useS.getState()
      if (!cfgOk(cfg) || !session) return
      const presence: PlaybackPresence = {
        device_id: presenceId(), device_name: presenceDeviceName(),
        profile_name: profileName, item_id: item.id, item_name: item.name,
        item_kind: item.kind === "series" ? "episode" : item.kind, status,
        position: v?.currentTime ?? 0, duration: Number.isFinite(v?.duration) ? v!.duration : 0, updated_at: new Date().toISOString(),
      }
      presenceWrite = presenceWrite.then(async () => {
        try {
          const auth = await sharedAuth()
          if (auth) await api.presencePut(auth.cfg, auth.session, presence)
        } catch (e) { presenceStore.setState({ error: explain(e) }) }
      })
    }
  }, 20000)
}

const cfgOk = (c: Config) => !!(c.url && c.anonKey)
const lastAt = () => useSyncMeta.getState().lastSyncAt
function setStatus(p: Partial<SyncStatus> & { state: SyncStatus["state"] }) {
  useS.setState({ status: { lastSyncAt: lastAt(), ...p } })
}
function idle() {
  const { cfg, session } = useS.getState()
  setStatus({ state: !cfgOk(cfg) ? "off" : !session ? "signed-out" : "idle" })
}
function dropAccount() {
  key = null; try { localStorage.removeItem(KEYS) } catch { /* ignore */ }
  useS.setState({ hasPass: false })
  useSyncMeta.setState({ e: {}, init: false, lastSyncAt: 0 })
}
function setSession(s: Session | null) {
  try { s ? localStorage.setItem(SESS, JSON.stringify(s)) : localStorage.removeItem(SESS) } catch { /* private mode */ }
  useS.setState({ session: s })
  const uid = useSyncMeta.getState().uid
  if (s && uid !== s.id) {
    if (uid) dropAccount() // different account on this device: never carry the old passphrase or stamps over
    useSyncMeta.setState({ uid: s.id, lastSyncAt: 0 })
  }
  idle()
}
const slice = (): AppSlice => { const s = useApp.getState(); return { profiles: s.profiles, sources: s.sources, data: s.data, settings: s.settings } }

function stampNow() {
  const m = useSyncMeta.getState()
  const e = stamp(m.e, flatten(slice()), m.init ? Date.now() : 0) // first run: existing data gets t=0 so cloud edits win over untouched local copies
  if (e !== m.e || !m.init) useSyncMeta.setState({ e, init: true })
}

async function readDays(): Promise<Record<string, Day>> {
  flushHistory()
  const o: Record<string, Day> = {}
  for (const p of useApp.getState().profiles) {
    const d = (await idbGet<{ days: Record<string, Day> }>(`hist:${p.id}`))?.days ?? {}
    for (const k in d) o[`${p.id}/${k}`] = d[k]
  }
  return o
}
async function writeDays(days: Record<string, Day>) {
  const by: Record<string, Record<string, Day>> = {}
  for (const k in days) { const i = k.indexOf("/"); (by[k.slice(0, i)] ??= {})[k.slice(i + 1)] = days[k] }
  for (const pid in by) {
    const cur = await idbGet<{ sessions: unknown[]; days: Record<string, Day> }>(`hist:${pid}`)
    if (stable(cur?.days ?? {}) === stable(by[pid])) continue
    if (useHistory.getState().profileId === pid) useHistory.setState({ days: by[pid] })
    await idbSet(`hist:${pid}`, { sessions: cur?.sessions ?? [], days: by[pid] })
  }
}

async function fresh(): Promise<Session> {
  const { cfg, session } = useS.getState()
  if (!session) throw new Error(t("sync.err.notSignedIn"))
  if (session.exp - Date.now() / 1000 > 90) return session
  try {
    const n = await api.refresh(cfg, session)
    if (!n) throw new ApiError(401, "")
    setSession(n)
    return n
  } catch (e) {
    if (e instanceof ApiError && [400, 401, 403].includes(e.status)) { setSession(null); throw new Error(t("sync.err.expired")) }
    throw e
  }
}

/** Config + a valid session for the shared metadata cache, or null when sync is off / signed out. Never throws. */
export async function sharedAuth(): Promise<{ cfg: Config; session: Session } | null> {
  const { cfg, session } = useS.getState()
  if (!cfgOk(cfg) || !session) return null
  try { return { cfg, session: await fresh() } } catch { return null }
}

async function cycle() {
  const cfg = useS.getState().cfg
  const s = await fresh()
  for (let i = 0; i < 3; i++) {
    stampNow()
    const days = await readDays()
    const base = slice()
    const local = buildSnapshot(base, useSyncMeta.getState().e, days, Date.now())
    const { row, serverTime } = await api.pull(cfg, s)
    let merged = local, remote: Snapshot | null = null, plain = false
    const skew = serverTime ? clockSkewMin(serverTime, Date.now()) : 0 // Date response header (exposed by Supabase CORS)
    if (skew) throw new Error(t("sync.err.clock", { min: skew }))
    if (row) {
      const blob = parseBlob(row.data)
      plain = !blob.enc
      remote = JSON.parse(await open(blob, key)) as Snapshot
      if (remote.v !== 1) throw new Error(t("sync.err.newerVersion"))
      merged = merge(local, remote)
      const now = slice()
      if (now.profiles !== base.profiles || now.sources !== base.sources || now.data !== base.data || now.settings !== base.settings) continue // edited during the network wait: rebuild and re-pull
      if (stable(merged) !== stable(local)) {
        const a = applySnapshot(slice(), merged)
        const n = mergeSummary(local, merged)
        const first = !lastAt() // a device's first sync reports everything; later ones only when sources or profiles changed (favorites/recents change on every play elsewhere)
        const parts = (["sources", "profiles", "other"] as const).filter((k) => n[k] && (first || k !== "other")).map((k) => t(`sync.merged.${k}`, { n: n[k] }))
        const dupes = n.sources || first ? dupSources(a.slice.sources) : 0
        if (parts.length && (first || n.sources || n.profiles)) useNotify.getState().push({ title: t("sync.merged.title"), body: parts.join(", ") + (dupes ? `. ${t("sync.merged.dupes", { n: dupes })}` : "") })
        applying = true
        try {
          useSyncMeta.setState({ e: a.stamps })
          useApp.setState((st) => {
            const sources = a.slice.sources as typeof st.sources
            return {
              profiles: a.slice.profiles as typeof st.profiles, sources, data: a.slice.data,
              settings: { ...st.settings, ...a.slice.settings } as typeof st.settings,
              profileId: a.slice.profiles.some((p) => p.id === st.profileId) ? st.profileId : null,
              sourceId: sources.some((x) => x.id === st.sourceId) ? st.sourceId : (sources[0]?.id ?? null),
            }
          })
        } finally { applying = false }
        await writeDays(a.days)
      }
    }
    const needPush = !remote || stable(merged) !== stable(remote) || plain === !!key // plain cloud + passphrase set = upgrade to encrypted
    if (!needPush || (await api.push(cfg, s, await seal(JSON.stringify(merged), key), row?.updated_at ?? null, new Date().toISOString()))) return
  }
  throw new Error(t("sync.err.conflict"))
}

function fail(e: unknown) {
  fails++
  blockedUntil = Date.now() + Math.min(300000, 15000 * 2 ** fails)
  setStatus({ state: "error", error: e instanceof TypeError ? t("sync.err.unreachable") : explain(e), needPass: e instanceof WrongPassphrase })
}

/** Manual or automatic; never two at once (a request during a run triggers one more pass). */
export function syncNow(): Promise<void> {
  const { cfg, session } = useS.getState()
  if (!cfgOk(cfg) || !session) return Promise.resolve()
  if (running) { again = true; return running }
  running = (async () => {
    do {
      again = false
      setStatus({ state: "syncing" })
      try {
        try { await cycle() } catch (e) {
          if (!(e instanceof ApiError && e.status === 401)) throw e
          const s = useS.getState().session!
          setSession(await api.refresh(cfg, { ...s, exp: 0 })) // token rejected: force one refresh and retry
          await cycle()
        }
        fails = 0; blockedUntil = 0
        useSyncMeta.setState({ lastSyncAt: Date.now() })
        idle()
      } catch (e) {
        if (useS.getState().session) fail(e); else idle()
        return
      }
    } while (again)
  })().finally(() => { running = null })
  return running
}

function auto() {
  if (!useS.getState().session) return
  if (useS.getState().status.needPass) return // retrying can't succeed until setPassphrase
  const wait = blockedUntil - Date.now()
  if (wait > 0) { clearTimeout(tSync); tSync = window.setTimeout(() => void syncNow(), wait); return }
  void syncNow()
}

/** Email links (confirm sign-up, magic link, password reset) come back as #access_token=...: finish them and clean the URL. */
async function handleAuthRedirect() {
  const h = parseAuthHash(location.hash)
  if (!h) return
  history.replaceState(null, "", location.pathname + location.search + "#/") // never leave tokens in the address bar / history
  const cfg = loadConfig()
  if (!cfg.url) return
  try {
    if (h.type === "recovery") return void useS.setState({ recovery: h.access })
    const u = await api.user(cfg, h.access)
    await signedIn({ access: h.access, refresh: h.refresh, exp: h.exp, id: u.id, email: u.email ?? "" })
  } catch { /* an expired link: the user just signs in normally */ }
}

export function initSync() {
  useS.setState({ cfg: loadConfig() })
  void handleAuthRedirect()
  try { const s = JSON.parse(localStorage.getItem(SESS) || "null") as Session | null; if (s?.access) useS.setState({ session: s }) } catch { /* ignore */ }
  try {
    const k = JSON.parse(localStorage.getItem(KEYS) || "null")
    if (k && canEncrypt()) void importKey(k).then((x) => { key = x; useS.setState({ hasPass: true }) }).catch(() => localStorage.removeItem(KEYS))
  } catch { /* ignore */ }
  idle()
  startPresencePolling()
  stampNow()
  useApp.subscribe((st, prev) => {
    if (st.profiles === prev.profiles && st.sources === prev.sources && st.data === prev.data && st.settings === prev.settings) return
    if (applying) return
    clearTimeout(tStamp); tStamp = window.setTimeout(stampNow, 300)
    clearTimeout(tSync); tSync = window.setTimeout(auto, Math.max(DEBOUNCE, lastAt() + MIN_AUTO - Date.now()))
  })
  document.addEventListener("visibilitychange", () => { if (!document.hidden) auto() })
  window.addEventListener("online", auto)
  window.setTimeout(auto, 1500)
}

// ---- actions ----
const needCfg = () => { const c = useS.getState().cfg; if (!cfgOk(c)) throw new Error(t("sync.err.noConfig")); return c }
const signedIn = async (s: Session | null) => { if (!s) throw new Error(t("sync.err.noSession")); setSession(s); void syncNow(); void pollPresence() }

const actions = {
  async signInOtpSend(email: string) { await api.otpSend(needCfg(), email.trim()) },
  async signInOtpVerify(email: string, code: string) { await signedIn(await api.otpVerify(needCfg(), email.trim(), code)) },
  async sendReset(email: string) { await api.recover(needCfg(), email.trim()) },
  /** after opening the reset link: choose a new password and sign in with it */
  async setNewPassword(pw: string) {
    const token = useS.getState().recovery
    if (!token) throw new Error(t("sync.err.noSession"))
    const cfg = needCfg()
    await api.updatePassword(cfg, token, pw)
    const u = await api.user(cfg, token)
    useS.setState({ recovery: null })
    await signedIn(await api.password(cfg, u.email ?? "", pw))
  },
  /** a session made elsewhere (phone link): refresh it for a full lifetime on this device, then sign in with it */
  async adoptSession(s: Session) { await signedIn((await api.refresh(needCfg(), s)) ?? s) },
  cancelRecovery() { useS.setState({ recovery: null }) },
  async signInPassword(email: string, pw: string) { await signedIn(await api.password(needCfg(), email.trim(), pw)) },
  /** 'confirm' = the project wants the email confirmed first */
  /** The app does not use confirmation emails: sign-up signs you in at once. If the server still has "Confirm email" on, say how to turn it off. */
  async signUp(email: string, pw: string) {
    const s = await api.signUp(needCfg(), email.trim(), pw)
    if (!s) throw new Error(t("sync.err.confirmOn"))
    await signedIn(s)
  },
  async signOut() {
    const { cfg, session } = useS.getState()
    const active = activePresence
    activePresence = null
    if (session) try {
      await presenceWrite
      if (active) await api.presenceRemove(cfg, session, presenceId(), active.item.id)
    } catch { /* local sign-out is what matters */ }
    presenceStore.setState({ devices: [], error: null })
    setSession(null)
    dropAccount()
    useSyncMeta.setState({ uid: null })
    if (session) try { await api.logout(cfg, session) } catch { /* local sign-out is what matters */ }
  },
  syncNow,
  async setPassphrase(p: string, remember: boolean) {
    if (!canEncrypt()) throw new Error(needsHttps())
    if (p.length < 8) throw new Error(t("sync.err.shortPass"))
    const { cfg, session } = useS.getState()
    let salt = newSalt()
    const row = session ? (await api.pull(cfg, await fresh())).row : null
    if (row) {
      const b = parseBlob(row.data)
      if (b.enc) { salt = b.salt; await open(b, await deriveKey(p, salt)) } // wrong passphrase throws here; nothing was changed
    }
    key = await deriveKey(p, salt)
    try { remember ? localStorage.setItem(KEYS, JSON.stringify(await exportKey(key))) : localStorage.removeItem(KEYS) } catch { /* private mode */ }
    useS.setState({ hasPass: true })
    fails = 0; blockedUntil = 0
    useS.setState((x) => ({ status: { ...x.status, needPass: false } }))
    void syncNow()
  },
  clearPassphrase() { key = null; try { localStorage.removeItem(KEYS) } catch { /* ignore */ } useS.setState({ hasPass: false }) },
  async deleteCloudData() { const { cfg } = useS.getState(); await api.del(cfg, await fresh()) },
}

export function useSync() {
  const { cfg, session, status, hasPass, recovery } = useS()
  return {
    recovering: !!recovery, configured: cfgOk(cfg), config: cfg, fromEnv: envConfigured, canEncrypt: canEncrypt(),
    session: session && { id: session.id, email: session.email }, status, hasPassphrase: hasPass, ...actions,
  }
}
export { badKey }
