import type { ReactNode } from "react"
import { Check } from "lucide-react"
import { Pill } from "@/components/gtv"
import { useT } from "@/lib/i18n"
import { STREAM_QS, type StreamQ } from "@/lib/quality"
import type { Track } from "./use-engine"
import { FITS, SPEEDS } from "./prefs"
import { speedLabel } from "./util"

export type MenuKind = "audio" | "subs" | "quality" | "speed" | "aspect"

/** One rounded sheet for every player menu. [data-modal] keeps the D-pad inside; focus enters the active item ([data-autofocus]). */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const t = useT()
  return (
    <div data-modal role="dialog" aria-label={title} className="absolute inset-0 z-20 flex items-end justify-center bg-black/60 m-fade sm:items-center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pl-sheet m-pop flex max-h-[85%] w-[28rem] max-w-full flex-col gap-2 overflow-y-auto rounded-t-[28px] bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-foreground shadow-2xl sm:rounded-[28px]">
        <div className="mb-1 text-2xl font-semibold">{title}</div>
        {children}
        <Pill variant="ghost" className="justify-start" onClick={onClose}>{t("player.close")}</Pill>
      </div>
    </div>
  )
}

function Item({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Pill role="menuitemradio" aria-checked={active} data-autofocus={active ? "" : undefined} className={`w-full justify-between rounded-2xl text-start ${active ? "font-semibold" : ""}`} onClick={onClick}>
      <span className="min-w-0 truncate">{children}</span>
      {active && <Check aria-hidden />}
    </Pill>
  )
}

export type MenuProps = {
  menu: MenuKind
  audio: Track[]; audioSel: number; onAudio: (i: number) => void
  subs: Track[]; subSel: number; onSub: (i: number) => void
  sq: StreamQ; onQuality: (q: StreamQ) => void
  speed: number; onSpeed: (n: number) => void
  fit: number; onFit: (i: number) => void
  onClose: () => void
}

export function PlayerMenu(p: MenuProps) {
  const t = useT()
  const title = t(p.menu === "audio" ? "player.audio" : p.menu === "subs" ? "player.subtitles" : p.menu === "quality" ? "player.quality" : p.menu === "speed" ? "player.speed" : "player.aspect")
  return (
    <Sheet title={title} onClose={p.onClose}>
      {p.menu === "audio" && (p.audio.length ? p.audio.map((x) => <Item key={x.id} active={x.id === p.audioSel} onClick={() => p.onAudio(x.id)}><bdi>{x.label}</bdi></Item>) : <div className="px-1 text-muted-foreground">{t("player.noAudioTracks")}</div>)}
      {p.menu === "subs" && (
        <>
          <Item active={p.subSel < 0} onClick={() => p.onSub(-1)}>{t("player.off")}</Item>
          {p.subs.map((x) => <Item key={x.id} active={x.id === p.subSel} onClick={() => p.onSub(x.id)}><bdi>{x.label}</bdi></Item>)}
          {!p.subs.length && <div className="px-1 text-muted-foreground">{t("player.noSubtitleTracks")}</div>}
        </>
      )}
      {p.menu === "quality" && STREAM_QS.map((q) => <Item key={q.id} active={q.id === p.sq.id} onClick={() => p.onQuality(q)}><bdi dir="ltr">{q.id === "original" ? t("player.original") : q.label}</bdi></Item>)}
      {p.menu === "speed" && SPEEDS.map((n) => <Item key={n} active={n === p.speed} onClick={() => p.onSpeed(n)}><bdi dir="ltr">{speedLabel(n)}</bdi>{n === 1 ? `  ·  ${t("player.speedNormal")}` : ""}</Item>)}
      {p.menu === "aspect" && FITS.map((f, i) => <Item key={f} active={i === p.fit} onClick={() => p.onFit(i)}>{t(`player.fit.${f}`)}</Item>)}
    </Sheet>
  )
}
