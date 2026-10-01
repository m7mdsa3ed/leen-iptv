// Pure i18n core (no store, no aliases, no DOM): imported by index.ts and by node scripts/i18n.check.ts
export type Lang = "en" | "ar"
export type Pref = "auto" | Lang
export type Plural = { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string }
export type Dict = Record<string, string | Plural>
export type Vars = Record<string, string | number>

export const LOCALE: Record<Lang, string> = { en: "en-US", ar: "ar-EG-u-nu-arab" } // Arabic-Indic digits in ar
export const HTML_LANG: Record<Lang, string> = { en: "en", ar: "ar-EG" }
export const PLURAL_FORMS = ["zero", "one", "two", "few", "many", "other"] as const

export const resolveLang = (pref: Pref | undefined, navLang: string): Lang => (pref === "en" || pref === "ar" ? pref : /^ar/i.test(navLang) ? "ar" : "en")

const nf = new Map<Lang, Intl.NumberFormat>()
const numFmt = (l: Lang) => { let f = nf.get(l); if (!f) nf.set(l, (f = new Intl.NumberFormat(LOCALE[l], { maximumFractionDigits: 2 }))); return f }

const interp = (s: string, l: Lang, v?: Vars) =>
  v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? (typeof v[k] === "number" ? numFmt(l).format(v[k] as number) : l === "ar" ? `\u2068${v[k]}\u2069` : String(v[k])) : m)) : s

/** Look up key (lang -> en -> key itself), pick the plural form from vars.n when the value is a plural object, fill {placeholders}. */
export function translate(dicts: Record<Lang, Dict>, lang: Lang, key: string, vars?: Vars): string {
  const v = dicts[lang][key] ?? dicts.en[key]
  if (v === undefined) return key
  if (typeof v === "string") return interp(v, lang, vars)
  const n = typeof vars?.n === "number" ? vars.n : 1
  const form = n === 0 && v.zero !== undefined ? "zero" : new Intl.PluralRules(LOCALE[lang]).select(n)
  return interp(v[form] ?? v.other, lang, vars)
}

/** Localised duration from seconds: "1h 2m" / "١ س ٢ د"; under a minute shows seconds. */
export function duration(l: Lang, sec: number): string {
  const s = Math.max(0, Math.round(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  const f = numFmt(l).format
  const sp = l === "ar" ? " " : ""
  const u = l === "ar" ? { h: "س", m: "د", s: "ث" } : { h: "h", m: "m", s: "s" }
  if (h) return m ? `${f(h)}${sp}${u.h} ${f(m)}${sp}${u.m}` : `${f(h)}${sp}${u.h}`
  return m ? `${f(m)}${sp}${u.m}` : `${f(s % 60)}${sp}${u.s}`
}

export const fmtDecimal = (l: Lang, n: number, digits = 1) => new Intl.NumberFormat(LOCALE[l], { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
/** Search key: lowercase, no Arabic diacritics/tatweel, alef/yeh/heh variants folded. */
export const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u064B-\u0652\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
export const fmtNumber = (l: Lang, n: number) => numFmt(l).format(n)
/** 29272 -> "29.3K" / "٢٩٫٣ ألف" (compact notation, Chrome 77+). Small numbers stay as they are. */
export const fmtCompact = (l: Lang, n: number) => new Intl.NumberFormat(LOCALE[l], { notation: "compact", maximumFractionDigits: 1 }).format(n)
export const fmtDate = (l: Lang, d: Date | number, o?: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE[l], o ?? { year: "numeric", month: "short", day: "numeric" }).format(d)
export const fmtTime = (l: Lang, d: Date | number) => new Intl.DateTimeFormat(LOCALE[l], { hour: "numeric", minute: "2-digit" }).format(d)
