import { Play } from "lucide-react"
import { Card } from "@/components/gtv"
import { Empty, Pending, Shell } from "@/components/tv/ui"
import { useT } from "@/lib/i18n"
import { useDetail } from "../../hooks/use-detail"
import { useSafe } from "../safe"
import { KChips, KTitle } from "../ui"

/** Detail: poster, title, big Play, plot, episodes (season chips + big rows). */
export default function Detail({ id }: { id: string }) {
  const t = useT()
  const D = useDetail(id)
  const safe = useSafe()
  const { item } = D
  const page = item?.kind === "series" ? "series" : "movies"
  if (!item) return <Shell page={page}><Pending /></Shell>
  if (!safe.item(item)) return <Shell page={page}><Empty>{t("kd.detail.blocked")}</Empty></Shell>
  return (
    <Shell page={page} title={item.name}>
      <div className="kd-detail pb-10">
        <div className="kd-dposter">{D.poster && <Card item={D.poster} fluid onOpen={D.playMain} />}</div>
        <div className="flex min-w-0 flex-col items-start gap-4">
          <h1 dir="auto" className="kd-title">{item.name}</h1>
          {D.chips.length > 0 && <div dir="auto" className="text-xl text-muted-foreground">{D.chips.join("  ·  ")}</div>}
          <button data-nav data-autofocus="" disabled={!D.canPlay} onClick={D.playMain} className="kd-btn kd-play"><Play className="fill-current" />{D.resumeLabel}</button>
          {D.plot && <p dir="auto" className="max-w-3xl text-xl leading-relaxed">{D.plot}</p>}
          {D.error && <p className="text-destructive">{D.error}</p>}
        </div>
      </div>
      {D.isSeries && D.season !== null && (
        <section className="flex flex-col gap-4 pb-10">
          <KTitle>{t("kd.detail.episodes")}</KTitle>
          {D.seasons.length > 1 && <KChips items={D.seasons.map(String)} active={String(D.season)} label={(s) => t("kd.detail.season", { n: s })} onPick={(s) => D.setSeason(Number(s))} />}
          <div className="flex flex-col gap-3">
            {D.shown.map((e) => {
              const at = D.episodes.indexOf(e)
              return (
                <button key={e.id} data-nav onClick={() => D.play(D.episodes, at)} className="kd-ep" aria-current={at === D.resumeIdx ? "true" : undefined}>
                  <Play className="size-8 shrink-0 fill-current" />
                  <span className="min-w-0 flex-1"><span dir="auto" className="block truncate text-xl font-bold">{e.title || e.item.name}</span><span className="block text-base text-muted-foreground">{D.epLabel(e)}</span></span>
                </button>
              )
            })}
          </div>
        </section>
      )}
    </Shell>
  )
}
