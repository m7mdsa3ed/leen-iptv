import { useEffect, useRef } from "react"
import { Empty, PinModal, usePinAsk, focusFirstSoon } from "@/components/tv/ui"
import { Boundary } from "@/components/tv/boundary"
import { useCatalog } from "@/lib/catalog"
import { isTv, useMode } from "@/lib/device"
import { useTheme } from "@/lib/theme"
import { installNav, useRoute } from "@/lib/nav"
import { useApp, useSource } from "@/lib/store"
import Browse from "@/pages/browse"
import CategoryPage from "@/pages/category"
import Detail from "@/pages/detail"
import GenrePage from "@/pages/genre"
import Guide from "@/pages/guide"
import Home from "@/pages/home"
import Live from "@/pages/live"
import PersonPage from "@/pages/person"
import Player from "@/pages/player"
import Profiles from "@/pages/profiles"
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

function Page({ r }: { r: { name: string; p?: Record<string, unknown> } }) {
  switch (r.name) {
    case "profiles": return <Profiles />
    case "sources": return <Sources />
    case "home": return <Home />
    case "live": return <Live />
    case "guide": return <Guide />
    case "movies": return <Browse kind="movie" />
    case "series": return <Browse kind="series" />
    case "search": return <Search />
    case "settings": return <Settings />
    case "genre": return <GenrePage id={r.p!.id as string} />
    case "category": return <CategoryPage id={r.p!.id as string} />
    case "person": return <PersonPage id={r.p!.id as string | undefined} name={r.p!.name as string | undefined} />
    case "detail": return <Detail id={r.p!.id as string} />
    case "player": return r.p!.queue ? <Player queue={r.p!.queue as never} index={r.p!.index as number} /> : <RestorePlayer id={r.p!.id as string} />
    default: return null
  }
}

export default function App() {
  const stack = useRoute((s) => s.stack)
  const profileId = useApp((s) => s.profileId)
  const src = useSource()
  const last = useRef(new Map<number, HTMLElement>())
  const top = stack.length - 1
  useMode() // keeps html[data-mode] in sync on resize
  useTheme()
  const tvScale = useApp((s) => s.settings.tvScale)
  useEffect(() => { document.documentElement.style.setProperty("--tv-scale", String(tvScale)) }, [tvScale])

  // exit-on-back at root, close PIN prompt first
  useEffect(() =>
    installNav(() => {
      const ask = usePinAsk.getState().ask
      if (ask) return ask.resolve(false), usePinAsk.setState({ ask: null })
      const { stack, back } = useRoute.getState()
      if (!back() && isTv && stack[0].name !== "profiles") window.close()
    }), [])

  // (re)load the catalog when the active source or profile changes
  useEffect(() => {
    if (profileId && src) void useCatalog.getState().load(src, useApp.getState().settings.proxy)
  }, [profileId, src?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // stacked pages stay mounted (scroll + focus preserved), only the top is visible
  return (
    <>
      {stack.map((r, i) => (
        <div key={i} className="absolute inset-0" style={{ display: i === top ? "block" : "none" }}>
          <Boundary><Page r={r} /></Boundary>
        </div>
      ))}
      <PinModal />
    </>
  )
}
