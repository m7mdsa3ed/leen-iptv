import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react"
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
import { WarmUp } from "@/components/tv/warmup"
import { ScreenSaver } from "@/components/tv/screensaver"
import { startReminders } from "@/lib/sports/reminders"
import { startEpisodeWatch } from "@/lib/new-episodes"
import { CardMenu, closeCardMenu, useCardMenu } from "@/components/tv/card-menu"
import { ListModal } from "@/components/tv/list-modal"
import { FilterPanel, closeFilterPanel, useFilterPanel } from "@/components/tv/filter-panel"
import { MatchModal } from "@/components/tv/match-modal"
import { useBackfillMatches } from "@/lib/meta"
import { closeLogoMatch, closeMatch, useLogoMatch, useMatch } from "@/components/tv/match"
import { LogoModal } from "@/components/tv/logo-modal"
import { closeListModal, useListModal } from "@/components/tv/lists"
import { ExitConfirm, askExit, closeExit, useExitAsk } from "@/components/tv/exit-confirm"
import { backStep, hasBackStep, installNav, useRoute } from "@/lib/nav"
import { CARD_K } from "@/lib/cards"
import { SearchPalette, closePalette, installPaletteKeys, usePalette } from "@/components/tv/search-palette"
import { OnScreenKeyboard, closeKeyboard, installKeyboard, useKbd } from "@/components/tv/keyboard"
import { useApp } from "@/lib/store"
import type { Item } from "@/lib/types"
import Browse from "@/pages/browse"
import CategoryPage from "@/pages/category"
import Detail from "@/pages/detail"
import GenrePage from "@/pages/genre"
import MultiviewPage from "@/pages/multiview"
import HistoryPage from "@/pages/history"
import StatsPage from "@/pages/stats"
import DiagnosticsPage from "@/pages/diagnostics"
import Home from "@/pages/home"
import Live from "@/pages/live"
import PersonPage from "@/pages/person"
import TeamPage from "@/pages/team"
import MatchPage from "@/pages/match"
import LeaguePage from "@/pages/league"
import { PlayerHost, PlayerRoute } from "@/player/host"
import Profiles from "@/pages/profiles"
import LinkPage from "@/pages/link"
import Welcome from "@/pages/welcome"
import Settings from "@/pages/settings"
import Sources from "@/pages/sources"
import Sports from "@/pages/sports"

// after a refresh only the item id is in the URL: rebuild the zapping queue (the channel's category) once the catalog is ready
function RestorePlayer({ id }: { id: string }) {
  const status = useCatalog((s) => s.status)
  const item = useCatalog((s) => s.byId.get(id))
  const back = useRoute((s) => s.back)
  const t = useT()
  if (status === "ready" && !item) return <Empty>{t("common.notFound")} <button data-nav className="ms-3 underline" onClick={back}>{t("common.back")}</button></Empty>
  if (!item) return <Empty>{t("common.loading")}</Empty>
  return <RestoreQueue item={item} />
}
function RestoreQueue({ item }: { item: Item }) {
  const live = useCatalog((s) => (item.kind === "live" ? s.byKind.live : undefined)) // only a channel needs the live list (its zapping queue)
  const queue = useMemo(() => (live ? live.filter((i) => i.group === item.group) : [item]), [live, item])
  return <PlayerRoute queue={queue} index={queue.indexOf(item)} />
}

// pages rendered inside a layout Shell: their top bar stays put and only [data-page-content] (the Shell's <main>) animates
const SHELL_PAGES = new Set(["home", "live", "sports", "movies", "series", "search", "settings", "category", "genre", "history", "stats", "diagnostics", "detail", "person", "team", "match", "league"])

/** Default page per route; a layout can replace any of these via LayoutDef.pages (same props). */
const DEFAULT_PAGES: Record<string, ComponentType<any>> = { // eslint-disable-line @typescript-eslint/no-explicit-any
  profiles: Profiles, welcome: Welcome, link: LinkPage, live: Live, movies: Browse, series: Browse, settings: Settings, genre: GenrePage, category: CategoryPage, sports: Sports, person: PersonPage, team: TeamPage, match: MatchPage, league: LeaguePage, detail: Detail, history: HistoryPage, stats: StatsPage, diagnostics: DiagnosticsPage, multi: MultiviewPage,
}

const Page = memo(function Page({ r }: { r: { name: string; p?: Record<string, unknown> } }) {
  const over = useLayoutDef().pages
  const p = r.p ?? {}
  switch (r.name) {
    case "sources": return <Sources />
    case "home": return <Home />
    case "player": return p.queue ? <PlayerRoute queue={p.queue as never} index={p.index as number} start={!!p.start} /> : <RestorePlayer id={p.id as string} />
  }
  const C = over?.[r.name as keyof typeof over] ?? DEFAULT_PAGES[r.name]
  if (!C) return null
  // props are the same for default and override
  return <C {...(r.name === "movies" ? { kind: "movie" } : r.name === "series" ? { kind: "series" } : p)} />
})

/* A stacked page under the top one is frozen: Gate suspends it, so React keeps its DOM, state and effects but renders none of its
   updates (progress saves, catalog merges, metadata landings) until it is on top again. A page that starts hidden (a refresh on #/detail) first renders when revealed. */
const never = new Promise<never>(() => {})
function Gate({ frozen, children }: { frozen: boolean; children: ReactNode }) {
  if (frozen) throw never
  return children
}

/** Tab roots kept mounted after you navigate away from them (not stacked: a TAB switch). Switching tabs used to unmount the page, so coming
    back re-ran its data hooks, rebuilt every card and reloaded its artwork; kept here, they stay warm (hidden, and frozen while off screen).
    A page with an open inner step of its own (the Settings sidebar sheet, a profile form) must keep running instead: a frozen page would never
    register its steps, and Back would skip them. */
const KEEP = 4
const TAB_ROOT = new Set(["home", "live", "sports", "movies", "series"])
/** The entrance class is dropped once played: display none->block would otherwise replay it when a page is revealed again. */
const endAnim = (e: React.AnimationEvent<HTMLElement>) => {
  if (e.target === e.currentTarget || (e.target as HTMLElement).hasAttribute("data-page-content")) e.currentTarget.classList.remove("m-rise", "page-enter")
}
function TabViews({ stack, top, warming }: { stack: { name: string; p?: Record<string, unknown> }[]; top: number; warming: boolean }) {
  const root = stack[0]
  const [kept, setKept] = useState<string[]>(["home"]) // last opened first; home goes when it falls out, so a refresh is cheap
  useEffect(() => {
    const k = root.name
    if (!TAB_ROOT.has(k)) return
    setKept((old) => (old[0] === k ? old : [k, ...old.filter((x) => x !== k)].slice(0, KEEP)))
  }, [root.name])
  const shownHere = top === 0 ? root.name : undefined
  const names = shownHere && !kept.includes(shownHere) ? [shownHere, ...kept] : kept // first render of a new tab paints it in the same frame
  // a hidden tab that left a step open stays RUNNING: it has to observe its own step closing, and a frozen page renders no updates
  const live = useBackStepLive()
  return (
    <>
      {names.map((n) => (
        <div key={`tab:${n}`} className="page-enter absolute inset-0" style={{ display: n === shownHere ? "block" : "none" }} onAnimationEnd={endAnim}>
          <Suspense fallback={null}>
            <Gate frozen={warming || (n !== shownHere && !live(n))}>{n === "home" ? <Home /> : <Page r={{ name: n }} />}</Gate>
          </Suspense>
        </div>
      ))}
    </>
  )
}

/** Which cached tab has an open Back step right now (see useBackStep): only that one, plus the visible one, is allowed to render. */
function useBackStepLive() {
  const [, bump] = useState(0)
  useEffect(() => useRoute.subscribe(() => bump((n) => n + 1)), []) // a route change is when a step usually opens or closes
  return useCallback((name: string) => hasBackStep() && name === useRoute.getState().stack[0].name, [])
}

export default function App() {
  const stack = useRoute((s) => s.stack)
  const profileId = useApp((s) => s.profileId)
  const sources = useApp((s) => s.sources)
  const last = useRef(new Map<number, HTMLElement>())
  const top = stack.length - 1
  const warming = useCatalog((s) => s.warm !== "off") // first load of the session: pages wait behind the warm-up screen (frozen, so nothing renders a half catalog)
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
      if (useFilterPanel.getState().kind) return closeFilterPanel()
      if (useMatch.getState().item) return closeMatch()
      if (useLogoMatch.getState().item) return closeLogoMatch()
      if (useTrailer.getState().cur) return closeTrailer()
      if (useExitAsk.getState().open) return closeExit()
      if (backStep()) return
      if (!useRoute.getState().back() && isTv) askExit()
    }), [])

  useBackfillMatches()
  useEffect(() => installKeyboard(), [])
  useEffect(() => installPaletteKeys(), [])
  useEffect(() => { startReminders(); startEpisodeWatch() }, []) // sports alerts + new episodes while the app is open
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
    const f = (e: FocusEvent) => { if (e.target instanceof HTMLElement && e.target.hasAttribute("data-nav") && !e.target.closest("[data-modal]")) last.current.set(useRoute.getState().stack.length - 1, e.target) } // not a dialog's buttons: they are gone when Back returns here
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
  }, [top, stack[top]?.name, warming])

  // stacked pages stay mounted (scroll + focus preserved), only the top is visible; the stack's root is a cached tab view instead
  return (
    <>
      <TabViews stack={stack} top={top} warming={warming} />
      {stack.map((r, i) => i === 0 ? null : (
        <div key={`${i}:${r.name}`} className={`${SHELL_PAGES.has(r.name) ? "page-enter" : "m-rise"} absolute inset-0`} style={{ display: i === top ? "block" : "none" }} onAnimationEnd={endAnim}>
          <Suspense fallback={null}><Gate frozen={i !== top || warming}><Boundary><Page r={r} /></Boundary></Gate></Suspense>
        </div>
      ))}
      {warming && <WarmUp />}
      <PlayerHost />
      <PinModal />
      <CardMenu />
      <ListModal />
      <FilterPanel />
      <MatchModal />
      <LogoModal />
      <ExitConfirm />
      <RecoveryGate />
      <TrailerModal />
      <SearchPalette />
      <OnScreenKeyboard />
      <Toasts />
      <ScreenSaver />
    </>
  )
}
