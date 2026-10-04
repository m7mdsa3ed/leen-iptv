import { useEffect, useRef, type ComponentType } from "react"
import { Empty, PinModal, usePinAsk, focusFirstSoon } from "@/components/tv/ui"
import { Boundary } from "@/components/tv/boundary"
import { useCatalog } from "@/lib/catalog"
import { isTv, useMode } from "@/lib/device"
import { useLayoutAttr, useLayoutDef } from "@/layouts"
import { useMotion } from "@/lib/motion"
import { useTheme } from "@/lib/theme"
import { useLanguageAttr, useT } from "@/lib/i18n"
import { TrailerModal, closeTrailer, useTrailer } from "@/components/TrailerModal"
import { RecoveryGate } from "@/settings/AccountSync"
import { Toasts } from "@/components/tv/toast"
import { startReminders } from "@/lib/sports/reminders"
import { CardMenu, closeCardMenu, useCardMenu } from "@/components/tv/card-menu"
import { ListModal } from "@/components/tv/list-modal"
import EpisodePage from "@/pages/episode"
import { MatchModal } from "@/components/tv/match-modal"
import { useBackfillMatches } from "@/lib/meta"
import { closeLogoMatch, closeMatch, useLogoMatch, useMatch } from "@/components/tv/match"
import { LogoModal } from "@/components/tv/logo-modal"
import { closeListModal, useListModal } from "@/components/tv/lists"
import { ExitConfirm, askExit, closeExit, useExitAsk } from "@/components/tv/exit-confirm"
import { installNav, useRoute } from "@/lib/nav"
import { CARD_K } from "@/lib/cards"
import { SearchPalette, closePalette, installPaletteKeys, usePalette } from "@/components/tv/search-palette"
import { OnScreenKeyboard, closeKeyboard, installKeyboard, useKbd } from "@/components/tv/keyboard"
import { useApp } from "@/lib/store"
import Browse from "@/pages/browse"
import CategoryPage from "@/pages/category"
import Detail from "@/pages/detail"
import GenrePage from "@/pages/genre"
import HistoryPage from "@/pages/history"
import StatsPage from "@/pages/stats"
import DiagnosticsPage from "@/pages/diagnostics"
import Home from "@/pages/home"
import Library from "@/pages/library"
import Live from "@/pages/live"
import PersonPage from "@/pages/person"
import TeamPage from "@/pages/team"
import Player from "@/pages/player"
import Profiles from "@/pages/profiles"
import LinkPage from "@/pages/link"
import Welcome from "@/pages/welcome"
import Settings from "@/pages/settings"
import Sources from "@/pages/sources"
import Sports from "@/pages/sports"

// after a refresh only the item id is in the URL: rebuild the zapping queue (the channel's category) once the catalog is ready
function RestorePlayer({ id }: { id: string }) {
  const { status, byId, byKind } = useCatalog()
  const back = useRoute((s) => s.back)
  const t = useT()
  const item = byId.get(id)
  if (status === "ready" && !item) return <Empty>{t("common.notFound")} <button data-nav className="ms-3 underline" onClick={back}>{t("common.back")}</button></Empty>
  if (!item) return <Empty>{t("common.loading")}</Empty>
  const queue = item.kind === "live" ? byKind.live.filter((i) => i.group === item.group) : [item]
  return <Player queue={queue} index={queue.indexOf(item)} />
}

// pages rendered inside a layout Shell: their top bar stays put and only [data-page-content] (the Shell's <main>) animates
const SHELL_PAGES = new Set(["home", "live", "sports", "movies", "series", "search", "library", "settings", "category", "genre", "history", "stats", "diagnostics"])

/** Default page per route; a layout can replace any of these via LayoutDef.pages (same props). */
const DEFAULT_PAGES: Record<string, ComponentType<any>> = { // eslint-disable-line @typescript-eslint/no-explicit-any
  profiles: Profiles, welcome: Welcome, link: LinkPage, live: Live, movies: Browse, series: Browse, library: Library, settings: Settings, genre: GenrePage, category: CategoryPage, sports: Sports, person: PersonPage, team: TeamPage, detail: Detail, episode: EpisodePage, history: HistoryPage, stats: StatsPage, diagnostics: DiagnosticsPage,
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
  useLanguageAttr()
  useLayoutAttr()
  const tvScale = useApp((s) => s.settings.tvScale)
  useEffect(() => { document.documentElement.style.setProperty("--tv-scale", String(tvScale)) }, [tvScale])

  // Back: close the PIN prompt / exit prompt first; at the root page on TV ask before leaving the app
  useEffect(() =>
    installNav(() => {
      if (useKbd.getState().el) return closeKeyboard()
      if (usePalette.getState().open) return closePalette()
      const ask = usePinAsk.getState().ask
      if (ask) return ask.resolve(false), usePinAsk.setState({ ask: null })
      if (useCardMenu.getState().cur) return closeCardMenu()
      if (useListModal.getState().cur) return closeListModal()
      if (useMatch.getState().item) return closeMatch()
      if (useLogoMatch.getState().item) return closeLogoMatch()
      if (useTrailer.getState().cur) return closeTrailer()
      if (useExitAsk.getState().open) return closeExit()
      if (!useRoute.getState().back() && isTv) askExit()
    }), [])

  useBackfillMatches()
  useEffect(() => installKeyboard(), [])
  useEffect(() => installPaletteKeys(), [])
  useEffect(() => { startReminders() }, []) // sports reminders while the app is open
  const catNav = useApp((s) => s.settings.catNav ?? "bar")
  useEffect(() => { document.documentElement.dataset.catnav = catNav }, [catNav])
  const cardSize = useApp((s) => s.settings.cardSize ?? "normal"), cardInfo = useApp((s) => s.settings.cardInfo ?? "show")
  useEffect(() => {
    const h = document.documentElement
    h.dataset.cardinfo = cardInfo
    h.style.setProperty("--card-k", String(CARD_K[cardSize]))
  }, [cardSize, cardInfo])

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
      <CardMenu />
      <ListModal />
      <MatchModal />
      <LogoModal />
      <SearchPalette />
      <OnScreenKeyboard />
      <ExitConfirm />
      <RecoveryGate />
      <TrailerModal />
      <Toasts />
    </>
  )
}
