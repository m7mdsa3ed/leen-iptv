import { create } from "zustand"

export type ToastMsg = { id: number; title: string; body?: string }

/** In-app toast state (works on every platform, TV included). */
export const useNotify = create<{ cur: ToastMsg | null; push: (m: Omit<ToastMsg, "id">) => void; close: () => void }>((set, get) => ({
  cur: null,
  push: (m) => { const id = Date.now(); set({ cur: { id, ...m } }); window.setTimeout(() => { if (get().cur?.id === id) set({ cur: null }) }, 9000) },
  close: () => set({ cur: null }),
}))

/** Show an in-app toast always, and a system notification too when the browser allows it
 *  (desktop / installed Android; webOS has no Notification API, so TV only gets the toast). */
export function notify(title: string, body?: string) {
  useNotify.getState().push({ title, body })
  try { if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(title, { body, tag: title, icon: "./icon-192.png" }) } catch { /* unsupported */ }
}

export const notificationsSupported = () => typeof Notification !== "undefined"
export const notificationPermission = (): NotificationPermission | "unsupported" => (typeof Notification !== "undefined" ? Notification.permission : "unsupported")
export async function requestNotifications(): Promise<NotificationPermission | "unsupported"> {
  if (typeof Notification === "undefined") return "unsupported"
  try { return await Notification.requestPermission() } catch { return "denied" }
}
