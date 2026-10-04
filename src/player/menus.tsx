import type { ReactNode } from "react"
import { ArrowLeft, Check, ChevronRight } from "lucide-react"
import { Pill } from "@/components/gtv"
import { useT } from "@/lib/i18n"
import { STREAM_QS, type StreamQ } from "@/lib/quality"
import type { Track } from "./use-engine"
import { FITS, SLEEP_MIN, SPEEDS } from "./prefs"
import { speedLabel } from "./util"

export type MenuKind = "av" | "settings" | "audio" | "subs" | "quality" | "speed" | "aspect" | "sleep"
/** Pickers reached from the Settings sheet: their header has a back arrow to it. */
const SETTINGS_CHILD: MenuKind[] = ["quality", "speed", "aspect", "sleep"]

/** One rounded sheet for every player menu. [data-modal] keeps the D-pad inside; focus enters the active item ([data-autofocus]). */
function Sheet({ title, onClose, onBack, children }: { title: string; onClose: () => void; onBack?: () => void; children: ReactNode }) {
  const t = useT()
  return (
    <div data-modal role="dialog" aria-label={title} className="absolute inset-0 z-20 flex items-end justify-center bg-black/60 m-fade sm:items-center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pl-sheet m-pop flex max-h-[85%] w-[28rem] max-w-full flex-col gap-2 overflow-y-auto rounded-t-[var(--pl-r)] bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-foreground shadow-2xl sm:rounded-[var(--pl-r)]">
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

export type MenuProps = {
  menu: MenuKind
  audio: Track[]; audioSel: number; onAudio: (i: number) => void
  subs: Track[]; subSel: number; onSub: (i: number) => void
  subSize: number; onSubSize: (d: number) => void
  subOffset: number | null; onSubOffset: (d: number) => void // null: this subtitle cannot be shifted (burned in / stream track)
  sq: StreamQ; onQuality: (q: StreamQ) => void
  speed: number; onSpeed: (n: number) => void
  fit: number; onFit: (i: number) => void
  sleepMin: number; onSleep: (n: number) => void // 0 = off, else the chosen preset in minutes
  live: boolean; mediaServer: boolean // which Settings rows exist
  onMenu: (m: MenuKind) => void
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

const Heading = ({ children }: { children: ReactNode }) => <div className="mt-2 px-1 text-sm font-medium uppercase tracking-wide text-white/60">{children}</div>

function Step({ label, value, onStep }: { label: string; value: string; onStep: (d: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-1" dir="ltr">
      <span className="me-auto">{label}</span>
      <Pill className="pl-btn pl-act" onClick={() => onStep(-1)} aria-label={`${label} -`}>-</Pill>
      <span className="w-16 text-center tabular-nums">{value}</span>
      <Pill className="pl-btn pl-act" onClick={() => onStep(1)} aria-label={`${label} +`}>+</Pill>
    </div>
  )
}

export function PlayerMenu(p: MenuProps) {
  const t = useT()
  const TITLE: Record<MenuKind, string> = { av: "player.av", settings: "player.settings", audio: "player.audio", subs: "player.subtitles", quality: "player.quality", speed: "player.speed", sleep: "player.sleep.title", aspect: "player.aspect" }
  const audio = p.audio.length ? p.audio.map((x) => <Item key={x.id} active={x.id === p.audioSel} onClick={() => p.onAudio(x.id)}><bdi>{x.label}</bdi></Item>) : <div className="px-1 text-muted-foreground">{t("player.noAudioTracks")}</div>
  const subs = (
    <>
      <Item active={p.subSel < 0} onClick={() => p.onSub(-1)}>{t("player.off")}</Item>
      {p.subs.map((x) => <Item key={x.id} active={x.id === p.subSel} onClick={() => p.onSub(x.id)}><bdi>{x.label}</bdi></Item>)}
      {!p.subs.length && <div className="px-1 text-muted-foreground">{t("player.noSubtitleTracks")}</div>}
      <Step label={t("player.subSize")} value={`${p.subSize}%`} onStep={p.onSubSize} />
      {p.subOffset !== null && <Step label={t("player.subOffset")} value={`${p.subOffset > 0 ? "+" : ""}${p.subOffset}s`} onStep={p.onSubOffset} />}
    </>
  )
  return (
    <Sheet title={t(TITLE[p.menu])} onClose={p.onClose} onBack={SETTINGS_CHILD.includes(p.menu) ? () => p.onMenu("settings") : undefined}>
      {p.menu === "av" && <><Heading>{t("player.audio")}</Heading>{audio}<Heading>{t("player.subtitles")}</Heading>{subs}</>}
      {p.menu === "audio" && audio}
      {p.menu === "subs" && subs}
      {p.menu === "settings" && (
        <>
          {p.mediaServer && !p.live && <Row label={t("player.quality")} value={p.sq.id === "original" ? t("player.original") : `${p.sq.height}p`} onClick={() => p.onMenu("quality")} />}
          {!p.live && <Row label={t("player.speed")} value={speedLabel(p.speed)} onClick={() => p.onMenu("speed")} />}
          <Row label={t("player.aspect")} value={t(`player.fit.${FITS[p.fit]}`)} onClick={() => p.onMenu("aspect")} />
          <Row label={t("player.sleep.title")} value={p.sleepMin ? t("player.sleep.min", { n: p.sleepMin }) : t("player.off")} onClick={() => p.onMenu("sleep")} />
        </>
      )}
      {p.menu === "quality" && STREAM_QS.map((q) => <Item key={q.id} active={q.id === p.sq.id} onClick={() => p.onQuality(q)}><bdi dir="ltr">{q.id === "original" ? t("player.original") : q.label}</bdi></Item>)}
      {p.menu === "speed" && SPEEDS.map((n) => <Item key={n} active={n === p.speed} onClick={() => p.onSpeed(n)}><bdi dir="ltr">{speedLabel(n)}</bdi>{n === 1 ? `  ·  ${t("player.speedNormal")}` : ""}</Item>)}
      {p.menu === "aspect" && FITS.map((f, i) => <Item key={f} active={i === p.fit} onClick={() => p.onFit(i)}>{t(`player.fit.${f}`)}</Item>)}
      {p.menu === "sleep" && [0, ...SLEEP_MIN].map((n) => <Item key={n} active={n === p.sleepMin} onClick={() => p.onSleep(n)}>{n ? t("player.sleep.min", { n }) : t("player.off")}</Item>)}
    </Sheet>
  )
}
