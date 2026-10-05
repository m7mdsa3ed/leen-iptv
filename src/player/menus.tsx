import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ArrowLeft, Check, ChevronRight } from "lucide-react"
import { Pill } from "@/components/gtv"
import { useLang, useT } from "@/lib/i18n"
import { STREAM_QS, type StreamQ } from "@/lib/quality"
import { useApp } from "@/lib/store"
import { useCatalog } from "@/lib/catalog"
import { downloadSub, searchSubs, subQuery } from "@/lib/subs"
import { DEFAULT_SUB_LANGS, SUB_LANGS, type SubHit, type SubProvider, type SubQuery } from "@/lib/subs-pure"
import type { Item as CatalogItem } from "@/lib/types"
import type { Track } from "./use-engine"
import { FITS, SLEEP_MIN, SPEEDS, SUB_STYLE, setPrefs, usePrefs, type SubStyleKey } from "./prefs"
import { speedLabel } from "./util"
import { qualityMetrics, qualitySummary, type Stats } from "./stats"

export type MenuKind = "av" | "settings" | "audio" | "subs" | "quality" | "speed" | "aspect" | "sleep" | "subStyle" | "subSearch" | "info" | "variant"

/** One rounded sheet for every player menu. [data-modal] keeps the D-pad inside; focus enters the active item ([data-autofocus]). */
function Sheet({ title, onClose, onBack, children }: { title: string; onClose: () => void; onBack?: () => void; children: ReactNode }) {
  const t = useT()
  return (
    <div data-modal role="dialog" aria-label={title} className="absolute inset-0 z-20 flex items-end justify-center bg-black/60 m-fade sm:items-center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pl-sheet m-pop flex max-h-[85%] w-[28rem] max-w-full flex-col gap-2 overflow-y-auto rounded-t-[var(--pl-r)] bg-surface p-5 pb-[max(1.25rem,var(--safe-b))] text-foreground shadow-2xl sm:rounded-[var(--pl-r)]">
        <div className="mb-1 flex items-center gap-2">
          {onBack && <Pill variant="ghost" aria-label={t("player.back")} className="pl-act !px-3" onClick={onBack}><ArrowLeft className="rtl-flip" /></Pill>}
          <div className="pl-title">{title}</div>
        </div>
        {children}
        <Pill variant="ghost" className="pl-act justify-start" onClick={onClose}>{t("player.close")}</Pill>
      </div>
    </div>
  )
}

function Item({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Pill role="menuitemradio" aria-checked={active} data-autofocus={active ? "" : undefined} className={`pl-btn pl-act w-full justify-between rounded-[calc(var(--pl-r)*.6)] text-start ${active ? "font-semibold" : ""}`} onClick={onClick}>
      <span className="min-w-0 truncate">{children}</span>
      {active && <Check aria-hidden />}
    </Pill>
  )
}

function TrackItem({ track, active, onClick }: { track: Track; active: boolean; onClick: () => void }) {
  const t = useT()
  const flag = (f: string) => f === "default" || f === "forced" || f === "sdh" ? t(`player.track.${f}`) : f
  return <Item active={active} onClick={onClick}><span className="flex min-w-0 flex-col"><bdi className="truncate">{track.label}</bdi>{(track.detail || track.flags?.length) && <span className="truncate text-xs font-normal text-muted-foreground">{[track.detail, track.flags?.map(flag).join(" · ")].filter(Boolean).join(" · ")}</span>}</span></Item>
}

export type MenuProps = {
  menu: MenuKind
  audio: Track[]; audioSel: number; onAudio: (i: number) => void
  subs: Track[]; subSel: number; onSub: (i: number) => void
  subSize: number; onSubSize: (d: number) => void
  subOffset: number | null; onSubOffset: (d: number) => void // null: this subtitle cannot be shifted (burned in / stream track)
  item: CatalogItem; ext: string | null; onExt: (vtt: string, label: string) => void // ext = label of the subtitle fetched online
  sq: StreamQ; onQuality: (q: StreamQ) => void
  stats: Stats | null; speed: number; onSpeed: (n: number) => void
  fit: number; onFit: (i: number) => void
  sleepMin: number; onSleep: (n: number) => void // 0 = off, else the chosen preset in minutes
  live: boolean; mediaServer: boolean // which Settings rows exist
  isFav: boolean; onFav: () => void; canPip: boolean; pip: boolean; onPip: () => void
  variants: { item: CatalogItem; src?: string }[]; onVariant: (i: CatalogItem) => void // live: the grouped variants of this channel (empty = not grouped)
  onMenu: (m: MenuKind) => void
  onBack?: () => void // set when this sheet was opened from another one (Settings > Speed): its back arrow, and Back on the remote, return to that sheet
  onClose: () => void
}

/** Settings row: name, current value, chevron; opens that picker. */
function Row({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <Pill className="pl-btn pl-act w-full justify-between gap-4 rounded-[calc(var(--pl-r)*.6)] text-start" onClick={onClick}>
      <span className="min-w-0 truncate">{label}</span>
      <span className="ms-auto flex shrink-0 items-center gap-1 text-white/60"><bdi dir="auto">{value}</bdi><ChevronRight className="rtl-flip" /></span>
    </Pill>
  )
}

/** Settings on/off row: name, check while on. */
function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <Pill aria-pressed={on} className="pl-btn pl-act w-full justify-between gap-4 rounded-[calc(var(--pl-r)*.6)] text-start" onClick={onClick}>
      <span className="min-w-0 truncate">{label}</span>
      {on && <Check aria-hidden />}
    </Pill>
  )
}

const Heading = ({ children }: { children: ReactNode }) => <div className="mt-2 px-1 text-sm font-medium uppercase tracking-wide text-white/60">{children}</div>

function Step({ label, value, onStep }: { label: string; value: string; onStep: (d: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-1" dir="ltr">
      <span className="me-auto">{label}</span>
      <Pill className="pl-btn pl-act" onClick={() => onStep(-1)} aria-label={`${label} -`}>-</Pill>
      <span className="min-w-16 max-w-[12rem] truncate text-center tabular-nums" dir="auto">{value}</span>
      <Pill className="pl-btn pl-act" onClick={() => onStep(1)} aria-label={`${label} +`}>+</Pill>
    </div>
  )
}

export function PlayerMenu(p: MenuProps) {
  const t = useT()
  const TITLE: Record<MenuKind, string> = { av: "player.av", settings: "player.settings", audio: "player.audio", subs: "player.subtitles", quality: "player.quality", speed: "player.speed", sleep: "player.sleep.title", aspect: "player.aspect", subStyle: "player.subStyle", subSearch: "player.subSearch", info: "player.info", variant: "player.variant" }
  const audio = p.audio.length ? p.audio.map((x) => <TrackItem key={x.id} track={x} active={x.id === p.audioSel} onClick={() => p.onAudio(x.id)} />) : <div className="px-1 text-muted-foreground">{t("player.noAudioTracks")}</div>
  const subs = (
    <>
      <Item active={p.subSel < 0 && !p.ext} onClick={() => p.onSub(-1)}>{t("player.off")}</Item>
      {p.subs.map((x) => <TrackItem key={x.id} track={x} active={x.id === p.subSel && !p.ext} onClick={() => p.onSub(x.id)} />)}
      {p.ext && <Item active onClick={() => p.onMenu("subSearch")}><bdi dir="auto">{p.ext}</bdi></Item>}
      {!p.subs.length && !p.ext && <div className="px-1 text-muted-foreground">{t("player.noSubtitleTracks")}</div>}
      <Step label={t("player.subSize")} value={`${p.subSize}%`} onStep={p.onSubSize} />
      {p.subOffset !== null && <Step label={t("player.subOffset")} value={`${p.subOffset > 0 ? "+" : ""}${p.subOffset}s`} onStep={p.onSubOffset} />}
      {!p.live && <Row label={t("player.subSearch")} value={t("player.subOnline")} onClick={() => p.onMenu("subSearch")} />}
      <Row label={t("player.subStyle")} value="" onClick={() => p.onMenu("subStyle")} />
    </>
  )
  return (
    <Sheet title={t(TITLE[p.menu])} onClose={p.onClose} onBack={p.onBack}>
      {p.menu === "av" && <><Heading>{t("player.audio")}</Heading>{audio}<Heading>{t("player.subtitles")}</Heading>{subs}</>}
      {p.menu === "audio" && audio}
      {p.menu === "subs" && subs}
      {p.menu === "settings" && (
        <>
          {p.mediaServer && !p.live && <Row label={t("player.quality")} value={p.sq.id === "original" ? t("player.original") : `${p.sq.height}p`} onClick={() => p.onMenu("quality")} />}
          {!p.live && <Row label={t("player.speed")} value={speedLabel(p.speed)} onClick={() => p.onMenu("speed")} />}
          <Row label={t("player.aspect")} value={t(`player.fit.${FITS[p.fit]}`)} onClick={() => p.onMenu("aspect")} />
          {p.variants.length > 1 && <Row label={t("player.variant")} value={p.item.name} onClick={() => p.onMenu("variant")} />}
          <Row label={t("player.sleep.title")} value={p.sleepMin ? t("player.sleep.min", { n: p.sleepMin }) : t("player.off")} onClick={() => p.onMenu("sleep")} />
          <Toggle label={t("player.favorite")} on={p.isFav} onClick={p.onFav} />
          {p.canPip && <Toggle label={t("player.pip")} on={p.pip} onClick={() => { p.onPip(); p.onClose() }} />}
          <Row label={t("player.info")} value={p.stats ? qualitySummary(p.stats, t)[0] ?? "" : ""} onClick={() => p.onMenu("info")} />
        </>
      )}
      {p.menu === "variant" && p.variants.map((v) => <Item key={v.item.id} active={v.item.id === p.item.id} onClick={() => p.onVariant(v.item)}><span className="flex min-w-0 flex-col"><bdi dir="auto" className="truncate">{v.item.name}</bdi>{v.src && <span className="truncate text-xs font-normal text-muted-foreground">{v.src}</span>}</span></Item>)}
      {p.menu === "quality" && STREAM_QS.map((q) => <Item key={q.id} active={q.id === p.sq.id} onClick={() => p.onQuality(q)}><bdi dir="ltr">{q.id === "original" ? t("player.original") : q.label}</bdi></Item>)}
      {p.menu === "info" && (p.stats ? <>
        {qualitySummary(p.stats, t).map((line) => <div key={line} className="px-1 font-medium">{line}</div>)}
        {qualityMetrics(p.stats).map((line, i) => <div key={i} className="px-1 text-sm text-muted-foreground">{line}</div>)}
      </> : <div className="px-1 text-sm text-muted-foreground">{t("player.infoUnavailable")}</div>)}
      {p.menu === "speed" && SPEEDS.map((n) => <Item key={n} active={n === p.speed} onClick={() => p.onSpeed(n)}><bdi dir="ltr">{speedLabel(n)}</bdi>{n === 1 ? `  ·  ${t("player.speedNormal")}` : ""}</Item>)}
      {p.menu === "aspect" && FITS.map((f, i) => <Item key={f} active={i === p.fit} onClick={() => p.onFit(i)}>{t(`player.fit.${f}`)}</Item>)}
      {p.menu === "sleep" && [0, ...SLEEP_MIN].map((n) => <Item key={n} active={n === p.sleepMin} onClick={() => p.onSleep(n)}>{n ? t("player.sleep.min", { n }) : t("player.off")}</Item>)}
      {p.menu === "subStyle" && <SubStyleSteps size={p.subSize} onSize={p.onSubSize} />}
      {p.menu === "subSearch" && <SubSearch item={p.item} onPick={p.onExt} />}
    </Sheet>
  )
}

const Note = ({ children, error }: { children: ReactNode; error?: boolean }) => <div className={`px-1 text-sm ${error ? "text-red-300" : "text-white/60"}`}>{children}</div>

/** Every look option as a stepper (wraps around); the subtitles on screen change live behind the sheet. */
function SubStyleSteps({ size, onSize }: { size: number; onSize: (d: number) => void }) {
  const t = useT()
  const p = usePrefs()
  const step = (k: SubStyleKey) => (d: number) => {
    const list = SUB_STYLE[k] as readonly unknown[]
    setPrefs({ [k]: list[(list.indexOf(p[k]) + d + list.length) % list.length] })
  }
  return (
    <>
      <Step label={t("player.subSize")} value={`${size}%`} onStep={onSize} />
      {(Object.keys(SUB_STYLE) as SubStyleKey[]).map((k) => <Step key={k} label={t(`player.sub.${k}`)} value={subValue(k, p[k], t)} onStep={step(k)} />)}
    </>
  )
}

/** Label of one look value: numbers as %, the line height as ×n, words translated (player.sub.<key>.<value>). */
export const subValue = (k: SubStyleKey, v: string | number | boolean, t: (k: string) => string) =>
  k === "subLine" ? `×${v}` : typeof v === "number" ? `${v}%` : t(`player.sub.${k}.${v}`)

export const langName = (code: string, ui: string) => { try { return new Intl.DisplayNames([ui], { type: "language" }).of(code) ?? code } catch { return code } }
const PROVIDER: Record<SubProvider, string> = { subdl: "SubDL", opensubtitles: "OpenSubtitles" }

/** Online search: language stepper (Settings languages first), results from SubDL + OpenSubtitles; a pick downloads it. */
function SubSearch({ item, onPick }: { item: CatalogItem; onPick: (vtt: string, label: string) => void }) {
  const t = useT()
  const { lang: ui } = useLang()
  const pref = useApp((s) => s.settings.subs?.langs)
  const langs = useMemo(() => { const f = pref?.length ? pref : DEFAULT_SUB_LANGS; return [...f, ...SUB_LANGS.filter((l) => !f.includes(l))] }, [pref])
  const [li, setLi] = useState(0)
  const lang = langs[li % langs.length]
  const [q, setQ] = useState<SubQuery | null>(null)
  const [res, setRes] = useState<(Awaited<ReturnType<typeof searchSubs>> & { lang: string }) | null>(null)
  const [busy, setBusy] = useState("")
  const [err, setErr] = useState("")
  useEffect(() => { let on = true; void subQuery(item, useCatalog.getState().byId).then((x) => on && setQ(x)); return () => { on = false } }, [item])
  useEffect(() => {
    if (!q) return
    let on = true
    setRes(null); setErr("")
    void searchSubs(q, lang).then((r) => on && setRes({ ...r, lang }))
    return () => { on = false }
  }, [q, lang])
  const pick = (h: SubHit) => {
    if (busy || !q) return
    setBusy(h.ref); setErr("")
    downloadSub(h, q).then((vtt) => onPick(vtt, `${langName(h.lang || lang, ui)} · ${h.name}`), (e: unknown) => setErr(t("player.subFailed", { msg: e instanceof Error ? e.message : String(e) }))).finally(() => setBusy(""))
  }
  return (
    <>
      <Step label={t("player.subLang")} value={langName(lang, ui)} onStep={(d) => setLi((i) => (i + d + langs.length) % langs.length)} />
      {!res ? <Note>{t("player.subSearching")}</Note> : res.keyless ? <Note>{t("player.subNoKey")}</Note> : !res.hits.length && !res.errors.length ? <Note>{t("player.subNone")}</Note> : null}
      {res?.errors.map((e) => <Note key={e.provider} error>{PROVIDER[e.provider]}: {e.msg}</Note>)}
      {res?.hits.map((h) => (
        <Item key={h.provider + h.ref} active={false} onClick={() => pick(h)}>
          <bdi dir="auto">{h.name}</bdi>
          <span className="ms-2 text-sm text-white/50">{PROVIDER[h.provider]}{h.hi ? ` · ${t("player.subHi")}` : ""}{busy === h.ref ? ` · ${t("player.subLoading")}` : ""}</span>
        </Item>
      ))}
      {err && <Note error>{err}</Note>}
    </>
  )
}
