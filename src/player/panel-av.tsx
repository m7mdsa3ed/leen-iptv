import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ChevronDown, Minus, Plus } from "lucide-react"
import { useCatalog } from "@/lib/catalog"
import { useLang, useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"
import { downloadSub, searchSubs, subQuery } from "@/lib/subs"
import { DEFAULT_SUB_LANGS, SUB_LANGS, type SubHit, type SubProvider, type SubQuery } from "@/lib/subs-pure"
import { cn } from "@/lib/utils"
import type { Item } from "@/lib/types"
import type { Track } from "./engine"
import { SUB_SIZES, SUB_STYLE, setPrefs, usePrefs, type SubStyleKey } from "./prefs"
import { langName } from "./use-tracks"
import { Group, IconBtn, Row } from "./ui"
import type { P } from "./use-player"

const PROVIDER: Record<SubProvider, string> = { subdl: "SubDL", opensubtitles: "OpenSubtitles" }

/** Label of one subtitle-look value: numbers as %, the line height as ×n, words translated (player.sub.<key>.<value>). Shared with Settings > Subtitles. */
export const subValue = (k: SubStyleKey, v: string | number | boolean, t: (k: string) => string) =>
  k === "subLine" ? `×${v}` : typeof v === "number" ? `${v}%` : t(`player.sub.${k}.${v}`)

/** - value + stepper (one D-pad line). */
function Step({ label, value, onStep }: { label: string; value: ReactNode; onStep: (d: number) => void }) {
  return (
    <div data-nav-group className="flex min-h-[var(--pl-h)] items-center gap-2 ps-[.875rem]">
      <span className="pl-trunc me-auto min-w-0">{label}</span>
      <IconBtn size="sm" label={`${label} -`} onClick={() => onStep(-1)}><Minus /></IconBtn>
      <span dir="auto" className="pl-trunc pl-num min-w-20 text-center">{value}</span>
      <IconBtn size="sm" label={`${label} +`} onClick={() => onStep(1)}><Plus /></IconBtn>
    </div>
  )
}

/** A row that opens a section in place below it (no second sheet). */
function Fold({ label, value, open, onToggle }: { label: string; value?: string; open: boolean; onToggle: () => void }) {
  return (
    <Row aria-expanded={open} onClick={onToggle} label={label}
      trail={<>{value && <span className="pl-row-detail shrink-0">{value}</span>}<ChevronDown className={cn("transition-transform", open && "rotate-180")} /></>} />
  )
}

const flagName = (f: string, t: (k: string) => string) => (f === "default" || f === "forced" || f === "sdh" ? t(`player.track.${f}`) : f)
const trackDetail = (x: Track, t: (k: string) => string) => [x.detail, x.flags?.map((f) => flagName(f, t)).join(" · ")].filter(Boolean).join(" · ") || undefined

/** Audio | Subtitles side by side (stacked on phones). Under the subtitles: size, delay, "Find online" and "Subtitle style", each opening in place. */
export function AvTab({ p }: { p: P }) {
  const t = useT()
  const T = p.T
  const prefs = usePrefs()
  const [open, setOpen] = useState<"" | "search" | "style">("")
  const toggle = (k: "search" | "style") => setOpen((o) => (o === k ? "" : k))
  const size = (d: number) => {
    const i = SUB_SIZES.indexOf(prefs.subSize as (typeof SUB_SIZES)[number])
    setPrefs({ subSize: SUB_SIZES[Math.min(SUB_SIZES.length - 1, Math.max(0, i + d))] })
  }
  return (
    <div className="pl-grid">
      <Group title={t("player.audio")}>
        {T.audio.length
          ? <div data-nav-group className="pl-list">{T.audio.map((x) => <Row key={x.id} on={x.id === T.audioSel} onClick={() => T.pickAudio(x.id)} label={x.label} detail={trackDetail(x, t)} />)}</div>
          : <p className="pl-note">{t("player.noAudioTracks")}</p>}
      </Group>
      <Group title={t("player.subtitles")}>
        <div data-nav-group className="pl-list">
          <Row on={T.subSel === -1} onClick={() => T.pickSub(-1)} label={t("player.off")} />
          {T.subs.map((x) => <Row key={x.id} on={x.id === T.subSel} onClick={() => T.pickSub(x.id)} label={x.label} detail={trackDetail(x, t)} />)}
          {T.ext && <Row on onClick={() => toggle("search")} label={T.ext.label} detail={t("player.subOnline")} />}
        </div>
        {!T.subs.length && !T.ext && <p className="pl-note mt-2 ps-[.875rem]">{t("player.noSubtitleTracks")}</p>}
        <div className="pl-list mt-4">
          <Step label={t("player.subSize")} value={`${prefs.subSize}%`} onStep={size} />
          {T.offset !== null && <Step label={t("player.subOffset")} value={`${T.offset > 0 ? "+" : ""}${T.offset}s`} onStep={T.stepOffset} />}
          {!p.live && <Fold label={t("player.subSearch")} open={open === "search"} onToggle={() => toggle("search")} />}
          {open === "search" && <SubSearch item={p.item} onPick={(vtt, label) => { T.pickExt(vtt, label); setOpen("") }} />}
          <Fold label={t("player.subStyle")} open={open === "style"} onToggle={() => toggle("style")} />
          {open === "style" && <SubStyle />}
        </div>
      </Group>
    </div>
  )
}

/** Every look option as a stepper (wraps around); the subtitles on screen change live behind the panel. */
function SubStyle() {
  const t = useT()
  const p = usePrefs()
  const step = (k: SubStyleKey) => (d: number) => {
    const list = SUB_STYLE[k] as readonly unknown[]
    setPrefs({ [k]: list[(list.indexOf(p[k]) + d + list.length) % list.length] })
  }
  return <div className="pl-list ps-3">{(Object.keys(SUB_STYLE) as SubStyleKey[]).map((k) => <Step key={k} label={t(`player.sub.${k}`)} value={subValue(k, p[k], t)} onStep={step(k)} />)}</div>
}

/** Online search: a language stepper (the Settings languages first), then SubDL + OpenSubtitles results; a pick downloads it and turns it on. */
function SubSearch({ item, onPick }: { item: Item; onPick: (vtt: string, label: string) => void }) {
  const t = useT()
  const { lang: ui } = useLang()
  const pref = useApp((s) => s.settings.subs?.langs)
  const langs = useMemo(() => { const f = pref?.length ? pref : DEFAULT_SUB_LANGS; return [...f, ...SUB_LANGS.filter((l) => !f.includes(l))] }, [pref])
  const [li, setLi] = useState(0)
  const lang = langs[li % langs.length]
  const [q, setQ] = useState<SubQuery | null>(null)
  const [res, setRes] = useState<Awaited<ReturnType<typeof searchSubs>> | null>(null)
  const [busy, setBusy] = useState("")
  const [err, setErr] = useState("")
  useEffect(() => { let on = true; void subQuery(item, useCatalog.getState().byId).then((x) => on && setQ(x)); return () => { on = false } }, [item])
  useEffect(() => {
    if (!q) return
    let on = true
    setRes(null); setErr("")
    void searchSubs(q, lang).then((r) => on && setRes(r))
    return () => { on = false }
  }, [q, lang])
  const pick = (h: SubHit) => {
    if (busy || !q) return
    setBusy(h.ref); setErr("")
    downloadSub(h, q).then((vtt) => onPick(vtt, `${langName(h.lang || lang, ui)} · ${h.name}`), (e: unknown) => setErr(t("player.subFailed", { msg: e instanceof Error ? e.message : String(e) }))).finally(() => setBusy(""))
  }
  const note = (s: ReactNode, bad?: boolean) => <p className="pl-note ps-[.875rem]" data-bad={bad ? "" : undefined}>{s}</p>
  return (
    <div className="pl-list ps-3">
      <Step label={t("player.subLang")} value={langName(lang, ui)} onStep={(d) => setLi((i) => (i + d + langs.length) % langs.length)} />
      {!res ? note(t("player.subSearching")) : res.keyless ? note(t("player.subNoKey")) : !res.hits.length && !res.errors.length ? note(t("player.subNone")) : null}
      {res?.errors.map((e) => <div key={e.provider}>{note(`${PROVIDER[e.provider]}: ${e.msg}`, true)}</div>)}
      <div data-nav-group className="pl-list">
        {res?.hits.map((h) => (
          <Row key={h.provider + h.ref} on={false} onClick={() => pick(h)} label={h.name}
            detail={[PROVIDER[h.provider], h.hi ? t("player.subHi") : "", busy === h.ref ? t("player.subLoading") : ""].filter(Boolean).join(" · ")} />
        ))}
      </div>
      {err && note(err, true)}
    </div>
  )
}
