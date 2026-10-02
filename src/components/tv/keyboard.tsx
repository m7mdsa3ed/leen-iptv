import { useEffect, useState } from "react"
import { create } from "zustand"
import { ArrowBigUp, ChevronLeft, ChevronRight, CornerDownLeft, Delete, Globe } from "lucide-react"
import { isTv } from "@/lib/device"
import { useLang, useT } from "@/lib/i18n"
import { navHooks } from "@/lib/nav"
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

let lastLang: "en" | "ar" | null = null
const NUMS = "1234567890".split("")
const MARKS = ["َ", "ً", "ُ", "ٌ", "ِ", "ٍ", "ّ", "ْ"] // fatha .. sukun
const L = {
  en: { low: ["qwertyuiop", "asdfghjkl", "zxcvbnm"], up: ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"] },
  ar: { low: ["ضصثقفغعهخحجد", "شسيبلاتنمكط", "ئءؤرلاىةوزظ"], up: [["َ", "ً", "ُ", "ٌ", "ِ", "ٍ", "ّ", "ْ", "؟", "؛", "،", "ـ"], "أإآؤئءڤپچژگ", "!\":؟،؛.-/()"] },
} as const
const SYM = ["@#$%&*-+()", "!\"':;/?_=~", ",.<>[]{}\\|"]
const cells = (r: string | readonly string[]) => (typeof r === "string" ? Array.from(r.replace(/لا/, "\u0000")).map((c) => (c === "\u0000" ? "لا" : c)) : [...r])

function write(el: El, v: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v) // React tracks the value: go through the native setter, then fire a real input event
  el.dispatchEvent(new Event("input", { bubbles: true }))
}

const Key = ({ children, onClick, label, wide, on, auto }: { children: React.ReactNode; onClick: () => void; label?: string; wide?: number; on?: boolean; auto?: boolean }) => (
  <button type="button" data-nav data-pill data-autofocus={auto ? "" : undefined} aria-label={label} aria-pressed={on} style={{ flex: wide ?? 1 }}
    className={`flex h-12 min-w-0 items-center justify-center rounded-xl text-xl font-medium md:h-14 ${on ? "bg-accent-blue-container text-foreground" : "bg-surface-2 text-foreground"} [&_svg]:size-6`}
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

  if (!el) return null
  const apply = (v: string, p: number) => { setText(v); setPos(p); write(el, v) }
  const type = (s: string) => { apply(text.slice(0, pos) + s + text.slice(pos), pos + s.length); if (layer === "up" && lang === "en") setLayer("low") }
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
    <div data-modal data-kbd role="dialog" aria-modal="true" aria-label={t("kb.title")} className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/60" onClick={closeKeyboard}>
      <div dir="ltr" className="mx-auto flex w-full max-w-[68rem] flex-col gap-2 rounded-t-[28px] bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl md:p-6" onClick={(e) => e.stopPropagation()}>
        <div dir="auto" className="mb-1 flex min-h-12 items-center rounded-2xl bg-surface-2 px-4 text-xl md:text-2xl">
          {lit(shownText.slice(0, pos))}<span aria-hidden className="mx-px inline-block h-7 w-0.5 animate-pulse bg-foreground" />{lit(shownText.slice(pos))}
          {!text && <span className="text-muted-foreground">{el.placeholder || el.getAttribute("aria-label") || ""}</span>}
        </div>
        <div className="flex gap-2">{NUMS.map((c) => <Key key={c} onClick={() => type(c)}>{c}</Key>)}</div>
        {rows.map((r, i) => {
          const cs = cells(r)
          return (
            <div key={i} className="flex gap-2">
              {i === 2 && layer !== "sym" && <Key wide={1.6} on={layer === "up"} label={t("kb.shift")} onClick={() => setLayer(layer === "up" ? "low" : "up")}><ArrowBigUp /></Key>}
              {cs.map((c, k) => <Key key={c + k} auto={i === 1 && k === 3} onClick={() => type(c)}>{shown(c)}</Key>)}
              {i === 2 && <Key wide={1.6} label={t("kb.backspace")} onClick={back}><Delete /></Key>}
            </div>
          )
        })}
        <div className="flex gap-2">
          <Key wide={1.6} on={layer === "sym"} onClick={() => setLayer(layer === "sym" ? "low" : "sym")}>{layer === "sym" ? "ABC" : "?123"}</Key>
          <Key wide={1.6} label={t("kb.language")} onClick={() => { const n = lang === "en" ? "ar" : "en"; lastLang = n; setLang(n); setLayer("low") }}><Globe className="me-1" />{lang === "en" ? "EN" : "ع"}</Key>
          <Key label={t("kb.left")} onClick={() => setPos(Math.max(0, pos - 1))}><ChevronLeft /></Key>
          <Key wide={4} label={t("kb.space")} onClick={() => type(" ")}><span className="text-base text-muted-foreground">{t("kb.space")}</span></Key>
          <Key label={t("kb.right")} onClick={() => setPos(Math.min(text.length, pos + 1))}><ChevronRight /></Key>
          <Key onClick={() => type(lang === "ar" ? "،" : ",")}>{lang === "ar" ? "،" : ","}</Key>
          <Key onClick={() => type(".")}>.</Key>
          <Key wide={1.6} label={t("kb.done")} onClick={enter}><CornerDownLeft /></Key>
        </div>
      </div>
    </div>
  )
}

/** Wire the keyboard into the app: OK/click in a text field opens it; inputmode=none keeps the system keyboard away. Call once. */
export function installKeyboard() {
  navHooks.text = (el) => { if (!enabled() || el.readOnly || el.disabled) return false; useKbd.setState({ el }); return true }
  const onFocusIn = (e: FocusEvent) => { if (enabled() && isText(e.target) && e.target instanceof HTMLInputElement) e.target.inputMode = "none" }
  const onClick = (e: MouseEvent) => {
    const el = e.target
    if (e.isTrusted && isText(el) && !useKbd.getState().el && enabled() && !el.readOnly && !el.disabled) { el.blur(); useKbd.setState({ el }) }
  }
  document.addEventListener("focusin", onFocusIn)
  document.addEventListener("click", onClick, true)
  return () => { navHooks.text = undefined; document.removeEventListener("focusin", onFocusIn); document.removeEventListener("click", onClick, true) }
}
