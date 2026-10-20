import { useEffect, useMemo, useRef, useState } from "react"
import { TextInput } from "@/components/tv/text-input"
import { ArrowLeft, Expand, Plus, Volume2, VolumeX, X } from "lucide-react"
import { Pill, RoundButton } from "@/components/gtv"
import { useCatalog } from "@/lib/catalog"
import { useT } from "@/lib/i18n"
import { MULTI_MAX, useMulti } from "@/lib/multi"
import { catsOf, findLock } from "@/lib/merge-pure"
import { useBackStep, useCur, useRoute } from "@/lib/nav"
import { STREAM_QS } from "@/lib/quality"
import { usePData, useProfile } from "@/lib/store"
import type { Item } from "@/lib/types"
import { closePlayer } from "@/player/host"
import { usePlayback } from "@/player/use-playback"
import { useSource } from "@/player/use-source"

/** One live channel in the grid: the player's own stream + engine hooks, muted unless it has the sound. */
function Tile({ item, sound, onSound, onRemove }: { item: Item; sound: boolean; onSound: () => void; onRemove: () => void }) {
  const t = useT()
  const vref = useRef<HTMLVideoElement>(null)
  const S = useSource(item, STREAM_QS[0], {})
  const E = usePlayback({ vref, item, live: true, raw: S.raw, url: S.url, direct: S.direct, toProxy: S.toProxy, src: S.src })
  useEffect(() => { if (vref.current) vref.current.muted = !sound }, [sound])
  return (
    <div className="relative min-h-0 overflow-hidden rounded-2xl bg-black">
      <video ref={vref} playsInline muted className="size-full object-contain" {...E.handlers} />
      {E.buf && !E.err && <div aria-hidden className="pointer-events-none absolute inset-0 m-auto size-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
      {E.err && (
        <div className="absolute inset-0 grid place-items-center gap-2 bg-black/70 p-3 text-center text-sm text-white">
          <span dir="auto">{E.err}</span>
          <Pill data-nav onClick={E.retry}>{t("common.retry")}</Pill>
        </div>
      )}
      <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent p-2">
        <span dir="auto" className="min-w-0 flex-1 truncate text-sm text-white">{item.name}</span>
        <RoundButton label={t("pages.multi.sound")} active={sound} className="size-9" onClick={onSound}>{sound ? <Volume2 /> : <VolumeX />}</RoundButton>
        <RoundButton label={t("pages.multi.full")} className="size-9" onClick={() => useRoute.getState().go("player", { queue: [item], index: 0 })}><Expand /></RoundButton>
        <RoundButton label={t("pages.multi.remove")} className="size-9" onClick={onRemove}><X /></RoundButton>
      </div>
    </div>
  )
}

/** Channel picker: favourites first, or a name search; channels in PIN-locked categories never show. */
function Picker({ have, onPick, onClose }: { have: string[]; onPick: (i: Item) => void; onClose: () => void }) {
  const t = useT()
  const live = useCatalog((s) => s.byKind.live), p = useProfile(), favs = usePData().favs
  const [q, setQ] = useState("")
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = s ? live.filter((i) => i.name.toLowerCase().includes(s)) : [...live.filter((i) => favs.includes(i.id)), ...live]
    return [...new Set(list)].filter((i) => !have.includes(i.id) && !(p?.pin && catsOf(i).some((c) => findLock(p.locked, "live", c)))).slice(0, 40)
  }, [q, live, favs, have, p])
  return (
    <div data-modal role="dialog" aria-modal="true" aria-label={t("pages.multi.add")} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-full w-full max-w-[32rem] flex-col gap-3 rounded-[28px] bg-surface p-6 shadow-2xl">
        <TextInput unstyled data-nav data-autofocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("pages.multi.search")} aria-label={t("pages.multi.search")} dir="auto" className="min-h-11 rounded-full bg-surface-2 px-4 text-base outline-none" />
        <div data-nav-group className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          {rows.map((i) => <Pill key={i.id} data-nav className="w-full justify-start" onClick={() => onPick(i)}><span dir="auto" className="truncate">{i.name}</span></Pill>)}
          {!rows.length && <div className="py-2 text-center text-muted-foreground">{t("pages.multi.none")}</div>}
        </div>
        <Pill data-nav className="w-full" onClick={onClose}>{t("common.cancel")}</Pill>
      </div>
    </div>
  )
}

/** Up to four live channels side by side, one with sound. Entered from the player's Multiview button; leaves the player closed so it holds no provider connection. */
export default function MultiviewPage() {
  const t = useT()
  const { ids, add, remove } = useMulti()
  const byId = useCatalog((s) => s.byId)
  const top = useCur().name === "multi" // a page under the full-screen player keeps its tiles mounted otherwise
  const [pick, setPick] = useState(false)
  const [sound, setSound] = useState(ids[0])
  useEffect(() => { closePlayer() }, [])
  useBackStep(pick, () => setPick(false))
  const items = ids.map((id) => byId.get(id)).filter((i): i is Item => !!i)
  const snd = items.some((i) => i.id === sound) ? sound : items[0]?.id
  const cols = items.length > 1 ? "landscape:grid-cols-2" : ""
  return (
    <div className="fixed inset-0 z-10 flex flex-col gap-3 bg-black p-3 pt-[max(0.75rem,var(--safe-t))] text-white">
      <div className="flex items-center gap-3">
        <RoundButton label={t("player.back")} onClick={() => useRoute.getState().back()}><ArrowLeft className="rtl-flip" /></RoundButton>
        <div className="flex-1 text-xl font-semibold">{t("pages.multi.title")}</div>
        {items.length < MULTI_MAX && <Pill data-nav data-autofocus="" variant="primary" onClick={() => setPick(true)}><Plus className="size-4" />{t("pages.multi.add")}</Pill>}
      </div>
      {items.length === 0 && <div className="grid flex-1 place-items-center text-center text-white/70">{t("pages.multi.empty")}</div>}
      <div className={`grid min-h-0 flex-1 auto-rows-fr gap-3 ${cols}`}>
        {top && items.map((i) => <Tile key={i.id} item={i} sound={i.id === snd} onSound={() => setSound(i.id)} onRemove={() => remove(i.id)} />)}
      </div>
      {pick && <Picker have={ids} onPick={(i) => { add(i.id); setSound((s) => s ?? i.id); setPick(false) }} onClose={() => setPick(false)} />}
    </div>
  )
}
