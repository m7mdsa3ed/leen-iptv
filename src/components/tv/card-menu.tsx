import { useEffect } from "react"
import { create } from "zustand"
import { Pill } from "@/components/gtv"
import { useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"
import { focusFirst } from "@/lib/nav"
import type { Item } from "@/lib/types"

/** Long-press menu for a card (hold OK on TV, long-press / right-click elsewhere). Back or Cancel closes it. */
type Act = { label: string; run: () => void }
export const useCardMenu = create<{ cur: null | { item: Item; acts: Act[] } }>(() => ({ cur: null }))
export const openCardMenu = (item: Item, acts: Act[]) => useCardMenu.setState({ cur: { item, acts } })
export const closeCardMenu = () => useCardMenu.setState({ cur: null })

/** Long-press handler for a card that is in progress (Continue watching): the menu offers to remove it. undefined = nothing to offer, the card has no menu. */
export function useRemoveMenu(item: Item) {
  const t = useT()
  const on = useApp((s) => { const p = s.profileId ? s.data[s.profileId]?.progress[item.id] : undefined; return !!p && p.dur > 0 && p.pos > 30 && p.pos / p.dur < 0.95 })
  return on ? () => openCardMenu(item, [{ label: t("common.removeContinue"), run: () => useApp.getState().markSeen([{ id: item.id }], false) }]) : undefined
}

export function CardMenu() {
  const cur = useCardMenu((s) => s.cur)
  const t = useT()
  useEffect(() => { if (cur) requestAnimationFrame(focusFirst) }, [cur])
  if (!cur) return null
  return (
    <div data-modal role="dialog" aria-modal="true" aria-label={cur.item.name} className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && closeCardMenu()}>
      <div className="my-auto flex w-full max-w-[26rem] flex-col gap-3 rounded-[28px] bg-surface p-6 shadow-2xl">
        <div dir="auto" className="truncate text-center text-2xl font-semibold">{cur.item.name}</div>
        <div className="flex flex-col gap-3" data-nav-group>
          {cur.acts.map((a, n) => <Pill key={a.label} data-autofocus={n === 0 ? "" : undefined} variant={n === 0 ? "primary" : "tonal"} className="w-full" onClick={() => { closeCardMenu(); a.run() }}>{a.label}</Pill>)}
          <Pill className="w-full" onClick={closeCardMenu}>{t("common.cancel")}</Pill>
        </div>
      </div>
    </div>
  )
}
