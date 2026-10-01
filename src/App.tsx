import { useEffect, useRef, type ComponentType } from "react"
import { Empty, PinModal, usePinAsk, focusFirstSoon } from "@/components/tv/ui"
import { Boundary } from "@/components/tv/boundary"
import { useCatalog } from "@/lib/catalog"
import { isTv, useMode } from "@/lib/device"
import { useLayoutAttr, useLayoutDef } from "@/layouts"
import { useMotion } from "@/lib/motion"
import { useTheme } from "@/lib/theme"
import { ExitConfirm, askExit, closeExit, useExitAsk } from "@/components/tv/exit-confirm"
import { installNav, useRoute } from "@/lib/nav"
import { useApp } from "@/lib/store"
import Browse from "@/pages/browse"
import CategoryPage from "@/pages/category"
import Detail from "@/pages/detail"
import GenrePage from "@/pages/genre"
import HistoryPage from "@/pages/history"
import StatsPage from "@/pages/stats"
import Guide from "@/pages/guide"
import Home from "@/pages/home"
import Library from "@/pages/library"
import Live from "@/pages/live"
import PersonPage from "@/pages/person"
import Player from "@/pages/player"
import Profiles from "@/pages/profiles"
import Welcome from "@/pages/welcome"
import Search from "@/pages/search"
import Settings from "@/pages/settings"
import Sources from "@/pages/sources"

// after a refresh only the item id is in the URL: rebuild the zapping queue (the channel's category) once the catalog is ready
function RestorePlayer({ id }: { id: string }) {
  const { status, byId, byKind } = useCatalog()
  const back = useRoute((s) => s.back)
  const item = byId.get(id)
  if (status === "ready" && !item) return <Empty>Not found. <button data-nav className="ml-3 underline" onClick={back}>Back</button></Empty>
  if (!item) return <Empty>Loading...</Empty>
  const queue = item.kind === "live" ? byKind.live.filter((i) => i.group === item.group) : [item]
  return <Player queue={queue} index={queue.indexOf(item)} />
}

// pages rendered inside a layout Shell: their top bar stays put and only [data-page-content] (the Shell's <main>) animates
const SHELL_PAGES = new Set(["home", "live", "guide", "movies", "series", "search", "library", "settings", "category", "genre", "history", "stats"])

/** Default page per route; a layout can replace any of these via LayoutDef.pages (same props). */
const DEFAULT_PAGES: Record<string, ComponentType<any>> = { // eslint-disable-line @typescript-eslint/no-explicit-any
  profiles: Profiles, welcome: Welcome, live: Live, guide: Guide, movies: Browse, series: Browse, search: Search, library: Library, settings: Settings, genre: GenrePage, category: CategoryPage, person: PersonPage, detail: Detail, history: HistoryPage, stats: StatsPage,
}

function Page({ r }: { r: { name: string; p?: Record<string, unknown> } }) {
  const over = useLayoutDef().pages
  const p = r.p ?? {}
  switch (r.name) {
    case "sources": return <Sources />
    case "home": return <Home />
    case "player": return p.queue ? <Player queue={p.queue as never} index={p.index as number} /> : <RestorePlayer id={p.id as string} />
  }
  const C = over?.[r.name as keyof typeof over] ?? DEFAULT_PAGES[r.name]
  if (!C) return null
  // props are the same for default and override
  return <C {...(r.name === "movies" ? { kind: "movie" } : r.name === "series" ? { kind: "series" } : p)} />
}

export default function App() {
  const stack = useRoute((s) => s.stack)
  const profileId = useApp((s) => s.profileId)
  const sources = useApp((s) => s.sources)
  const last = useRef(new Map<number, HTMLElement>())
  const top = stack.length - 1
  useMode() // keeps html[data-mode] in sync on resize
  useTheme()
  useMotion()
  useLayoutAttr()
  const tvScale = useApp((s) => s.settings.tvScale)
  useEffect(() => { document.documentElement.style.setProperty("--tv-scale", String(tvScale)) }, [tvScale])

  // Back: close the PIN prompt / exit prompt first; at the root page on TV ask before leaving the app
  useEffect(() =>
    installNav(() => {
      const ask = usePinAsk.getState().ask
      if (ask) return ask.resolve(false), usePinAsk.setState({ ask: null })
      if (useExitAsk.getState().open) return closeExit()
      if (!useRoute.getState().back() && isTv) askExit()
    }), [])

  // load every enabled source (already-loaded ones are skipped) when the profile or the source list / enabled flags / order change
  const srcKey = sources.map((s) => `${s.id}:${s.enabled !== false ? 1 : 0}`).join(",")
  useEffect(() => {
    if (profileId) void useCatalog.getState().loadAll(useApp.getState().sources, useApp.getState().settings.proxy)
  }, [profileId, srcKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // remember focus per stacked page so Back returns to the same tile
  useEffect(() => {
    const f = (e: FocusEvent) => { if (e.target instanceof HTMLElement && e.target.hasAttribute("data-nav")) last.current.set(useRoute.getState().stack.length - 1, e.target) }
    window.addEventListener("focusin", f)
    return () => window.removeEventListener("focusin", f)
  }, [])
  useEffect(() => {
    for (const k of last.current.keys()) if (k > top) last.current.delete(k)
    if (!isTv) return // touch/mouse: no auto-focus ring
    requestAnimationFrame(() => {
      const el = last.current.get(top)
      if (el?.isConnected && el.getClientRects().length) el.focus()
      else focusFirstSoon()
    })
  }, [top, stack[top]?.name])

  // the entrance class is dropped once played: display none->block would otherwise replay it when Back reveals a stacked page
  const endAnim = (e: React.AnimationEvent<HTMLElement>) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).hasAttribute("data-page-content")) e.currentTarget.classList.remove("m-rise", "page-enter")
  }
  // stacked pages stay mounted (scroll + focus preserved), only the top is visible
  return (
    <>
      {stack.map((r, i) => (
        <div key={`${i}:${r.name}`} className={`${SHELL_PAGES.has(r.name) ? "page-enter" : "m-rise"} absolute inset-0`} style={{ display: i === top ? "block" : "none" }} onAnimationEnd={endAnim}>
          <Boundary><Page r={r} /></Boundary>
        </div>
      ))}
      <PinModal />
      <ExitConfirm />
    </>
  )
}
