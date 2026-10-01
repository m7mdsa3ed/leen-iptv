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
const PAGES = ["profiles", "sources", "home", "live", "guide", "movies", "series", "search", "library", "settings", "detail", "player", "person", "category", "genre", "history", "stats"]
const hashOf = (r: Route) => {
  const id = r.name === "person" ? r.p?.id ?? r.p?.name : r.name === "detail" || r.name === "category" || r.name === "genre" ? r.p?.id : r.name === "player" ? (r.p?.queue as { id: string }[] | undefined)?.[r.p?.index as number]?.id ?? r.p?.id : undefined
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
  if ((name === "category" || name === "genre") && id) return [{ name: id.startsWith("series|") ? "series" : "movies" }, { name, p: { id } }]
  if (name === "person" && id) return [{ name: "home" }, { name, p: { id } }]
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
  return r.width > 0 && r.height > 0 && !(el as HTMLButtonElement).disabled && getComputedStyle(el).visibility !== "hidden"
}

export function focusables(root: ParentNode = document) {
  // an open [data-modal] scopes navigation to itself
  const modal = document.querySelector("[data-modal]")
  const scope = modal ?? root
  return Array.from(scope.querySelectorAll<HTMLElement>("[data-nav]")).filter(visible)
}

type Box = { left: number; right: number; top: number; bottom: number }
/** Pure move score (lower = better, null = not in that direction). `ax` = remembered x centre for vertical moves.
 *  Prefers cross-axis overlap (flat penalty otherwise), then the nearest gap; far jumps cost extra. */
export function scoreMove(a: Box, b: Box, dir: Dir, ax?: number | null): number | null {
  const horiz = dir === "left" || dir === "right"
  const [aLo, aHi, bLo, bHi] = horiz ? [a.top, a.bottom, b.top, b.bottom] : ax != null ? [ax, ax, b.left, b.right] : [a.left, a.right, b.left, b.right]
  const [aMain, bMain] = horiz ? [(a.left + a.right) / 2, (b.left + b.right) / 2] : [(a.top + a.bottom) / 2, (b.top + b.bottom) / 2]
  const sign = dir === "right" || dir === "down" ? 1 : -1
  if ((bMain - aMain) * sign <= 4) return null
  const gap = Math.max(0, dir === "right" ? b.left - a.right : dir === "left" ? a.left - b.right : dir === "down" ? b.top - a.bottom : a.top - b.bottom)
  const overlap = Math.min(aHi, bHi) - Math.max(aLo, bLo)
  const off = Math.abs((bLo + bHi) / 2 - (aLo + aHi) / 2)
  const cross = overlap >= 0 ? off * 0.3 : 400 + -overlap * 3
  return gap + Math.abs(bMain - aMain) * 0.05 + cross + (gap * gap) / 4000
}

let anchorX: number | null = null // x centre kept across consecutive Up/Down moves
function pick(from: HTMLElement, dir: Dir) {
  const a = from.getBoundingClientRect()
  const vert = dir === "up" || dir === "down"
  if (vert && anchorX == null) anchorX = (a.left + a.right) / 2
  let best: HTMLElement | null = null
  let bestScore = Infinity
  for (const el of focusables()) {
    if (el === from) continue
    const sc = scoreMove(a, el.getBoundingClientRect(), dir, vert ? anchorX : null)
    if (sc != null && sc < bestScore) (best = el), (bestScore = sc)
  }
  return best
}

// focus memory: every [data-nav-group] ancestor remembers its last focused child
const memory = new WeakMap<Element, HTMLElement>()
const groupOf = (el: Element | null) => el?.closest("[data-nav-group]") ?? null
function viaMemory(cur: HTMLElement, next: HTMLElement, dir: Dir) {
  const g = groupOf(next)
  if (!g || g === groupOf(cur) || g.contains(cur)) return next
  const m = memory.get(g)
  const vert = dir === "up" || dir === "down"
  // vertical entry keeps the x position unless the group asks for strict memory (data-nav-group="memory")
  if (m && m.isConnected && visible(m) && (!vert || g.getAttribute("data-nav-group") === "memory")) return m
  return next
}

function wrap(cur: HTMLElement, next: HTMLElement | null, dir: Dir) {
  const w = cur.closest("[data-nav-wrap]")
  if (!w || (dir !== "left" && dir !== "right") || (next && w.contains(next))) return next
  const items = Array.from(w.querySelectorAll<HTMLElement>("[data-nav]")).filter(visible)
  return (dir === "right" ? items[0] : items[items.length - 1]) ?? next
}

export function focusFirst() {
  const el = focusables().find((e) => e.dataset.autofocus !== undefined) ?? focusables()[0]
  el?.focus()
}

function scroller(el: HTMLElement) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowX
    if ((o === "auto" || o === "scroll") && p.scrollWidth > p.clientWidth) return p
  }
  return null
}
/** focus without the browser's jump, then keep it comfortably visible (rails: centre when clipped) */
function focusTo(el: HTMLElement, fast: boolean) {
  lastKeyTarget = el
  el.focus({ preventScroll: true })
  const m = document.documentElement.dataset.motion
  const behavior: ScrollBehavior = fast || m === "off" || m === "reduced" ? "auto" : "smooth"
  const sc = scroller(el)
  let clipped = false
  if (sc) {
    const r = el.getBoundingClientRect(), pr = sc.getBoundingClientRect()
    clipped = r.left < pr.left || r.right > pr.right
  }
  el.scrollIntoView({ block: "nearest", inline: clipped ? "center" : "nearest", behavior })
}

let lastKeyTarget: HTMLElement | null = null
let lastMove = 0
let lastEl: HTMLElement | null = null
let lastBox: Box | null = null
let lastRoute: unknown = null

function pageMove(cur: HTMLElement, sign: 1 | -1) {
  const dir: Dir = sign > 0 ? "down" : "up"
  const h = (scroller(cur)?.clientHeight ?? 0) || window.innerHeight
  const y0 = cur.getBoundingClientRect().top
  let el = cur
  for (let i = 0; i < 30; i++) {
    const n = pick(el, dir)
    if (!n) break
    el = n
    if (Math.abs(n.getBoundingClientRect().top - y0) >= h * 0.8) break
  }
  return el === cur ? null : el
}

export function installNav(onBack: () => void) {
  const onKey = (e: KeyboardEvent) => {
    if (navState.lock) return
    const dir = DIRS[e.keyCode]
    const t = e.target as HTMLElement
    const field = t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable
    const typing = field || (t instanceof HTMLInputElement && t.type !== "button")
    const page = e.keyCode === KEY.chUp ? -1 : e.keyCode === KEY.chDown ? 1 : 0
    if (dir || (page && isTv)) {
      const cur = document.activeElement as HTMLElement
      if (!isTv) {
        // desktop: spatial nav only as an aid while a [data-nav] element has focus; never hijack fields or modified keys
        if (typing || e.altKey || e.ctrlKey || e.metaKey || !cur?.hasAttribute("data-nav")) return
      } else if (typing && (dir === "left" || dir === "right") && (t as HTMLInputElement).value) return // caret moves
      e.preventDefault()
      if (!cur || cur === document.body || !cur.hasAttribute("data-nav")) return focusFirst()
      // key repeat: throttle so virtualized lists can mount rows between moves
      const now = performance.now()
      if (e.repeat && now - lastMove < 90) return
      lastMove = now
      if (dir === "left" || dir === "right") anchorX = null
      let next = dir ? pick(cur, dir) : pageMove(cur, page as 1 | -1)
      if (dir) {
        if (next) next = viaMemory(cur, next, dir)
        next = wrap(cur, next, dir)
      }
      if (next) focusTo(next, e.repeat)
    } else if (e.keyCode === KEY.enter && isTv && !typing && t.hasAttribute?.("data-nav")) {
      e.preventDefault()
      t.click()
    } else if (e.keyCode === KEY.back || e.keyCode === KEY.esc || (e.keyCode === KEY.bksp && isTv && !typing)) {
      e.preventDefault()
      // Back from page content first returns to the layout's active nav item ([data-nav-home])
      const home = Array.from(document.querySelectorAll<HTMLElement>("[data-nav-home]")).find(visible)
      const box = home?.parentElement
      const cur = document.activeElement as HTMLElement
      if (home && box && visible(home) && !document.querySelector("[data-modal]") && cur?.hasAttribute?.("data-nav") && !box.contains(cur)) return focusTo(home, false)
      onBack()
    }
  }
  const onFocusIn = (e: FocusEvent) => {
    const el = e.target as HTMLElement
    if (!el.hasAttribute?.("data-nav")) return
    if (el !== lastKeyTarget) anchorX = null // focus came from pointer/code: re-anchor
    lastEl = el
    const r = el.getBoundingClientRect()
    lastBox = { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    lastRoute = useRoute.getState().stack[useRoute.getState().stack.length - 1]
    for (let g = groupOf(el); g; g = groupOf(g.parentElement)) memory.set(g, el)
  }
  // Magic Remote: real pointer movement focuses the element under it (synthetic moves from scrolling keep the same x/y)
  let px = -1, py = -1, pt = 0
  const onMove = (e: MouseEvent) => {
    if (e.clientX === px && e.clientY === py) return
    px = e.clientX; py = e.clientY
    const now = performance.now()
    if (now - pt < 60) return
    pt = now
    const el = (e.target as HTMLElement).closest?.<HTMLElement>("[data-nav]")
    if (!el || el === document.activeElement || !visible(el)) return
    const modal = document.querySelector("[data-modal]")
    if (modal && !modal.contains(el)) return
    lastKeyTarget = null
    el.focus({ preventScroll: true })
  }
  // never lose focus: if the focused element unmounts (virtualized list, reload), refocus the nearest remaining item
  let timer = 0
  const mo = new MutationObserver(() => {
    if (!lastEl || lastEl.isConnected || timer) return
    timer = window.setTimeout(() => {
      timer = 0
      const stack = useRoute.getState().stack
      const ae = document.activeElement
      if (!lastEl || lastEl.isConnected || !lastBox || (ae && ae !== document.body && ae.hasAttribute("data-nav"))) return
      if (lastRoute !== stack[stack.length - 1]) return // page changed: the page focuses its own
      const cx = (lastBox.left + lastBox.right) / 2, cy = (lastBox.top + lastBox.bottom) / 2
      let best: HTMLElement | null = null, bd = Infinity
      for (const el of focusables()) {
        const r = el.getBoundingClientRect()
        const d = Math.hypot((r.left + r.right) / 2 - cx, (r.top + r.bottom) / 2 - cy)
        if (d < bd) (best = el), (bd = d)
      }
      if (best) focusTo(best, true)
    }, 120)
  })
  window.addEventListener("keydown", onKey)
  if (isTv) {
    document.addEventListener("focusin", onFocusIn)
    document.addEventListener("mousemove", onMove, { passive: true })
    mo.observe(document.body, { childList: true, subtree: true })
  }
  return () => {
    window.removeEventListener("keydown", onKey)
    document.removeEventListener("focusin", onFocusIn)
    document.removeEventListener("mousemove", onMove)
    mo.disconnect()
    clearTimeout(timer)
  }
}
