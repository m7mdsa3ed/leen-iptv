import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { create } from "zustand"
import { ArrowBigUp, ChevronLeft, Clock, ChevronRight, CornerDownLeft, Delete, Globe } from "lucide-react"
import { isTv } from "@/lib/device"
import { useCatalogView } from "@/layouts/hooks/use-source-filter"
import { fold, useLang, useT } from "@/lib/i18n"
import { navHooks } from "@/lib/nav"
import { useSearchHistory } from "@/lib/search-history"
import { useApp } from "@/lib/store"

type El = HTMLInputElement | HTMLTextAreaElement
/** Built-in on-screen keyboard (English + Arabic) for D-pad text entry. Opens on OK / click in a text field when enabled
    (Settings > Display > On-screen keyboard: auto = TV only); the field keeps focus ownership, the keys write into it. */
export const useKbd = create<{ el: El | null }>(() => ({ el: null }))
export const closeKeyboard = () => {
  const el = useKbd.getState().el
  useKbd.setState({ el: null })
  el?.focus({ preventScroll: true })
}

const TEXT = /^(text|search|email|password|url|tel|number)$/
const isText = (t: EventTarget | null): t is El => t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && TEXT.test(t.type))
const enabled = () => { const k = useApp.getState().settings.keyboard ?? "auto"; return k === "on" || (k === "auto" && isTv) }

/** Enter in a text field means submit, except OK on the remote while the on-screen keyboard is on: that opens the keyboard (nav.ts) and must not also submit.
    The keyboard's Done key sends an untrusted Enter, which does submit. */
export const isSubmit = (e: React.KeyboardEvent) => e.keyCode === 13 && !(e.nativeEvent.isTrusted && enabled())

let lastLang: "en" | "ar" | null = null
const NUMS = "1234567890".split("")
const MARKS = ["َ", "ً", "ُ", "ٌ", "ِ", "ٍ", "ّ", "ْ"] // fatha .. sukun
const L = {
  en: { low: ["qwertyuiop", "asdfghjkl", "zxcvbnm"], up: ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"] },
  ar: { low: ["ضصثقفغعهخحجدذ", "شسيبلاتنمكط", ["ئ", "ء", "ؤ", "ر", "لا", "ى", "ة", "و", "ز", "ظ"]], up: [["َ", "ً", "ُ", "ٌ", "ِ", "ٍ", "ّ", "ْ", "؟", "؛", "،", "ـ"], "أإآؤئءڤپچژگ", "!\":؟،؛.-/()"] },
} as const
const SYM = ["@#$%&*-+()", "!\"':;/?_=~", ",.<>[]{}\\|"]
const cells = (r: string | readonly string[]) => (typeof r === "string" ? Array.from(r) : [...r]) // "لا" is its own key (array rows), ل and ا stay separate letters

function write(el: El, v: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v) // React tracks the value: go through the native setter, then fire a real input event
  el.dispatchEvent(new Event("input", { bubbles: true }))
}

/** letter keys are quiet (surface-2), function keys one step darker, the Enter key carries the accent so the way out is obvious */
const Key = ({ children, onClick, label, wide, on, auto, kind }: { children: React.ReactNode; onClick: () => void; label?: string; wide?: number; on?: boolean; auto?: boolean; kind?: "fn" | "go" }) => (
  <button type="button" data-nav data-pill data-autofocus={auto ? "" : undefined} aria-label={label} aria-pressed={on} style={{ flex: wide ?? 1 }}
    className={`flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-2xl px-0 text-base font-medium sm:h-12 sm:text-xl md:h-14 ${kind === "go" ? "bg-primary text-primary-foreground" : on ? "bg-accent-blue-container text-foreground" : kind === "fn" ? "bg-surface-3 text-foreground" : "bg-surface-2 text-foreground"} [&_svg]:size-5 sm:[&_svg]:size-6`}
    onClick={onClick}>{children}</button>
)

export function OnScreenKeyboard() {
  const el = useKbd((s) => s.el)
  const t = useT()
  const appLang = useLang().lang
  const [lang, setLang] = useState<"en" | "ar">(lastLang ?? (appLang === "ar" ? "ar" : "en"))
  const [layer, setLayer] = useState<"low" | "up" | "sym">("low")
  const [text, setText] = useState("")
  const [pos, setPos] = useState(0)

  useEffect(() => {
    if (!el) return
    setText(el.value); setPos(el.value.length); setLayer("low")
    const id = requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-kbd] [data-autofocus]")?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(id)
  }, [el])

  const { items } = useCatalogView()
  const history = useSearchHistory((s) => s.list)
  const isSearch = el instanceof HTMLInputElement && el.type === "search"
  const q = fold(useDeferredValue(text).trim())
  // search boxes: recent searches when empty, else up to 6 catalog titles (prefix matches first); one pass, stops early
  const suggestions = useMemo(() => {
    if (!isSearch) return []
    if (q.length < 2) return history.slice(0, 6)
    const starts = new Set<string>(), has = new Set<string>()
    for (const i of items) {
      const n = fold(i.name)
      if (n.startsWith(q)) { starts.add(i.name); if (starts.size >= 6) break } else if (has.size < 6 && n.includes(q)) has.add(i.name)
    }
    return [...starts, ...has].slice(0, 6)
  }, [isSearch, q, items, history])
  if (!el) return null
  // the field is the truth: a form that filters what is typed (PIN: digits only) must not leave the keyboard's own copy out of step
  const apply = (v: string, p: number) => { write(el, v); const cur = el.value; setText(cur); setPos(cur === v ? p : cur.length) }
  const type = (s: string) => {
    if (el.maxLength > 0 && el.value.length + s.length > el.maxLength) return // e.g. the 4-digit profile PIN
    apply(text.slice(0, pos) + s + text.slice(pos), pos + s.length)
    if (layer === "up" && lang === "en") setLayer("low")
  }
  const back = () => pos > 0 && apply(text.slice(0, pos - 1) + text.slice(pos), pos - 1)
  const enter = () => {
    if (el instanceof HTMLTextAreaElement) return type("\n")
    closeKeyboard()
    const o = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }
    el.dispatchEvent(new KeyboardEvent("keydown", o)); el.dispatchEvent(new KeyboardEvent("keyup", o)) // search boxes submit on Enter
  }
  const set = lang === "ar" ? L.ar : L.en
  const rows = layer === "sym" ? SYM : layer === "up" ? set.up : set.low
  const shown = (c: string) => (lang === "ar" && layer === "up" && MARKS.includes(c) ? `ـ${c}` : c)
  const mask = el instanceof HTMLInputElement && el.type === "password"
  const shownText = mask ? "•".repeat(text.length) : text
  const lit = (s: string) => <span>{s}</span>

  return (
    <div data-modal data-kbd role="dialog" aria-modal="true" aria-label={t("kb.title")} className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/50 sm:items-center sm:pb-6" onClick={closeKeyboard}>
      <div dir="ltr" className="flex w-full max-w-[64rem] flex-col gap-1.5 rounded-t-[28px] bg-surface p-2 pb-[max(0.5rem,var(--safe-b))] shadow-2xl sm:gap-2 sm:rounded-[28px] sm:p-4 md:p-6" onClick={(e) => e.stopPropagation()}>
        <div dir="auto" className="mb-1 flex min-h-12 min-w-0 items-center overflow-hidden rounded-2xl bg-surface-2 px-4 text-xl ring-2 ring-primary/60 md:min-h-14 md:text-2xl">
          {lit(shownText.slice(0, pos))}<span aria-hidden className="mx-px inline-block h-7 w-0.5 animate-pulse bg-foreground" />{lit(shownText.slice(pos))}
          {!text && <span className="text-muted-foreground">{el.placeholder || el.getAttribute("aria-label") || ""}</span>}
        </div>
        {suggestions.length > 0 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto py-1">
            {suggestions.map((sg) => (
              <button key={sg} type="button" data-nav data-pill onClick={() => apply(sg, sg.length)} dir="auto"
                className="flex h-10 max-w-[60%] shrink-0 items-center gap-2 rounded-full bg-surface-2 px-4 text-base text-foreground sm:text-lg">
                {q.length < 2 && <Clock className="size-4 shrink-0 text-muted-foreground" />}<span className="truncate">{sg}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-1 sm:gap-2">{NUMS.map((c) => <Key key={c} onClick={() => type(c)}>{c}</Key>)}</div>
        {rows.map((r, i) => {
          const cs = cells(r)
          return (
            <div key={i} className={`flex gap-1 sm:gap-2 ${i === 1 ? "px-[3%]" : ""}`}>
              {i === 2 && layer !== "sym" && <Key kind="fn" wide={1.6} on={layer === "up"} label={t("kb.shift")} onClick={() => setLayer(layer === "up" ? "low" : "up")}><ArrowBigUp /></Key>}
              {cs.map((c, k) => <Key key={k} auto={i === 1 && k === 3} onClick={() => type(c)}>{shown(c)}</Key>)}
              {i === 2 && <Key kind="fn" wide={1.6} label={t("kb.backspace")} onClick={back}><Delete /></Key>}
            </div>
          )
        })}
        <div className="flex gap-1 sm:gap-2">
          <Key kind="fn" wide={1.6} on={layer === "sym"} onClick={() => setLayer(layer === "sym" ? "low" : "sym")}>{layer === "sym" ? "ABC" : "?123"}</Key>
          <Key kind="fn" wide={1.6} label={t("kb.language")} onClick={() => { const n = lang === "en" ? "ar" : "en"; lastLang = n; setLang(n); setLayer("low") }}><Globe className="me-1" />{lang === "en" ? "EN" : "ع"}</Key>
          <Key kind="fn" label={t("kb.left")} onClick={() => setPos(Math.max(0, pos - 1))}><ChevronLeft /></Key>
          <Key wide={4} label={t("kb.space")} onClick={() => type(" ")}><span className="text-base text-muted-foreground">{t("kb.space")}</span></Key>
          <Key kind="fn" label={t("kb.right")} onClick={() => setPos(Math.min(text.length, pos + 1))}><ChevronRight /></Key>
          <Key onClick={() => type(lang === "ar" ? "،" : ",")}>{lang === "ar" ? "،" : ","}</Key>
          <Key onClick={() => type(".")}>.</Key>
          <Key kind="go" wide={2} label={t("kb.done")} onClick={enter}><CornerDownLeft /><span className="hidden sm:inline">{t("kb.done")}</span></Key>
        </div>
      </div>
    </div>
  )
}

/** Wire the keyboard into the app: OK/click in a text field opens it; inputmode=none keeps the system keyboard away. Call once. */
export function installKeyboard() {
  navHooks.text = (el) => { if (!el.isConnected || !enabled() || el.readOnly || el.disabled) return false; useKbd.setState({ el }); return true }
  const onFocusIn = (e: FocusEvent) => { if (enabled() && isText(e.target) && e.target instanceof HTMLInputElement) e.target.inputMode = "none" }
  const onClick = (e: MouseEvent) => {
    const el = e.target
    if (e.isTrusted && isText(el) && !useKbd.getState().el && enabled() && !el.readOnly && !el.disabled) { el.blur(); useKbd.setState({ el }) }
  }
  document.addEventListener("focusin", onFocusIn)
  document.addEventListener("click", onClick, true)
  return () => { navHooks.text = undefined; document.removeEventListener("focusin", onFocusIn); document.removeEventListener("click", onClick, true) }
}
