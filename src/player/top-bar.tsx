import { ArrowLeft, Star } from "lucide-react"
import { RoundButton } from "@/components/gtv"
import { useT } from "@/lib/i18n"
import type { Item } from "@/lib/types"
import { KeyHint } from "./overlays/key-hint"
import { describe } from "./util"

/** One top bar for every mode: back (non-TV), title, subtitle (S/E or channel number + category), favorite on the right on touch. */
export function TopBar({ item, on, hints, showBack, favBtn, isFav, onFav, onBack }: {
  item: Item; on: boolean; hints: boolean; showBack: boolean; favBtn: boolean; isFav: boolean; onFav: () => void; onBack: () => void
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
      {live && hints && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/70 sm:text-base">
          <KeyHint k="◂ ▸" label={t("player.hint.channels")} />
          <KeyHint k="Info" label={t("player.hint.controls")} />
        </div>
      )}
    </div>
  )
}
