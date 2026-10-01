import { create } from "zustand"
import { isTv } from "@/lib/device"
import { useApp } from "@/lib/store"
import { envConfigured } from "@/lib/sync/client"
import { pickIndex, scoreMove, type Box, type Dir } from "@/lib/nav-pure"

export { scoreMove }

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
const PAGES = ["profiles", "sources", "home", "live", "guide", "movies", "series", "search", "library", "settings", "detail", "player", "person", "category", "genre", "history", "stats", "welcome"]
const hashOf = (r: Route) => {
  const id = r.name === "person" ? r.p?.id ?? r.p?.name : r.name === "detail" || r.name === "category" || r.name === "genre" ? r.p?.id : r.name === "player" ? (r.p?.queue as { id: string }[] | undefined)?.[r.p?.index as number]?.id ?? r.p?.id : undefined
  return `#/${r.name}${id ? "/" + encodeURIComponent(String(id)) : ""}`
}
const baseFor = (id: string): Route["name"] => (id.includes("|live|") ? "live" : id.includes("|movie|") ? "movies" : id.includes("|series|") ? "series" : "home")

function initialStack(): Route[] {
  const { profileId, sources } = useApp.getState()
  // first launch of a build that has cloud sync: let the user choose between an account and no account
  if (!profileId) return [{ name: envConfigured && useApp.getState().settings.accountChoice === "unset" ? "welcome" : "profiles" }]
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

const DIRS: Record<number, Dir> = { 37: "left", 38: "up", 39: "right", 40: "down" }

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && !(el as HTMLButtonElement).disabled && el.getAttribute("aria-disabled") !== "true" && getComputedStyle(el).visibility !== "hidden" && !el.closest("[inert]")
}

/** topmost open [data-modal] (several can stack; the last one in the DOM is on top) */
function topModal() {
  const all = document.querySelectorAll<HTMLElement>("[data-modal]")
  for (let i = all.length - 1; i >= 0; i--) if (all[i].getBoundingClientRect().width > 0) return all[i]
  return null
}

export function focusables(root: ParentNode = document) {
  // an open [data-modal] scopes navigation to itself
  const scope = topModal() ?? root
  return Array.from(scope.querySelectorAll<HTMLElement>("[data-nav]")).filter(visible)
}

/** divs/sections with data-nav have no tabindex and silently ignore focus(): make them focusable */
function focusEl(el: HTMLElement) {
  if (!el.hasAttribute("tabindex") && el.tabIndex < 0) el.setAttribute("tabindex", "-1")
  el.focus({ preventScroll: true })
}

let anchorX: number | null = null // x centre kept across consecutive Up/Down moves
function pick(from: HTMLElement, dir: Dir) {
  const a = from.getBoundingClientRect()
  const vert = dir === "up" || dir === "down"
  if (vert && anchorX == null) anchorX = (a.left + a.right) / 2
  const els = focusables().filter((el) => el !== from)
  const i = pickIndex(a, els.map((el) => el.getBoundingClientRect()), dir, vert ? anchorX : null)
  return i >= 0 ? els[i] : null
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
  // by position (not DOM order) so RTL and reordered rows wrap to the visually opposite end
  const items = Array.from(w.querySelectorAll<HTMLElement>("[data-nav]")).filter(visible).map((el) => ({ el, x: el.getBoundingClientRect().left }))
  items.sort((p, q) => p.x - q.x)
  return (dir === "right" ? items[0] : items[items.length - 1])?.el ?? next
}

const textField = (e: Element) => e instanceof HTMLTextAreaElement || (e instanceof HTMLInputElement && TEXT.test(e.type))
const TEXT = /^(text|search|email|password|url|tel|number)$/
export function focusFirst() {
  const all = focusables()
  // never pop the on-screen keyboard by itself: text fields only with data-autofocus
  const el = all.find((e) => e.dataset.autofocus !== undefined) ?? all.find((e) => !textField(e)) ?? all[0]
  if (el) focusTo(el, true)
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
  focusEl(el)
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

/* Virtualized lists ([data-vscroll] = VList / VGrid / Guide): only the rows near the viewport are mounted, so at the edge of the mounted
   rows Up/Down would find nothing in the list and jump somewhere else (a later section, the top bar). If the list can still scroll that way,
   scroll it by about a row, wait for the rows to mount, then pick from where the focus was (shifted by the scroll). */
let vsBusy = false
const canScrollV = (el: HTMLElement, dir: Dir) => (dir === "down" ? el.scrollTop + el.clientHeight < el.scrollHeight - 2 : el.scrollTop > 2)
function virtualStep(vs: HTMLElement, cur: HTMLElement, dir: Dir, fast: boolean) {
  if (vsBusy) return
  vsBusy = true
  const r = cur.getBoundingClientRect()
  const from = { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
  const before = vs.scrollTop
  vs.scrollTop += (dir === "down" ? 1 : -1) * Math.max(r.height * 1.5, vs.clientHeight * 0.4)
  const moved = vs.scrollTop - before
  let tries = 0
  const attempt = () => {
    const o = { left: from.left, right: from.right, top: from.top - moved, bottom: from.bottom - moved }
    const els = focusables().filter((el) => vs.contains(el))
    const i = pickIndex(o, els.map((el) => el.getBoundingClientRect()), dir, anchorX)
    if (i >= 0) { vsBusy = false; return focusTo(els[i], fast) }
    if (++tries < 5) return void requestAnimationFrame(attempt)
    vsBusy = false
  }
  requestAnimationFrame(() => requestAnimationFrame(attempt)) // the virtualizer renders on the scroll event, give it a frame or two
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

const NATIVE_CLICK = /^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY)$/
export function installNav(onBack: () => void) {
  const onKey = (e: KeyboardEvent) => {
    if (navState.lock) return
    const dir = DIRS[e.keyCode]
    const t = e.target as HTMLElement
    // typing = text entry only: checkboxes, radios, ranges, buttons... are plain controls (Enter activates, arrows navigate)
    const typing = t instanceof HTMLTextAreaElement || t.isContentEditable || (t instanceof HTMLInputElement && TEXT.test(t.type))
    const page = e.keyCode === KEY.chUp ? -1 : e.keyCode === KEY.chDown ? 1 : 0
    if (dir || (page && isTv)) {
      // focus may sit on a child of a [data-nav] element (inner input/icon): navigate from the nav element
      const ae = document.activeElement as HTMLElement | null
      const cur = (ae?.closest?.<HTMLElement>("[data-nav]") ?? ae) as HTMLElement
      if (!isTv) {
        // desktop: spatial nav only as an aid while a [data-nav] element has focus; never hijack fields or modified keys
        if (typing || e.altKey || e.ctrlKey || e.metaKey || !cur?.hasAttribute("data-nav")) return
      } else if (typing && (dir === "left" || dir === "right")) {
        // caret moves inside the text; at the edge of the text the key leaves the field
        const i = t as HTMLInputElement
        const s0 = i.selectionStart, s1 = i.selectionEnd
        if (i.value && !(s0 === s1 && s0 != null && (dir === "left" ? s0 === 0 : s0 === i.value.length))) return
      } else if (t instanceof HTMLInputElement && t.type === "range" && (dir === "left" || dir === "right") && t.hasAttribute("data-seek")) return // seek bar: native step
      e.preventDefault()
      if (!cur || cur === document.body || cur === document.documentElement) return focusFirst()
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
      if (dir === "up" || dir === "down") {
        const vs = cur.closest<HTMLElement>("[data-vscroll]")
        if (vs && (!next || !vs.contains(next)) && canScrollV(vs, dir)) return virtualStep(vs, cur, dir, e.repeat)
      }
      if (next) focusTo(next, e.repeat)
      else if (!cur.hasAttribute("data-nav") || !visible(cur)) focusFirst() // stray/disabled focus with nowhere to go
    } else if ((e.keyCode === KEY.enter || e.keyCode === 32) && !typing && !(t instanceof HTMLSelectElement) && t.hasAttribute?.("data-nav") && ((e.keyCode === KEY.enter && isTv) || !NATIVE_CLICK.test(t.tagName))) {
      // TV: Enter clicks any [data-nav]; div/section/[role] with data-nav (any mode): Enter and Space click like a button
      e.preventDefault()
      if (!e.repeat) t.click()
    } else if (e.keyCode === KEY.back || e.keyCode === KEY.esc || (e.keyCode === KEY.bksp && isTv && !typing)) {
      e.preventDefault()
      // Back from page content first returns to the layout's active nav item ([data-nav-home])
      const home = Array.from(document.querySelectorAll<HTMLElement>("[data-nav-home]")).find(visible)
      const box = home?.parentElement
      const cur = document.activeElement as HTMLElement
      if (home && box && !topModal() && cur?.hasAttribute?.("data-nav") && !box.contains(cur)) return focusTo(home, false)
      onBack()
    }
  }
  const onFocusIn = (e: FocusEvent) => {
    const el = (e.target as HTMLElement).closest?.<HTMLElement>("[data-nav]")
    if (!el) return
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
    const modal = topModal()
    if (modal && !modal.contains(el)) return
    lastKeyTarget = null
    focusEl(el)
  }
  // never lose focus: if the focused element unmounts/hides/disables (virtualized list, reload, page change) or nothing was ever
  // focused, refocus the nearest remaining item (same page) or the page's first/autofocus item. A deliberate pointer blur
  // (lastEl still there) is left alone. Also pulls focus into a [data-modal] that opened while focus stayed behind it.
  const stray = () => {
    const ae = document.activeElement
    const m = topModal()
    return !ae || ae === document.body || ae === document.documentElement || (m != null && !m.contains(ae))
  }
  let timer = 0
  const mo = new MutationObserver(() => {
    if (timer || navState.lock || !stray()) return
    timer = window.setTimeout(() => {
      timer = 0
      if (navState.lock || !stray()) return
      const m = topModal()
      const stack = useRoute.getState().stack
      const lost = !lastEl || !lastEl.isConnected || !visible(lastEl) || (m != null && !m.contains(lastEl))
      const moved = lastRoute !== stack[stack.length - 1]
      if (!lost && !moved && !m) return
      if (m || !lost || moved || !lastBox) return focusFirst()
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
