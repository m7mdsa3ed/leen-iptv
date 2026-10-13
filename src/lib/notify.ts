import { create } from "zustand"
import { useApp } from "@/lib/store"
import { useRoute } from "@/lib/nav"
import { addNote, pruneInbox, type Inbox, type NoteKind, type NoteRoute } from "@/lib/notify-pure"

export type ToastMsg = { id: number; title: string; body?: string; route?: NoteRoute }

/** In-app toast state (works on every platform, TV included). */
export const useNotify = create<{ cur: ToastMsg | null; push: (m: Omit<ToastMsg, "id">) => void; close: () => void }>((set, get) => ({
  cur: null,
  push: (m) => { const id = Date.now(); set({ cur: { id, ...m } }); window.setTimeout(() => { if (get().cur?.id === id) set({ cur: null }) }, 9000) },
  close: () => set({ cur: null }),
}))

/* The inbox: fired notifications, device-local (each device gets its own heads-up), 50 max, 7 days. */
const IKEY = "leen-notify"
const loadInbox = (): Inbox => {
  try { const b = JSON.parse(localStorage.getItem(IKEY) || "null") as Inbox | null; if (b && Array.isArray(b.list)) return pruneInbox(b, Date.now()) } catch { /* ignore */ }
  return { list: [], seen: {} }
}
export const useInbox = create<Inbox>(loadInbox)
useInbox.subscribe((b) => { try { localStorage.setItem(IKEY, JSON.stringify(b)) } catch { /* ignore */ } })
/** Mark one note read (by key), or all of them. */
export const markRead = (key?: string) => useInbox.setState((b) => ({ list: b.list.map((n) => (!key || n.key === key ? { ...n, read: true } : n)) }))
/** Empty the list; fired keys are kept so nothing fires again. */
export const clearInbox = () => useInbox.setState({ list: [] })
export const openNote = (r?: NoteRoute) => { if (r) useRoute.getState().go(r.name, r.id ? { id: r.id } : undefined) }

/** Settings > Notifications: master switch (device-local) + one per kind (synced; kickoff = the Sports reminder; new episodes on by default). */
export function notifyOn(k: NoteKind): boolean {
  const s = useApp.getState().settings
  if (s.notifyOff) return false
  if (k === "kickoff") return !!s.sportsNotify?.enabled
  if (k === "episode") return s.notify?.episodes !== false
  return !!s.notify?.[k]
}

/** Show an in-app toast always, and a system notification too when the browser allows it
 *  (desktop / installed Android; webOS has no Notification API, so TV only gets the toast).
 *  With `o`, the alert lands in the inbox and fires once per `key` on this device (false = a duplicate, nothing shown). */
export function notify(title: string, body?: string, o?: { kind: NoteKind; key: string; route?: NoteRoute }): boolean {
  if (o) {
    const next = addNote(useInbox.getState(), { ...o, title, body, at: Date.now() })
    if (!next) return false
    useInbox.setState(next)
  }
  useNotify.getState().push({ title, body, route: o?.route })
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const n = new Notification(title, { body, tag: o?.key ?? title, icon: "./icon-192.png" })
      n.onclick = () => { window.focus(); n.close(); if (o) { markRead(o.key); openNote(o.route) } }
    }
  } catch { /* unsupported */ }
  return true
}

export const notificationsSupported = () => typeof Notification !== "undefined"
export const notificationPermission = (): NotificationPermission | "unsupported" => (typeof Notification !== "undefined" ? Notification.permission : "unsupported")
export async function requestNotifications(): Promise<NotificationPermission | "unsupported"> {
  if (typeof Notification === "undefined") return "unsupported"
  try { return await Notification.requestPermission() } catch { return "denied" }
}
