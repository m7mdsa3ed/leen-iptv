import { useEffect, useState } from "react"
import { Check, Image, List, Plus, Star, Trash2 } from "lucide-react"
import { Pill } from "@/components/gtv"
import { focusFirst } from "@/lib/nav"
import { useApp, useLists, usePData } from "@/lib/store"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { closeListModal, useListModal } from "./lists"
import { isSubmit } from "./keyboard"
import { openLogoMatch } from "./match"
import { logoKey } from "@/lib/logos-pure"

/** Create / delete custom live lists, and toggle the focused channel in or out of each. Opened from the group pills ("+") or a channel row (green key / long-press). */
export function ListModal() {
  const cur = useListModal((s) => s.cur)
  const t = useT()
  const lists = useLists()
  const favs = usePData().favs
  const saveList = useApp((s) => s.saveList)
  const removeList = useApp((s) => s.removeList)
  const toggleListChannel = useApp((s) => s.toggleListChannel)
  const toggleFav = useApp((s) => s.toggleFav)
  const [name, setName] = useState("")
  useEffect(() => { setName(""); if (cur) requestAnimationFrame(focusFirst) }, [cur])
  if (!cur) return null
  const item = cur.item
  const create = () => { const n = name.trim(); if (!n) return; saveList(n, item ? [item.id] : []); setName("") }
  const fav = !!item && favs.includes(item.id)
  return (
    <div data-modal role="dialog" aria-modal="true" aria-label={t("nav.lists.title")} className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && closeListModal()}>
      <div className="my-auto flex w-full max-w-[28rem] flex-col gap-4 rounded-[28px] bg-surface p-6 shadow-2xl">
        <div className="text-center text-2xl font-semibold">{t("nav.lists.title")}</div>
        {item && <div dir="auto" className="truncate text-center text-base text-muted-foreground">{item.name}</div>}
        {item && (
          <Pill data-nav variant={fav ? "primary" : "tonal"} className="w-full" onClick={() => toggleFav(item.id)}>
            <Star className={fav ? "size-4 fill-current" : "size-4"} />{t("nav.lists.favorite")}
          </Pill>
        )}
        {item?.kind === "live" && logoKey(item.name) && (
          <Pill data-nav variant="tonal" className="w-full" onClick={() => { closeListModal(); openLogoMatch(item) }}>
            <Image className="size-4" />{t("nav.logo.title")}
          </Pill>
        )}
        <div className="flex flex-col gap-2" data-nav-group>
          {lists.length === 0 && <div className="py-2 text-center text-muted-foreground">{t("nav.lists.empty")}</div>}
          {lists.map((l) => {
            const inList = !!item && l.items.includes(item.id)
            return (
              <div key={l.name} className="flex items-center gap-2">
                <button data-nav aria-pressed={inList} onClick={() => item && toggleListChannel(l.name, item.id)}
                  className={cn("flex min-h-11 flex-1 items-center gap-2 rounded-full px-4 text-start text-base", inList ? "bg-accent-blue-container text-foreground" : "bg-surface-2 text-foreground/80")}>
                  {item ? (inList ? <Check className="size-4 shrink-0" /> : <Plus className="size-4 shrink-0" />) : <List className="size-4 shrink-0" />}
                  <bdi className="min-w-0 flex-1 truncate">{l.name}</bdi>
                  <span dir="ltr" className="text-sm text-muted-foreground">{l.items.length}</span>
                </button>
                <button data-nav aria-label={t("nav.lists.delete")} onClick={() => removeList(l.name)} className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-foreground/70"><Trash2 className="size-4" /></button>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <input data-nav value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (isSubmit(e)) create() }} placeholder={t("nav.lists.name")} aria-label={t("nav.lists.name")} dir="auto" className="min-h-11 flex-1 rounded-full bg-surface-2 px-4 text-base outline-none" />
          <Pill data-nav variant="primary" onClick={create}><Plus className="size-4" />{t("nav.lists.create")}</Pill>
        </div>
        <Pill data-nav className="w-full" onClick={closeListModal}>{t("common.cancel")}</Pill>
      </div>
    </div>
  )
}
