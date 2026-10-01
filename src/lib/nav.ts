import { create } from "zustand"
import { isTv } from "@/lib/device"
import { useApp } from "@/lib/store"

/** Minimal router: a stack of pages. Back pops. */
export type Route = { name: string; p?: Record<string, unknown> }
interface R {
  stack: Route[]
  go: (name: string, p?: Route["p"]) => void
  replace: (name: string, p?: Route["p"]) => void
  back: () => boolean
  reset: (name: string) => void
}
/* URL <-> stack. Each history entry carries a hash (#/live, #/detail/<id>, #/player/<id>) so a refresh lands on the same page.
   Hash routing works from file:// (webOS) and any static host. Entry d=0 is a guard (Back never leaves the app),
   entry d=n shows stack[n-1]. */
const PAGES = ["profiles", "sources", "home", "live", "guide", "movies", "series", "search", "settings", "detail", "player"]
const hashOf = (r: Route) => {
  const id = r.name === "detail" ? r.p?.id : r.name === "player" ? (r.p?.queue as { id: string }[] | undefined)?.[r.p?.index as number]?.id ?? r.p?.id : undefined
  return `#/${r.name}${id ? "/" + encodeURIComponent(String(id)) : ""}`
}
const baseFor = (id: string): Route["name"] => (id.includes("|live|") ? "live" : id.includes("|movie|") ? "movies" : id.includes("|series|") ? "series" : "home")

function initialStack(): Route[] {
  const { profileId, sources } = useApp.getState()
  if (!profileId) return [{ name: "profiles" }]
  const [, name = "", raw = ""] = location.hash.match(/^#\/([a-z]+)(?:\/(.+))?$/) ?? []
  const id = raw ? decodeURIComponent(raw) : ""
  if (!sources.length) return [{ name: "sources" }]
  if (!PAGES.includes(name) || name === "profiles" || name === "sources") return [{ name: "home" }]
  if ((name === "detail" || name === "player") && id) return [{ name: baseFor(id) }, { name, p: { id } }]
  return [{ name }]
}

let skip = false
const url = () => hashOf(useRoute.getState().stack.slice(-1)[0])
export const useRoute = create<R>((set, get) => ({
  stack: initialStack(),
  go: (name, p) => {
    set((s) => ({ stack: [...s.stack, { name, p }] }))
    history.pushState({ d: get().stack.length }, "", url())
  },
  replace: (name, p) => {
    set((s) => ({ stack: [...s.stack.slice(0, -1), { name, p }] }))
    history.replaceState(history.state, "", url())
  },
  back: () => {
    if (get().stack.length <= 1) return false
    history.back() // popstate pops the stack
    return true
  },
  reset: (name) => {
    const n = get().stack.length
    set({ stack: [{ name }] })
    if (n > 1) (skip = true, history.go(1 - n))
    else history.replaceState(history.state, "", url())
  },
}))
{
  const st = useRoute.getState().stack
  history.replaceState({ d: 0 }, "", hashOf(st[0]))
  st.forEach((r, i) => history.pushState({ d: i + 1 }, "", hashOf(r)))
}
window.addEventListener("popstate", (e) => {
  if (skip) return void ((skip = false), history.replaceState(history.state, "", url()))
  const d = (e.state?.d as number | undefined) ?? 0
  const n = useRoute.getState().stack.length
  if (d < 1) history.pushState({ d: 1 }, "", hashOf(useRoute.getState().stack[0])) // hit the guard: stay
  if (d < n) useRoute.setState((s) => ({ stack: s.stack.slice(0, Math.max(1, d)) }))
  else if (d > n) history.go(n - d) // forward button: not supported
})
export const useCur = () => useRoute((s) => s.stack[s.stack.length - 1])

// webOS remote key codes (LG magic remote / standard remote)
export const KEY = {
  left: 37, up: 38, right: 39, down: 40, enter: 13, back: 461, esc: 27, bksp: 8,
  play: 415, pause: 19, stop: 413, ff: 417, rw: 412, chUp: 427, chDown: 428,
  red: 403, green: 404, yellow: 405, blue: 406, info: 457,
} as const

/** Player sets lock=true while it handles raw keys itself. */
export const navState = { lock: false }

type Dir = "left" | "right" | "up" | "down"
const DIRS: Record<number, Dir> = { 37: "left", 38: "up", 39: "right", 40: "down" }

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && !(el as HTMLButtonElement).disabled
}

export function focusables(root: ParentNode = document) {
  // an open [data-modal] scopes navigation to itself
  const modal = document.querySelector("[data-modal]")
  const scope = modal ?? root
  return Array.from(scope.querySelectorAll<HTMLElement>("[data-nav]")).filter(visible)
}

function pick(from: HTMLElement, dir: Dir) {
  const a = from.getBoundingClientRect()
  let best: HTMLElement | null = null
  let bestScore = Infinity
  for (const el of focusables()) {
    if (el === from) continue
    const b = el.getBoundingClientRect()
    const dx = b.left + b.width / 2 - (a.left + a.width / 2)
    const dy = b.top + b.height / 2 - (a.top + a.height / 2)
    const [main, cross] = dir === "left" || dir === "right" ? [dx, dy] : [dy, dx]
    const sign = dir === "right" || dir === "down" ? 1 : -1
    if (main * sign <= 4) continue
    // overlap on the cross axis is cheap, offset is expensive
    const score = Math.abs(main) + Math.abs(cross) * 3
    if (score < bestScore) (best = el), (bestScore = score)
  }
  return best
}

export function focusFirst() {
  const el = focusables().find((e) => e.dataset.autofocus !== undefined) ?? focusables()[0]
  el?.focus()
}

export function installNav(onBack: () => void) {
  const onKey = (e: KeyboardEvent) => {
    if (navState.lock) return
    const dir = DIRS[e.keyCode]
    const t = e.target as HTMLElement
    const field = t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable
    const typing = field || (t instanceof HTMLInputElement && t.type !== "button")
    if (dir) {
      const cur = document.activeElement as HTMLElement
      if (!isTv) {
        // desktop: spatial nav only as an aid while a [data-nav] element has focus; never hijack fields or modified keys
        if (typing || e.altKey || e.ctrlKey || e.metaKey || !cur?.hasAttribute("data-nav")) return
      } else if (typing && (dir === "left" || dir === "right") && (t as HTMLInputElement).value) return // caret moves
      e.preventDefault()
      if (!cur || cur === document.body || !cur.hasAttribute("data-nav")) return focusFirst()
      const next = pick(cur, dir)
      next?.focus()
      next?.scrollIntoView({ block: "nearest", inline: "nearest" })
    } else if (e.keyCode === KEY.enter && isTv && !typing && t.hasAttribute?.("data-nav")) {
      e.preventDefault()
      t.click()
    } else if (e.keyCode === KEY.back || e.keyCode === KEY.esc || (e.keyCode === KEY.bksp && isTv && !typing)) {
      e.preventDefault()
      onBack()
    }
  }
  window.addEventListener("keydown", onKey)
  return () => window.removeEventListener("keydown", onKey)
}
