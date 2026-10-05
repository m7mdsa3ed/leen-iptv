import { useEffect, useRef } from "react"
import { create } from "zustand"
import { isTv } from "@/lib/device"
import { useApp } from "@/lib/store"
import { envConfigured } from "@/lib/api"
import { firstRowIndex, lineStart, pickIndex, popLen, scoreMove, type Box, type Dir, type Hints } from "@/lib/nav-pure"

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
const PAGES = ["profiles", "sources", "home", "live", "movies", "series", "library", "settings", "detail", "player", "person", "team", "match", "sports", "category", "genre", "history", "stats", "diagnostics", "welcome", "link", "episode"]
const hashOf = (r: Route) => {
  const id = r.name === "person" ? r.p?.id ?? r.p?.name : r.name === "team" || r.name === "match" ? r.p?.id : r.name === "detail" || r.name === "episode" || r.name === "category" || r.name === "genre" ? r.p?.id : r.name === "player" ? (r.p?.queue as { id: string }[] | undefined)?.[r.p?.index as number]?.id ?? r.p?.id : undefined
  return `#/${r.name}${id ? "/" + encodeURIComponent(String(id)) : ""}`
}
const baseFor = (id: string): Route["name"] => (id.includes("|live|") ? "live" : id.includes("|movie|") ? "movies" : id.includes("|series|") ? "series" : "home")

/** The page the app opens on (Settings > Display > Startup page); anything but Home needs a loaded profile and a source. */
export const startPage = (): Route["name"] => useApp.getState().settings.startPage ?? "home"

function initialStack(): Route[] {
  const { profileId, sources } = useApp.getState()
  // opened from a TV's QR code on a phone: the link page needs no profile
  { const m = location.hash.match(/^#\/link(?:\/([A-Za-z0-9-]+))?$/); if (m) return [{ name: "link", p: { id: m[1] } }] }
  // first launch of a build that has cloud sync: let the user choose between an account and no account
  if (!profileId) return [{ name: envConfigured && useApp.getState().settings.accountChoice === "unset" ? "welcome" : "profiles" }]
  const [, name = "", raw = ""] = location.hash.match(/^#\/([a-z]+)(?:\/(.+))?$/) ?? []
  const id = raw ? decodeURIComponent(raw) : ""
  if (!sources.length) return [{ name: "sources" }]
  if (!name) return [{ name: startPage() }] // fresh launch: no page in the URL
  if (!PAGES.includes(name) || name === "profiles" || name === "sources") return [{ name: "home" }]
  if ((name === "detail" || name === "player") && id) return [{ name: baseFor(id) }, { name, p: { id } }]
  if ((name === "category" || name === "genre") && id) return [{ name: id.startsWith("series|") ? "series" : "movies" }, { name, p: { id } }]
  if (name === "person" && id) return [{ name: "home" }, { name, p: { id } }]
  if (name === "team" && id) return [{ name: "home" }, { name, p: { id } }]
  if (name === "match" && id) return [{ name: "home" }, { name, p: { id } }]
  if (name === "episode" && id.includes("~")) { const sid = id.slice(0, id.indexOf("~")); return [{ name: baseFor(sid) }, { name: "detail", p: { id: sid } }, { name, p: { id } }] } // <seriesId>~<episodeItemId>
  return [{ name }]
}

let skip = 0, skipAt = 0 // popstates caused by back()/reset(): the stack is already trimmed. Two quick back() calls can share ONE traversal, so a stale count expires instead of swallowing a later real Back
const markSkip = () => (skip++, (skipAt = performance.now()))
/** Back on a top-level page (a tab, Settings, ...) other than Home goes Home; setup screens (no profile/source yet) keep their own flow. */
const NOT_HOME = ["home", "welcome", "profiles", "sources", "link"]
const backToHome = (st: Route[]) => st.length === 1 && !NOT_HOME.includes(st[0].name)
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
    const st = get().stack
    if (backToHome(st)) {
      set({ stack: [{ name: "home" }] })
      history.replaceState(history.state, "", url())
      return true
    }
    if (st.length <= 1) return false
    // our stack decides (exactly one page), the browser follows: it may skip entries pushed without a user gesture
    set({ stack: st.slice(0, -1) })
    markSkip()
    history.back()
    return true
  },
  reset: (name) => {
    const n = get().stack.length
    set({ stack: [{ name }] })
    if (n > 1) (markSkip(), history.go(1 - n))
    else history.replaceState(history.state, "", url())
  },
}))
{
  const st = useRoute.getState().stack
  history.replaceState({ d: 0 }, "", hashOf(st[0]))
  st.forEach((r, i) => history.pushState({ d: i + 1 }, "", hashOf(r)))
}
window.addEventListener("popstate", (e) => {
  const ours = skip > 0 && performance.now() - skipAt < 2000
  skip = ours ? skip - 1 : 0
  const d = (e.state?.d as number | undefined) ?? 0
  const st = useRoute.getState().stack
  if (!ours && d > st.length) return void history.go(st.length - d) // forward button: not supported
  const n = popLen(d, st.length, ours)
  if (n < st.length) useRoute.setState({ stack: st.slice(0, n) })
  // re-stamp the entry we landed on to match the stack; landing on the guard (d=0) pushes a page entry back so Back never leaves the app
  if (d < 1) {
    if (backToHome(useRoute.getState().stack)) useRoute.setState({ stack: [{ name: "home" }] }) // browser Back on a top-level page: Home, like the remote
    history.pushState({ d: useRoute.getState().stack.length }, "", url())
  }
  else history.replaceState({ d: n }, "", url())
})
export const useCur = () => useRoute((s) => s.stack[s.stack.length - 1])

/* A page with an inner step (the add-profile form, a sign-in panel) registers it while it is open: Back closes that step instead of leaving the page.
   A step belongs to the page that registered it (its stack depth): stacked pages stay mounted, and a hidden page's step must not swallow Back on the page above it.
   `global` = not a page's (the password-recovery dialog, shown over whatever page is up). */
const steps: { f: () => void; depth: number }[] = []
export function useBackStep(open: boolean, close: () => void, global = false) {
  const fn = useRef(close)
  fn.current = close
  useEffect(() => {
    if (!open) return
    const step = { f: () => fn.current(), depth: global ? 0 : useRoute.getState().stack.length }
    steps.push(step)
    return () => void steps.splice(steps.indexOf(step), 1)
  }, [open, global])
}
/** App's Back chain: closes the innermost open step of the page on top (or a global one); false when there is none. */
export const backStep = () => {
  const depth = useRoute.getState().stack.length
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i].depth === 0 || steps[i].depth === depth) return steps[i].f(), true
  return false
}

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

/** An open [data-modal] that is not inside `scope` (a CSS selector): the player yields its keys to those (PIN, card menu, trailer, keyboard...). */
export function dialogOutside(scope: string) {
  const all = document.querySelectorAll<HTMLElement>("[data-modal]")
  for (let i = 0; i < all.length; i++) if (!all[i].closest(scope) && all[i].getBoundingClientRect().width > 0) return true
  return false
}

/** The player's raw-key lock (navState.lock) only holds while no dialog is open: a PIN prompt, card menu or keyboard over a locked player still needs the D-pad. */
const locked = () => navState.lock && !topModal()

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
/** What the boxes alone cannot say (see nearestRow): the row / grid / list each candidate belongs to, and whether it sits beside the page ([data-nav-aside]). */
function hintsOf(els: HTMLElement[]): Hints {
  const seen = new Map<Element, Box>()
  return {
    ext: els.map((el) => {
      let g = el.closest("[data-nav-group],[data-vscroll]")
      for (let up = g?.parentElement?.closest("[data-nav-group],[data-vscroll]"); up; up = up.parentElement?.closest("[data-nav-group],[data-vscroll]")) g = up // the outermost: a settings Row that holds a Segmented
      if (!g) return null
      let b = seen.get(g)
      if (!b) { const r = g.getBoundingClientRect(); seen.set(g, (b = { left: r.left, right: r.right, top: r.top, bottom: r.bottom })) }
      return b
    }),
    aside: els.map((el) => !!el.closest("[data-nav-aside]")),
  }
}
function pick(from: HTMLElement, dir: Dir) {
  const a = from.getBoundingClientRect()
  const vert = dir === "up" || dir === "down"
  if (vert && anchorX == null) anchorX = (a.left + a.right) / 2
  const els = focusables().filter((el) => el !== from)
  const i = pickIndex(a, els.map((el) => el.getBoundingClientRect()), dir, vert ? anchorX : null, hintsOf(els))
  return i >= 0 ? els[i] : null
}

/** Down from the top bar goes to the first row on screen (the hero's Watch button, the category chips...), not to whatever lies under the tab. */
function firstRow(bar: HTMLElement) {
  const edge = (bar.closest("header.topbar") ?? bar).getBoundingClientRect().bottom
  const els = focusables().filter((e) => e.closest("[data-page-content]") && !e.closest("[data-nav-aside]"))
  const i = firstRowIndex(els.map((e) => e.getBoundingClientRect()), edge, window.innerHeight, document.documentElement.dir === "rtl")
  return i >= 0 ? els[i] : null
}

// focus memory: every [data-nav-group] ancestor remembers its last focused child
const memory = new WeakMap<Element, HTMLElement>()
const groupOf = (el: Element | null) => el?.closest("[data-nav-group]") ?? null
// a "row scope" is the nearest group, virtual list/grid, page content or top bar: Up/Down into a different scope starts at its row's first item
const SCOPE = "[data-nav-group],[data-vscroll],[data-page-content],header,[data-modal]"
const scopeOf = (el: Element) => el.parentElement?.closest(SCOPE) ?? document.body
function viaMemory(cur: HTMLElement, next: HTMLElement, dir: Dir) {
  const vert = dir === "up" || dir === "down"
  const g = groupOf(next)
  const m = g && memory.get(g)
  // strict memory (data-nav-group="memory") restores the last child on any entry; other groups only on Left/Right entry
  if (g && g !== groupOf(cur) && !g.contains(cur) && m && m.isConnected && visible(m) && (!vert || g.getAttribute("data-nav-group") === "memory")) return m
  if (!vert) return next
  const sc = scopeOf(next)
  if (sc === scopeOf(cur)) return next // same grid/list: keep the column
  // new row: its active tab (top bar) or else its first item, by position so RTL starts at the right
  const els = focusables(sc).filter((el) => scopeOf(el) === sc) // direct members only: not a side list sharing the line
  const home = els.find((el) => el.hasAttribute("data-nav-home"))
  const nb = next.getBoundingClientRect()
  const cy = (nb.top + nb.bottom) / 2
  if (home) { const h = home.getBoundingClientRect(); if (h.top <= cy && h.bottom >= cy) return (anchorX = null), home }
  const i = lineStart(els.map((el) => el.getBoundingClientRect()), nb, document.documentElement.dir === "rtl")
  if (i >= 0) anchorX = null
  return i >= 0 ? els[i] : next
}

function wrap(cur: HTMLElement, next: HTMLElement | null, dir: Dir) {
  const w = cur.closest("[data-nav-wrap]")
  // only at a dead end: a neighbour outside the row (the top bar's Search and profile buttons beside the tabs) is still reachable
  if (!w || (dir !== "left" && dir !== "right") || next) return next
  // by position (not DOM order) so RTL and reordered rows wrap to the visually opposite end
  const items = Array.from(w.querySelectorAll<HTMLElement>("[data-nav]")).filter(visible).map((el) => ({ el, x: el.getBoundingClientRect().left }))
  items.sort((p, q) => p.x - q.x)
  return (dir === "right" ? items[0] : items[items.length - 1])?.el ?? next
}

const textField = (e: Element) => e instanceof HTMLTextAreaElement || (e instanceof HTMLInputElement && TEXT.test(e.type))
const TEXT = /^(text|search|email|password|url|tel|number)$/
const RTL_CHAR = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/
const STRONG = /[A-Za-z\u00C0-\u024F\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/ // a letter with a direction (digits and punctuation have none)
let autoWait = 0
export function focusFirst() {
  clearInterval(autoWait)
  const all = focusables()
  // never pop the on-screen keyboard by itself: text fields only with data-autofocus
  // a new page lands on its own first control (Play, first rail card...), not the top bar that precedes it in the DOM
  const page = all.filter((e) => e.closest("[data-page-content]"))
  const auto = all.find((e) => e.dataset.autofocus !== undefined)
  const el = auto ?? page.find((e) => !textField(e)) ?? all.find((e) => !textField(e)) ?? all[0]
  if (el) focusTo(el, true)
  if (auto) return
  // the main action ([data-autofocus], e.g. Play) may still be loading or disabled (series episodes): move to it once it is
  // ready, unless the user has moved focus in the meantime. ponytail: 200ms poll for up to 10s, a MutationObserver if it ever costs
  const held = el ?? document.body
  let n = 0
  autoWait = window.setInterval(() => {
    if (document.activeElement !== held && !(held === document.body && !document.activeElement) || ++n > 50) return clearInterval(autoWait)
    const a = focusables().find((e) => e.dataset.autofocus !== undefined)
    if (a) (clearInterval(autoWait), focusTo(a, true))
  }, 200)
}

function scroller(el: HTMLElement) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowX
    if ((o === "auto" || o === "scroll") && p.scrollWidth > p.clientWidth) return p
  }
  return null
}
function scrollFocused(el: HTMLElement, fast: boolean) {
  const m = document.documentElement.dataset.motion
  const behavior: ScrollBehavior = fast || m === "off" || m === "reduced" ? "auto" : "smooth"
  const sc = scroller(el)
  let clipped = false
  if (sc) {
    const r = el.getBoundingClientRect(), pr = sc.getBoundingClientRect()
    clipped = r.left < pr.left || r.right > pr.right
  }
  el.scrollIntoView({ block: el.closest("nav") ? "center" : "nearest", inline: clipped ? "center" : "nearest", behavior })
  if (el === lastEl) { // where it is NOW, not where it was before the scroll: that is where recover() looks if the control disappears
    const r = el.getBoundingClientRect()
    lastBox = { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    if (el === lastPage) lastPageBox = lastBox
  }
}
/** focus without the browser's jump, then keep it comfortably visible (navigation controls stay centred).
 *  `keep` = a D-pad move: the x anchor of consecutive Up/Down moves survives it. Any other focus (page open, recovery, Back to the tab bar) starts a new column. */
function focusTo(el: HTMLElement, fast: boolean, keep = false) {
  lastKeyTarget = keep ? el : null
  focusEl(el)
  scrollFocused(el, fast)
}

/* Virtualized lists ([data-vscroll] = VList / VGrid): only the rows near the viewport are mounted, so at the edge of the mounted
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
    const i = pickIndex(o, els.map((el) => el.getBoundingClientRect()), dir, anchorX, hintsOf(els))
    if (i >= 0) { vsBusy = false; return focusTo(els[i], fast, true) }
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
let lastPage: HTMLElement | null = null // last focused control outside every [data-modal]: where focus goes back to when a dialog closes
let lastPageBox: Box | null = null // ...and where it was, for when that control is gone (its dialog's action removed it)
const modalLast = new WeakMap<Element, HTMLElement>() // last focused control per dialog: a dialog closing over another one hands focus back to it

let keyAt = 0 // time of the last key: a blur right after one is React re-ordering / disabling the control, not the user clicking away

/** Focus is nowhere (the focused control was removed, moved by React or disabled itself): the same control if it is still usable, else the one nearest to where it was; a new page starts at its first control. */
function recover(box: Box | null = lastBox) {
  const stack = useRoute.getState().stack
  if (!box || lastRoute !== stack[stack.length - 1]) return focusFirst()
  const els = focusables()
  if (lastEl && els.includes(lastEl)) return focusTo(lastEl, true)
  const cx = (box.left + box.right) / 2, cy = (box.top + box.bottom) / 2
  let best: HTMLElement | null = null, bd = Infinity
  for (const el of els) {
    const r = el.getBoundingClientRect()
    const d = Math.hypot((r.left + r.right) / 2 - cx, (r.top + r.bottom) / 2 - cy)
    if (d < bd) (best = el), (bd = d)
  }
  return best ? focusTo(best, true) : focusFirst()
}

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

/** Set by the on-screen keyboard: return true when it took over the text field (OK pressed in it). */
export const navHooks: { text?: (el: HTMLInputElement | HTMLTextAreaElement) => boolean } = {}
const NATIVE_CLICK = /^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY)$/
const hold = { t: 0, el: null as HTMLElement | null }
export function installNav(onBack: () => void) {
  const onKey = (e: KeyboardEvent) => {
    if (locked()) return
    keyAt = performance.now()
    const dir = DIRS[e.keyCode]
    const t = e.target as HTMLElement
    // typing = text entry only: checkboxes, radios, ranges, buttons... are plain controls (Enter activates, arrows navigate)
    const typing = t instanceof HTMLTextAreaElement || t.isContentEditable || (t instanceof HTMLInputElement && TEXT.test(t.type))
    const page = e.keyCode === KEY.chUp ? -1 : e.keyCode === KEY.chDown ? 1 : 0
    if (typing && e.keyCode === KEY.enter && e.isTrusted && !e.repeat && navHooks.text?.(t as HTMLInputElement)) { e.preventDefault(); return }
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
        const s0 = i.selectionStart, s1 = i.selectionEnd // null on type=email / number: no caret to move, the key leaves
        const rtl = i.dir === "auto" ? RTL_CHAR.test((i.value ?? "").match(STRONG)?.[0] ?? "") : getComputedStyle(i).direction === "rtl" // dir=auto: the first strong letter decides; Left walks toward the END of right-to-left text
        if (i.value && s0 != null && !(s0 === s1 && ((dir === "left") !== rtl ? s0 === 0 : s0 === i.value.length))) return
      } else if (t instanceof HTMLInputElement && t.type === "range" && (dir === "left" || dir === "right") && t.hasAttribute("data-seek")) return // seek bar: native step
      e.preventDefault()
      if (!cur || cur === document.body || cur === document.documentElement) return recover() // focus is nowhere: the key brings it back (to the last control), it does not also move
      // key repeat: throttle so virtualized lists can mount rows between moves
      const now = performance.now()
      if (e.repeat && now - lastMove < 90) return
      lastMove = now
      if (dir === "left" || dir === "right") anchorX = null
      let next = dir ? pick(cur, dir) : pageMove(cur, page as 1 | -1)
      if (dir === "down" && cur.closest("header.topbar")) next = firstRow(cur) ?? next
      if (dir) {
        if (next) next = viaMemory(cur, next, dir)
        next = wrap(cur, next, dir)
      }
      if (dir === "up" || dir === "down") {
        const vs = cur.closest<HTMLElement>("[data-vscroll]")
        if (vs && (!next || !vs.contains(next)) && canScrollV(vs, dir)) return virtualStep(vs, cur, dir, e.repeat)
      }
      if (next) focusTo(next, e.repeat, true)
      else if (!cur.hasAttribute("data-nav") || !visible(cur)) focusFirst() // stray/disabled focus with nowhere to go
    } else if ((e.keyCode === KEY.enter || e.keyCode === 32) && !typing && !(t instanceof HTMLSelectElement) && t.hasAttribute?.("data-nav") && ((e.keyCode === KEY.enter && isTv) || !NATIVE_CLICK.test(t.tagName))) {
      // TV: Enter clicks any [data-nav]; div/section/[role] with data-nav (any mode): Enter and Space click like a button
      e.preventDefault()
      if (t.hasAttribute("data-hold")) {
        // [data-hold]: OK clicks on release; holding it ~0.6s fires "contextmenu" instead (the card's long-press menu)
        if (!e.repeat) { clearTimeout(hold.t); hold.el = t; hold.t = window.setTimeout(() => { hold.t = 0; t.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })) }, 600) }
      } else if (!e.repeat) t.click()
    } else if (e.keyCode === KEY.back || e.keyCode === KEY.esc || (e.keyCode === KEY.bksp && isTv && !typing)) {
      e.preventDefault()
      // Back from page content first returns to the layout's active nav item ([data-nav-home])
      const home = Array.from(document.querySelectorAll<HTMLElement>("[data-nav-home]")).find(visible)
      const box = home?.closest("nav") ?? home?.parentElement // the whole tab bar / settings list: Back from another item of it leaves too
      const cur = document.activeElement as HTMLElement
      // ...but only on a top-level page: a sub-page (category, genre, history) Back pops at once
      if (home && box && !topModal() && cur?.hasAttribute?.("data-nav") && !box.contains(cur) && useRoute.getState().stack.length === 1) return focusTo(home, false)
      onBack()
    }
  }
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.keyCode !== KEY.enter || !hold.el) return
    const el = hold.el
    hold.el = null
    if (hold.t) { clearTimeout(hold.t); hold.t = 0; el.click() } // released before the long press
  }
  const onFocusIn = (e: FocusEvent) => {
    const el = (e.target as HTMLElement).closest?.<HTMLElement>("[data-nav]")
    if (!el) return
    if (el !== lastKeyTarget) anchorX = null // focus came from pointer/code: re-anchor
    lastEl = el
    const r = el.getBoundingClientRect()
    lastBox = { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    const dlg = el.closest("[data-modal]")
    if (dlg) modalLast.set(dlg, el)
    else (lastPage = el), (lastPageBox = lastBox)
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
    scrollFocused(el, false)
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
    if (timer || locked() || !stray()) return
    timer = window.setTimeout(() => {
      timer = 0
      if (locked() || !stray()) return
      const m = topModal()
      const stack = useRoute.getState().stack
      const lost = !lastEl || !lastEl.isConnected || !visible(lastEl) || (m != null && !m.contains(lastEl))
      const moved = lastRoute !== stack[stack.length - 1]
      if (m) { // a dialog is up: back to where focus was inside it (another dialog just closed over it), else its first control
        const r = modalLast.get(m)
        return r && r.isConnected && visible(r) ? focusTo(r, true) : focusFirst()
      }
      if (moved) return focusFirst()
      if (!lost) { // the control is still there: blurred right after a key = React moved / re-keyed it ("move down" buttons), so take it back; a click on empty space is left alone
        if (lastEl && performance.now() - keyAt < 1000) focusTo(lastEl, true)
        return
      }
      // a dialog closed on the same page: back to the control that opened it, or to whatever now sits where that one was (an action can remove it: "remove from continue watching"),
      // not to whatever is nearest to where the dialog's own button was
      const fromDialog = !!lastEl?.closest("[data-modal]")
      if (fromDialog && lastPage?.isConnected && visible(lastPage)) return focusTo(lastPage, true)
      recover((fromDialog && lastPageBox) || lastBox)
    }, 120)
  })
  window.addEventListener("keydown", onKey)
  window.addEventListener("keyup", onKeyUp)
  if (isTv) {
    document.addEventListener("focusin", onFocusIn)
    document.addEventListener("mousemove", onMove, { passive: true })
    mo.observe(document.body, { childList: true, subtree: true })
  }
  return () => {
    window.removeEventListener("keydown", onKey)
    window.removeEventListener("keyup", onKeyUp)
    document.removeEventListener("focusin", onFocusIn)
    document.removeEventListener("mousemove", onMove)
    mo.disconnect()
    clearTimeout(timer)
  }
}
