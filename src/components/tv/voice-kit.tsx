import { useMemo, type ReactNode, type WheelEvent } from "react"
import { Card, Pill, Rail } from "@/components/gtv"
import { useOpen } from "@/components/tv/ui"
import { locked } from "@/lib/agent/pure"
import type { UiKit } from "@/lib/agent/library"
import { dockVoice } from "@/lib/agent/ui"
import { useCatalog } from "@/lib/catalog"
import { useProfile } from "@/lib/store"
import type { Item } from "@/lib/types"

/** The visual parts of the OpenUI library (lib/agent/library.ts). Two sizes of the same parts: `kit` for the voice window (full screen, big type, the
    app's own rails) and `chatKit` for the chat panel (one card per answer, small type, small posters, a row that scrolls inside the card).
    Ids the model wrote are resolved against the live catalog here: unknown ones draw nothing, and titles in a PIN-locked category are never shown. */
function useShelfItems(ids: string[]): { items: Item[]; open: (i: Item) => void } {
  const byId = useCatalog((s) => s.byId)
  const primaryOf = useCatalog((s) => s.primaryOf)
  const profile = useProfile()
  const open = useOpen()
  const items = useMemo(() => ids.map((id) => { const i = byId.get(id); return i ? primaryOf.get(id) ?? i : undefined }).filter((i): i is Item => !!i && !locked(profile, i)), [ids, byId, primaryOf, profile])
  return { items, open: (i) => void open(i, items).then(dockVoice) }
}

function Shelf({ title, ids, wide }: { title: string; ids: string[]; wide: boolean }) {
  const { items, open } = useShelfItems(ids)
  if (!items.length) return null
  return (
    <Rail title={title}>
      {items.map((i) => <Card key={i.id} item={i} variant={wide ? "wide" : "poster"} onOpen={open} />)}
    </Rail>
  )
}

const Screen = ({ title, children }: { title?: string; children?: ReactNode }) => (
  <div className="flex flex-col gap-6">
    {title && <h2 dir="auto" className="text-3xl font-medium tracking-tight">{title}</h2>}
    {children}
  </div>
)
const Note = ({ text }: { text: string }) => <p dir="auto" className="text-xl text-pretty text-muted-foreground">{text}</p>
const Chips = ({ options, pick }: { options: string[]; pick: (label: string) => void }) => (
  <div data-nav-group className="flex flex-wrap gap-3">{options.map((o) => <Pill key={o} onClick={() => pick(o)}>{o}</Pill>)}</div>
)

export const kit: UiKit = { Screen, Shelf, Note, Chips }

/* ---------- chat ---------- */
// a mouse wheel scrolls the row sideways (desktop only, like the app's rails; RTL has a negative scrollLeft)
const wheel = (e: WheelEvent<HTMLDivElement>) => {
  const el = e.currentTarget
  if (document.documentElement.dataset.mode !== "desktop" || e.deltaX || el.scrollWidth <= el.clientWidth) return
  el.scrollLeft += document.documentElement.dir === "rtl" ? -e.deltaY : e.deltaY
}

function ChatShelf({ title, ids, wide }: { title: string; ids: string[]; wide: boolean }) {
  const { items, open } = useShelfItems(ids)
  if (!items.length) return null
  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <h3 dir="auto" className="text-sm font-medium text-muted-foreground">{title}</h3>
      {/* bleeds to the card's edges (the card pads 1rem) and snaps card by card; the focus ring has room above and below */}
      <div data-nav-group onWheel={wheel} className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 py-1.5 [scroll-padding-inline:1rem]">
        {items.map((i) => <Card key={i.id} item={i} variant={wide ? "wide" : "poster"} onOpen={open} className={wide ? "w-44 snap-start" : "w-[6.75rem] snap-start"} />)}
      </div>
    </section>
  )
}

const ChatScreen = ({ title, children }: { title?: string; children?: ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-4 rounded-3xl bg-white/[.04] p-4 ring-1 ring-inset ring-white/10">
    {title && <h2 dir="auto" className="text-xl font-semibold leading-snug tracking-tight text-pretty">{title}</h2>}
    {children}
  </div>
)
const ChatNote = ({ text }: { text: string }) => <p dir="auto" className="text-base leading-relaxed text-pretty text-muted-foreground">{text}</p>
const ChatChips = ({ options, pick }: { options: string[]; pick: (label: string) => void }) => (
  <div data-nav-group className="flex flex-wrap gap-2">{options.map((o) => <Pill key={o} onClick={() => pick(o)} className="min-h-9 px-4 py-1.5 text-sm">{o}</Pill>)}</div>
)

export const chatKit: UiKit = { Screen: ChatScreen, Shelf: ChatShelf, Note: ChatNote, Chips: ChatChips }
