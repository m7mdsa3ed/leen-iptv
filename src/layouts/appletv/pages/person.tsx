import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { SkelBar, SkelRail } from "@/components/gtv"
import { isTv } from "@/lib/device"
import type { Credit } from "@/lib/meta/types"
import { usePersonPage } from "../../hooks/use-person"
import { Capsule, Circle, Shelf, Tile } from "../ui"

/** tvOS-style person page: round photo, name, bio, then "In your library" / "Known for" / "Filmography" shelves. */
export default function Person({ id, name }: { id?: string; name?: string }) {
  const P = usePersonPage(id, name)
  const { name: title, info, loading, error, available, library, known, filmography, pseudo, match, openCredit, open, openSettings, back } = P
  const [more, setMore] = useState(false)
  const sub = (c: Credit) => [c.year, c.role].filter(Boolean).join("  ·  ") + (match(c) ? "" : "  ·  Not in your library")
  const credit = (c: Credit) => <Tile key={c.id} item={pseudo(c)} shape="poster" size="poster" title={c.title} sub={sub(c)} onOpen={() => openCredit(c)} />
  return (
    <div className="atv-root relative h-full overflow-hidden text-foreground">
      <div data-nav-group className="no-scrollbar absolute inset-0 overflow-y-auto px-[var(--gx)] pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        {!isTv && <Circle label="Back" onClick={back}><ArrowLeft /></Circle>}
        <div className="mt-6 flex flex-col items-center gap-8 md:flex-row md:items-end">
          {info?.photo
            ? <img src={info.photo} alt="" decoding="async" className="size-48 shrink-0 rounded-full bg-surface-2 object-cover shadow-2xl md:size-60" />
            : <div className="grid size-48 shrink-0 place-items-center rounded-full bg-surface-2 text-6xl font-semibold md:size-60">{title.slice(0, 1)}</div>}
          <div className="min-w-0 text-center md:text-left">
            {info?.department && <div className="atv-kicker">{info.department}</div>}
            <h1 className="atv-h1 mt-1">{title}</h1>
            {info?.bio && (
              <>
                <p className={`mt-3 max-w-3xl whitespace-pre-line text-lg text-[var(--fg-80)] ${more ? "" : "line-clamp-3"}`}>{info.bio}</p>
                {info.bio.length > 300 && <div className="-m-1 mt-2 p-1"><Capsule data-autofocus="" onClick={() => setMore(!more)}>{more ? "Show less" : "Read more"}</Capsule></div>}
              </>
            )}
          </div>
        </div>
        {!available && (
          <div className="mt-8 flex max-w-xl flex-col items-start gap-4 text-lg text-muted-foreground">
            <p>Cast profiles come from TMDB. Add a free TMDB key to see them.</p>
            <Capsule primary data-autofocus="" onClick={() => openSettings()}>Open settings</Capsule>
          </div>
        )}
        {available && loading && <div role="status" aria-label="Loading profile" className="mt-8"><SkelBar className="w-2/3" /><SkelRail /></div>}
        {available && !loading && !info && <p className="mt-6 text-muted-foreground">{error || "No profile found for this name."}</p>}
        {library.length > 0 && (
          <Shelf title="In your library">
            {library.map(({ item, credit: c }) => <Tile key={item.id} item={item} shape="poster" size="poster" sub={c.role} onOpen={() => void open(item)} />)}
          </Shelf>
        )}
        {known.length > 0 && <Shelf title="Known for">{known.map(credit)}</Shelf>}
        {filmography.length > 0 && <Shelf title="Filmography">{filmography.map(credit)}</Shelf>}
      </div>
    </div>
  )
}
