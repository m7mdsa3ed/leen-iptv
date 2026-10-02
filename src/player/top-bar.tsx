import { ArrowLeft, Star } from "lucide-react"
import { RoundButton } from "@/components/gtv"
import { hm } from "@/lib/catalog"
import { useT } from "@/lib/i18n"
import type { Item, Prog } from "@/lib/types"
import { KeyHint } from "./overlays/key-hint"
import { describe } from "./util"

/** One top bar for every mode: back (non-TV), title, subtitle (S/E or channel number + category), favorite on the right on touch. */
export function TopBar({ item, on, hints, showBack, favBtn, isFav, onFav, onBack, now, next }: {
  item: Item; on: boolean; hints: boolean; showBack: boolean; favBtn: boolean; isFav: boolean; onFav: () => void; onBack: () => void; now?: Prog; next?: Prog
}) {
  const t = useT()
  const live = item.kind === "live"
  const { title, sub } = describe(item, t)
  return (
    <div data-on={on ? "" : undefined} className="pl-layer pl-top pl-pad-top pointer-events-none px-[var(--gx)] pb-12">
      <div className="flex items-start gap-3">
        {showBack && <RoundButton label={t("player.back")} className="pl-btn pl-rb pointer-events-auto" onClick={onBack}><ArrowLeft className="rtl-flip" /></RoundButton>}
        <div className="min-w-0 flex-1">
          <div dir="auto" className="pl-title truncate">{title}</div>
          {sub && <div dir="auto" className="pl-sub mt-0.5 truncate">{sub}</div>}
        </div>
        {favBtn && <RoundButton label={t("player.favorite")} active={isFav} className="pl-btn pl-rb pointer-events-auto" onClick={onFav}><Star className={isFav ? "fill-yellow-400 text-yellow-400" : ""} /></RoundButton>}
      </div>
      {live && now && (
        <div className="mt-3 max-w-3xl text-base sm:text-xl">
          <div><bdi dir="auto">{now.t}</bdi> <bdi dir="ltr" className="text-white/60">{hm(now.s)} - {hm(now.e)}</bdi></div>
          <div dir="ltr" data-ltr className="pl-progress mt-2"><div style={{ transform: `scaleX(${Math.min(1, Math.max(0, (Date.now() - now.s) / (now.e - now.s)))})` }} /></div>
          {next && <div className="mt-2 text-white/60">{t("player.nextProgram", { title: next.t, time: hm(next.s) })}</div>}
        </div>
      )}
      {live && hints && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/70 sm:text-base">
          <KeyHint k="OK" label={t("player.hint.guide")} />
          <KeyHint k="◂ ▸" label={t("player.hint.channels")} />
          <KeyHint k="Info" label={t("player.hint.controls")} />
        </div>
      )}
    </div>
  )
}
