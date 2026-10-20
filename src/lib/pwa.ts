import { create } from "zustand"

/** The update offer (desktop/mobile PWA; TVs register no worker). A new build's worker downloads its files and waits
 *  (public/sw.js); the toast shows the download, then Reload hands over and reloads. Close = later: the next ordinary
 *  reload picks the new version up anyway (navigations are network-first). */
type Phase = "idle" | "downloading" | "ready" | "applying"
export const usePwa = create<{ phase: Phase; done: number; total: number }>(() => ({ phase: "idle", done: 0, total: 0 }))

let reg: ServiceWorkerRegistration | undefined

export function applyUpdate() {
  if (!reg?.waiting) return location.reload()
  usePwa.setState({ phase: "applying" })
  navigator.serviceWorker.addEventListener("controllerchange", () => location.reload())
  reg.waiting.postMessage("skip")
}
export const dismissUpdate = () => usePwa.setState({ phase: "idle" })

function watch(w: ServiceWorker | null) {
  // first install: nothing to replace, so nothing to announce
  if (!w || !navigator.serviceWorker.controller) return
  const on = () => {
    if (w.state === "installed") usePwa.setState({ phase: "ready" })
    else if (w.state === "redundant" && usePwa.getState().phase !== "applying") usePwa.setState({ phase: "idle" }) // install failed
  }
  if (w.state === "installing") usePwa.setState({ phase: "downloading", done: 0, total: 0 })
  on()
  w.addEventListener("statechange", on)
}

export function registerPwa() {
  if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol) || /Web0S|webOS|SmartTV/i.test(navigator.userAgent)) return
  const sw = navigator.serviceWorker
  sw.addEventListener("message", (e) => {
    const d = e.data as { type?: string; done?: number; total?: number } | undefined
    if (d?.type === "sw-progress" && usePwa.getState().phase === "downloading") usePwa.setState({ done: d.done ?? 0, total: d.total ?? 0 })
  })
  const go = () => void sw.register("./sw.js").then((r) => {
    reg = r
    watch(r.installing)
    watch(r.waiting)
    r.addEventListener("updatefound", () => watch(r.installing))
    // a tab left open all day never navigates, so it would never see a deploy
    window.setInterval(() => void r.update().catch(() => undefined), 60 * 60 * 1000)
  }).catch(() => undefined)
  if (document.readyState === "complete") go()
  else window.addEventListener("load", go)
}
