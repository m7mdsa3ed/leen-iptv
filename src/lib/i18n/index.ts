import { useCallback, useEffect } from "react"
import { useApp } from "../store"
import { en, ar } from "./locales"
import { HTML_LANG, LOCALE, fold, duration, fmtDate, fmtCompact, fmtDecimal, fmtNumber, fmtTime, resolveLang, translate, type Lang, type Pref, type Vars } from "./pure"

export { fold, LOCALE }
export type { Lang, Pref, Vars }
export type TFn = (key: string, vars?: Vars) => string

const dicts = { en, ar }
const nav = () => (typeof navigator === "undefined" ? "en" : navigator.language || "en")
const cur = (): Lang => resolveLang(useApp.getState().settings.language, nav())

/** Non-reactive: reads the language at call time. Use in non-React code and thrown messages; React components use useT(). */
export const t: TFn = (key, vars) => translate(dicts, cur(), key, vars)

/** React hook: a t() that re-renders the component when the language changes. */
export function useT(): TFn {
  const lang = useLang().lang
  return useCallback((key, vars) => translate(dicts, lang, key, vars), [lang])
}

export function useLang(): { lang: Lang; dir: "ltr" | "rtl"; isRtl: boolean } {
  const pref = useApp((s) => s.settings.language)
  const lang = resolveLang(pref, nav())
  return { lang, dir: lang === "ar" ? "rtl" : "ltr", isRtl: lang === "ar" }
}

/** Localised formatters (non-reactive like t(); a component that calls useT()/useLang() re-renders on switch). */
export const fmt = {
  number: (n: number) => fmtNumber(cur(), n),
  compact: (n: number) => fmtCompact(cur(), n),
  decimal: (n: number, digits = 1) => fmtDecimal(cur(), n, digits),
  date: (d: Date | number, o?: Intl.DateTimeFormatOptions) => fmtDate(cur(), d, o),
  time: (d: Date | number) => fmtTime(cur(), d),
  /** Latin digits -> Arabic-Indic in ar (policy: digits localised; units like Mbps/p/K stay Latin) */
  digits: (s: string | number) => (cur() === "ar" ? String(s).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]) : String(s)),
  duration: (sec: number) => duration(cur(), sec),
  /** plural key whose value is a Plural object; {n} is filled automatically */
  plural: (key: string, n: number, vars?: Vars) => t(key, { ...vars, n }),
}

/** Call once in App: html lang / dir / data-lang follow settings.language (live). */
export function useLanguageAttr() {
  const { lang, dir } = useLang()
  useEffect(() => {
    const h = document.documentElement
    h.lang = HTML_LANG[lang]
    h.dir = dir
    h.dataset.lang = lang
  }, [lang, dir])
}
