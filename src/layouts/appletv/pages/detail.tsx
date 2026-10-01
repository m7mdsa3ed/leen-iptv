import { ArrowLeft } from "lucide-react"
import { Play } from "lucide-react"
import { SkelBar } from "@/components/gtv"
import { isTv } from "@/lib/device"
import { useDetail } from "../../hooks/use-detail"
import { Capsule, Circle, PersonTile, Shelf, Tile, UpNextButton } from "../ui"

const Col = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="min-w-0"><h3 className="mb-2 text-base font-semibold text-foreground">{title}</h3><div className="space-y-1.5 text-base text-muted-foreground">{children}</div></div>
)

/** tvOS product page: full-screen artwork, left stack (title, line, Play + Up Next, synopsis), then Episodes / Related / Cast & Crew shelves and Information. */
export default function Detail({ id }: { id: string }) {
  const D = useDetail(id)
  const { item, isSeries, loading, plot, chips, ratings, backdrop, episodes, seasons, season, setSeason, shown } = D
  if (!item) return null
  const line = [D.genres.slice(0, 3).join(", "), ...chips, D.ratings[0] && `${D.ratings[0].source === "Rating" ? "★" : D.ratings[0].source} ${D.ratings[0].value}`].filter(Boolean)
  return (
    <div className="atv-root relative h-full overflow-hidden text-foreground">
      {backdrop && <img src={backdrop} alt="" aria-hidden decoding="async" className="absolute inset-0 size-full object-cover" />}
      <div className="atv-hero-shade absolute inset-0" />
      {!isTv && <Circle label="Back" onClick={D.back} className="absolute left-[max(1rem,var(--gx))] top-[max(1rem,env(safe-area-inset-top))] z-20"><ArrowLeft /></Circle>}
      <div data-nav-group className="no-scrollbar absolute inset-0 overflow-y-auto px-[var(--gx)] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div className="atv-detail-top flex flex-col justify-end gap-3 pb-6 pt-24">
          <div className="atv-kicker">{isSeries ? "Series" : "Movie"}{item.group ? ` · ${item.group}` : ""}</div>
          <h1 className="atv-h1 line-clamp-3 max-w-3xl">{item.name}</h1>
          {line.length > 0 && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-lg text-[var(--fg-80)]">{line.map((l, n) => <span key={n}>{n > 0 && <span className="mr-3 opacity-40">·</span>}{l}</span>)}</div>}
          <div className="-m-1 mt-1 flex flex-wrap items-center gap-3 p-1">
            <Capsule primary data-autofocus="" onClick={D.playMain} disabled={!D.canPlay}><Play className="fill-current" />{D.resumeLabel}</Capsule>
            <UpNextButton on={D.fav} onClick={D.toggleFav} />
          </div>
          {plot ? <p className="line-clamp-4 max-w-2xl text-lg text-[var(--fg-80)]">{plot}</p> : loading ? (
            <div role="status" aria-label="Loading details" className="max-w-2xl space-y-3"><SkelBar className="w-full" /><SkelBar className="w-11/12" /><SkelBar className="w-2/3" /></div>
          ) : null}
          {D.error && <p className="text-destructive">{D.error}</p>}
        </div>
        <div className="atv-detail-body relative -mx-[var(--gx)] px-[var(--gx)] pb-10">
          {isSeries && season !== null && (
            <div className="atv-shelf-wrap">
              <div className="flex flex-wrap items-center gap-2 pt-6">
                <h2 className="atv-shelf-title mr-3">Episodes</h2>
                {seasons.map((s) => (
                  <button key={s} data-nav data-pill aria-pressed={s === season} onClick={() => setSeason(s)} className={`atv-pillbtn min-h-11 rounded-full px-5 text-base font-semibold ${s === season ? "bg-foreground text-background" : "atv-glass"}`}>Season {s}</button>
                ))}
              </div>
              <Shelf>
                {shown.map((e) => <Tile key={e.id} item={e.item} always title={`${e.num}. ${e.title || e.item.name}`} sub={[`S${season} E${e.num}`, e.dur].filter(Boolean).join("  ·  ")} pct={D.pct(e.item)} onOpen={() => D.play(episodes, episodes.indexOf(e))} />)}
              </Shelf>
            </div>
          )}
          {D.similar.length > 0 && <Shelf title="Related">{D.similar.map((i) => <Tile key={i.id} item={i} shape="poster" size="poster" onOpen={() => D.open(i)} />)}</Shelf>}
          {D.cast.length > 0 && (
            <Shelf title="Cast & Crew">
              {D.cast.slice(0, 16).map((c) => <PersonTile key={c.name} name={c.name} role={c.role} photo={c.photo} onOpen={() => D.openPerson(c)} />)}
            </Shelf>
          )}
          <section className="pt-6">
            <h2 className="atv-shelf-title mb-4">Information</h2>
            <div className="grid gap-8 md:grid-cols-3">
              <Col title="Rating & Info">
                {ratings.map((r) => <div key={r.source}>{r.source}: <b className="text-foreground">{r.value}</b></div>)}
                {chips.map((c) => <div key={c}>{c}</div>)}
                {item.group && <div><button data-nav onClick={() => D.openCategory()} className="-ml-2 rounded-lg px-2 py-0.5 text-left underline-offset-4 hover:underline">{item.group}</button></div>}
              </Col>
              <Col title="Genres">
                {D.genres.length ? D.genres.map((g) => <div key={g}><button data-nav onClick={() => D.openGenre(g)} className="-ml-2 rounded-lg px-2 py-0.5 text-left underline-offset-4 hover:underline">{g}</button></div>) : <div>-</div>}
              </Col>
              <Col title="Cast & Crew">
                {D.directors.length > 0 && <div>{isSeries ? "Created by" : "Directed by"} <span className="text-foreground">{D.directors.join(", ")}</span></div>}
                {D.cast.length ? <div className="line-clamp-4">Starring {D.cast.slice(0, 8).map((c) => c.name).join(", ")}</div> : D.castText ? <div className="line-clamp-4">{D.castText}</div> : !D.directors.length ? <div>-</div> : null}
              </Col>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
