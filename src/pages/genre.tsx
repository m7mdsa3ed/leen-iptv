import { ArrowLeft } from "lucide-react"
import { useMemo } from "react"
import { Card, Pill, RoundButton, SkelGrid } from "@/components/gtv"
import { Empty, Pending, Shell, VGrid, useOpen } from "@/components/tv/ui"
import { useCatalog } from "@/lib/catalog"
import { isTv } from "@/lib/device"
import { useGenreTitles } from "@/lib/meta"
import { norm } from "@/lib/meta/title"
import { useRoute } from "@/lib/nav"
import { usePData } from "@/lib/store"
import type { Item } from "@/lib/types"

/** A genre (Drama, Comedy...) as a page: popular titles of that genre from the metadata provider that exist in your catalog,
 *  plus any of your own categories named like it. Route id = `${kind}|${genre}`. */
export default function GenrePage({ id }: { id: string }) {
  const cut = id.indexOf("|")
  const kind = (id.slice(0, cut) === "series" ? "series" : "movie") as "movie" | "series"
  const genre = id.slice(cut + 1)
  const { groups, status } = useCatalog()
  const d = usePData()
  const open = useOpen()
  const go = useRoute((s) => s.go)
  const back = useRoute((s) => s.back)
  const { items, available, loading, unknown, hasMore, more } = useGenreTitles(kind, genre)
  const related = useMemo(() => groups[kind].filter((g) => norm(g).includes(norm(genre))).slice(0, 8), [groups, kind, genre])
  const pct = (i: Item) => d.progress[i.id] && (d.progress[i.id].pos / d.progress[i.id].dur) * 100

  return (
    <Shell page={kind === "movie" ? "movies" : "series"} title={genre}>
      {status !== "ready" ? <Pending /> : (
        <div className="flex h-full flex-col">
          <div className="flex flex-wrap items-center gap-3 pb-2">
            {!isTv && <RoundButton label="Back" onClick={back}><ArrowLeft /></RoundButton>}
            <div className="mr-auto min-w-0">
              <h2 className="truncate text-3xl font-medium tracking-tight">{genre}</h2>
              <div className="text-sm text-muted-foreground">{available ? `${items.length} popular ${kind === "movie" ? "movies" : "series"} in your library` : "Genres come from TMDB"}</div>
            </div>
            {related.map((g) => <Pill key={g} onClick={() => go("category", { id: `${kind}|${g}` })}>{g}</Pill>)}
            {available && hasMore && <Pill variant="primary" disabled={loading} onClick={() => void more()}>{loading ? "Searching..." : "Find more"}</Pill>}
          </div>
          <div className="min-h-0 flex-1">
            {!available ? (
              <Empty>
                <div className="flex max-w-xl flex-col items-center gap-4 px-6 text-center">
                  <p>Genre pages use TMDB to find popular {genre} titles. Add a free TMDB key to see them.</p>
                  <Pill variant="primary" data-autofocus="" onClick={() => go("settings")}>Open settings</Pill>
                </div>
              </Empty>
            ) : items.length ? (
              <VGrid items={items} render={(i) => <Card key={i.id} item={i} fluid pct={pct(i)} onOpen={() => void open(i)} />} />
            ) : loading ? (
              <SkelGrid />
            ) : (
              <Empty>{unknown ? `TMDB has no "${genre}" genre for ${kind === "movie" ? "movies" : "series"}.` : hasMore ? "None of the popular titles found yet." : "None of the popular titles in this genre are in your library."}</Empty>
            )}
          </div>
        </div>
      )}
    </Shell>
  )
}
