import { useMemo } from "react"
import { List, ListPlus, Lock, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { KEY } from "@/lib/nav"
import { useApp, useLists, usePData, useProfile } from "@/lib/store"
import { useCatalog } from "@/lib/catalog"
import { useActiveFilter, useCatalogView, inSource } from "@/layouts/hooks/use-source-filter"
import { findLock } from "@/lib/merge-pure"
import type { Kind } from "@/lib/types"
import { useMode } from "@/lib/device"
import { useT } from "@/lib/i18n"
import { askPin, CatCount, groupLabel, useCatSide } from "./ui"
import { openListModal } from "./lists"

export { liveRowMenu } from "./lists"

export const FAV = "Favorites"
export const ALL = "All"

/** Titles behind each category pill, counted like the pages list them (picked sources only): All, Favorites, the user's live lists, categories. undefined = no count (genre pills). Shown in the sidebar. */
export function useGroupCount(kind: Kind) {
  const { byKind } = useCatalogView()
  const byId = useCatalog((s) => s.byId)
  const favs = usePData().favs
  const lists = useLists()
  const filter = useActiveFilter()
  const m = useMemo(() => {
    const m = new Map<string, number>([[ALL, byKind[kind].length]])
    for (const i of byKind[kind]) m.set(i.group, (m.get(i.group) ?? 0) + 1)
    m.set(FAV, favs.filter((id) => { const i = byId.get(id); return i?.kind === kind && inSource(i, filter) }).length) // via byId, like the pages: favorites of merged copies count
    if (kind === "live") { const ids = new Set(byKind.live.map((i) => i.id)); for (const l of lists) m.set(l.name, l.items.filter((id) => ids.has(id)).length) }
    return m
  }, [byKind, kind, byId, favs, lists, filter])
  return (g: string) => m.get(g)
}

/** Category pill row (all modes). Yellow key toggles the parental lock on the focused category. */
export function GroupList({ kind, groups, active, onPick }: { kind: Kind; groups: string[]; active: string; onPick: (g: string) => void }) {
  const p = useProfile()
  const t = useT()
  const toggleLock = useApp((s) => s.toggleLock)
  const lists = useLists()
  const isList = (g: string) => lists.some((l) => l.name === g)
  const list = [FAV, ALL, ...groups]
  const lockKey = (g: string) => findLock(p?.locked ?? [], kind, g)
  const mode = useMode()
  const ref = useCatSide()
  const count = useGroupCount(kind)
  const toggle = async (g: string) => {
    if (g === FAV || g === ALL || !p?.pin) return
    const k = lockKey(g)
    if (k && !(await askPin(p.pin))) return
    toggleLock(k ?? `${kind}|${g}`)
  }
  const onKey = (e: React.KeyboardEvent, g: string) => { if (e.keyCode === KEY.yellow) toggle(g) }
  // right-click / touch long-press (contextmenu) toggles the lock outside tv
  const onCtx = (e: React.MouseEvent, g: string) => { if (mode !== "tv" && p?.pin && g !== FAV && g !== ALL) { e.preventDefault(); toggle(g) } }
  return (
    <div ref={ref} className="cat-side shrink-0">
      <div data-nav-group className="rail no-scrollbar -mb-2 !gap-2">
        {list.map((g) => (
          <button key={g} data-nav data-pill aria-pressed={g === active} onKeyDown={(e) => onKey(e, g)} onContextMenu={(e) => onCtx(e, g)} onClick={() => onPick(g)}
            className={cn("flex min-h-11 shrink-0 items-center gap-2 rounded-full px-5 py-2 text-base", g === active ? "bg-accent-blue-container text-foreground" : "bg-surface-2 text-foreground/80")}>
            {g === FAV && <Star className="size-4" />}
            {isList(g) && <List className="size-4" />}
            {lockKey(g) && <Lock className="size-4" />}
            <bdi>{groupLabel(g, t)}</bdi>
            <CatCount n={count(g)} />
          </button>
        ))}
        {kind === "live" && (
          <button data-nav data-pill onClick={() => openListModal()} className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-5 py-2 text-base text-foreground/80">
            <ListPlus className="size-4" /><bdi>{t("nav.lists.new")}</bdi>
          </button>
        )}
      </div>
      {p?.pin && mode !== "mobile" && <div className="text-sm text-muted-foreground">{t(mode === "tv" ? "nav.groups.hintTv" : "nav.groups.hintPtr")}</div>}
    </div>
  )
}
