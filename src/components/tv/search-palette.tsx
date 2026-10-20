import { useEffect, useRef } from "react"
import { TextInput } from "@/components/tv/text-input"
import { create } from "zustand"
import { Clock, Search as SearchIcon, X } from "lucide-react"
import { Card } from "@/components/gtv"
import { useSearch } from "@/layouts/hooks/use-search"
import { fmt, useT } from "@/lib/i18n"
import { navHooks } from "@/lib/nav"
import { isSubmit } from "./keyboard"
import { useSearchHistory } from "@/lib/search-history"
import type { Item } from "@/lib/types"

/** Floating search command (Ctrl/Cmd+K, "/", or any Search button). Empty = recent searches; typing = live results; Enter opens the first match.
    Mounted once in App.tsx; Back (App's installNav handler) calls closePalette. */
type Kind = "all" | "movie" | "series" | "live"
export const usePalette = create<{ open: boolean; kind: Kind }>(() => ({ open: false, kind: "all" })) // kind (like the query) is kept between openings
export const openPalette = () => usePalette.setState({ open: true })
export const closePalette = () => usePalette.setState({ open: false })

export function SearchPalette() {
  const open = usePalette((s) => s.open)
  return open ? <Panel /> : null
}

const row = "flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 py-2 text-start text-lg outline-none"
const grid = (min: string) => ({ gridTemplateColumns: `repeat(auto-fill, minmax(${min}, 1fr))` })

function Panel() {
  const t = useT()
  const S = useSearch()
  const H = useSearchHistory()
  const kind = usePalette((s) => s.kind)
  const ref = useRef<HTMLInputElement>(null)
  // reopened with a query: select it, so typing starts a new search and OK/Enter keeps the old one
  useEffect(() => { ref.current?.focus(); ref.current?.select(); navHooks.text?.(ref.current!) }, []) // TV: open the on-screen keyboard straight away
  const pick = (i: Item) => { S.open(i, S.live); closePalette() }
  const groups = ([["movie", t("nav.movies"), S.movies], ["series", t("nav.shows"), S.series], ["live", t("nav.live"), S.live]] as const).filter((g) => g.length && g[2].length)
  const shown = kind === "all" ? groups : groups.filter((g) => g[0] === kind)
  const first = shown[0]?.[2][0]
  return (
    <div data-modal role="dialog" aria-modal="true" aria-label={t("common.search")} className="fixed inset-0 z-[55] flex justify-center bg-background/90 px-[var(--gx)] pb-[var(--safe-b)] pt-[max(4vh,var(--safe-t))] backdrop-blur-md" onClick={closePalette}>
      <div className="flex h-full w-full max-w-[72rem] flex-col text-foreground" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <div className="flex h-14 min-w-0 flex-1 items-center gap-3 rounded-full bg-surface-2 ps-5 pe-1 focus-within:ring-2 focus-within:ring-[var(--ring)]">
            <SearchIcon className="size-5 shrink-0 text-muted-foreground" />
            <TextInput unstyled autoEdit ref={ref} dir="auto" data-nav data-autofocus="" type="search" enterKeyHint="search" autoComplete="off" value={S.q} placeholder={t("search.hint")}
              onChange={(e) => S.setQ(e.target.value)}
              onKeyDown={(e) => { if (isSubmit(e)) { if (first) pick(first); else H.add(S.q) } }}
              style={{ outline: "none", boxShadow: "none" }} className="h-full min-w-0 flex-1 bg-transparent text-xl outline-none placeholder:text-base placeholder:text-muted-foreground [html[data-mode=mobile]_&]:text-[16px] [&::-webkit-search-cancel-button]:hidden" />
            {S.q && <button data-nav data-pill aria-label={t("search.clear")} onClick={() => { S.setQ(""); ref.current?.focus() }} className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground"><X className="size-5" /></button>}
          </div>
          <button data-nav data-pill onClick={closePalette} className="min-h-11 shrink-0 rounded-full px-4 text-base font-medium text-muted-foreground">{t("common.close")}</button>
        </div>
        {!S.tooShort && groups.length > 1 && (
          <div data-nav-group className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto p-1">
            {([["all", t("common.all"), S.results.length] as const, ...groups.map((g) => [g[0], g[1], g[2].length] as const)]).map(([k, label, n]) => (
              <button key={k} data-nav data-pill aria-pressed={kind === k} onClick={() => usePalette.setState({ kind: k })}
                className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-medium ${kind === k ? "bg-foreground text-background" : "bg-surface-2 text-muted-foreground"}`}>
                {label} <span className="opacity-60">{fmt.number(n)}</span>
              </button>
            ))}
          </div>
        )}
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-6 pt-3">
          {S.tooShort ? (
            H.list.length ? (
              <div data-nav-group>
                <div className="flex items-center justify-between px-4 pb-1 pt-2 text-sm text-muted-foreground">{t("search.recent")}<button data-nav data-pill onClick={H.clear} className="rounded-full px-3 py-1 hover:text-foreground">{t("search.clear")}</button></div>
                {H.list.map((h) => (
                  <div key={h} className="flex items-center">
                    <button data-nav data-pill onClick={() => { S.setQ(h); ref.current?.focus() }} className={`${row} min-w-0 flex-1`}><Clock className="size-5 shrink-0 text-muted-foreground" /><span dir="auto" className="truncate">{h}</span></button>
                    <button data-nav data-pill aria-label={t("search.remove")} onClick={() => H.remove(h)} className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground"><X className="size-4" /></button>
                  </div>
                ))}
              </div>
            ) : <div className="px-4 py-12 text-center text-muted-foreground">{t("search.hint")}</div>
          ) : shown.length ? shown.map(([k, label, items]) => (
            <section key={k} className="mb-6">
              <h2 className="mb-2 text-lg font-medium">{label} <span className="text-muted-foreground">{fmt.number(items.length)}</span></h2>
              <div data-nav-group className="grid gap-3" style={grid(k === "live" ? "10rem" : "6.5rem")}>
                {items.slice(0, kind === "all" ? 12 : 120).map((i) => <Card key={i.id} item={i} variant={k === "live" ? "wide" : "poster"} fluid onOpen={() => pick(i)} />)}
              </div>
            </section>
          )) : <div className="px-4 py-12 text-center text-muted-foreground">{t("search.none")}</div>}
        </div>
      </div>
    </div>
  )
}

/** Ctrl/Cmd+K or "/" (outside text fields) opens the palette. Call once. */
export function installPaletteKeys() {
  const f = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null
    const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") || (!typing && e.key === "/")) { e.preventDefault(); openPalette() }
  }
  window.addEventListener("keydown", f)
  return () => window.removeEventListener("keydown", f)
}
