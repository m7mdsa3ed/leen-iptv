import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { Card, Pill, Rail, RoundButton, SkelBar, SkelRail } from "@/components/gtv"
import { usePersonPage } from "@/layouts/hooks/use-person"
import { isTv } from "@/lib/device"
import type { Credit } from "@/lib/meta/types"

const age = (b: string, d?: string) => {
  const end = d ? new Date(d) : new Date()
  const s = new Date(b)
  let a = end.getFullYear() - s.getFullYear()
  if (end.getMonth() < s.getMonth() || (end.getMonth() === s.getMonth() && end.getDate() < s.getDate())) a--
  return a
}
const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })

/** Cast/crew profile. Route param `id` is a TMDB person id (numeric) or a name; `name` is set when we came from a cast tile. */
export default function PersonPage({ id, name }: { id?: string; name?: string }) {
  const { name: hookName, info, loading, error, available, library, known, filmography: all, pseudo, match, openCredit, open, openSettings, back } = usePersonPage(id, name)
  const [more, setMore] = useState(false)
  const sub = (c: Credit) => [c.year, c.role].filter(Boolean).join("  ·  ") + (match(c) ? "" : "  ·  Not in your library")
  const credit = (c: Credit) => <Card key={c.id} item={pseudo(c)} sub={sub(c)} onOpen={() => openCredit(c)} />

  const title = hookName
  return (
    <div className="relative h-full overflow-y-auto bg-background px-[var(--gx)] pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      {info?.photo && <img src={info.photo} alt="" aria-hidden decoding="async" className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] w-full object-cover object-top opacity-20" />}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-gradient-to-t from-background via-transparent to-transparent" />
      <div className="relative">
        {!isTv && <RoundButton label="Back" onClick={back}><ArrowLeft /></RoundButton>}
        <div className="m-rise mt-6 flex flex-col gap-6 md:mt-10 md:flex-row md:gap-10">
          {info?.photo
            ? <img src={info.photo} alt="" decoding="async" className="aspect-[2/3] w-36 shrink-0 self-start rounded-2xl bg-surface-2 object-cover shadow-2xl md:w-64" />
            : <div className="grid aspect-[2/3] w-36 shrink-0 place-items-center self-start rounded-2xl bg-surface-2 text-5xl font-medium md:w-64">{title.slice(0, 1)}</div>}
          <div className="min-w-0 md:flex-1">
            <h1 className="text-3xl font-medium tracking-tight text-foreground md:text-5xl">{title}</h1>
            {info && (
              <div className="mt-4 flex flex-wrap gap-2">
                {[info.department, info.birthday && `Born ${fmt(info.birthday)}${info.deathday ? "" : ` (${age(info.birthday)})`}`, info.deathday && `Died ${fmt(info.deathday)}${info.birthday ? ` (${age(info.birthday, info.deathday)})` : ""}`, info.birthplace]
                  .filter(Boolean).map((m) => <span key={String(m)} className="rounded-full bg-surface-2 px-3 py-1 text-sm text-foreground/80">{m}</span>)}
              </div>
            )}
            {info?.aka.length ? <p className="mt-3 text-base text-muted-foreground">Also known as: {info.aka.join(", ")}</p> : null}
            {info?.bio && (
              <>
                <p className={`mt-5 max-w-3xl whitespace-pre-line text-base text-foreground/80 md:text-lg ${more ? "" : "line-clamp-6"}`}>{info.bio}</p>
                {info.bio.length > 400 && <div className="-ml-1 mt-2 p-1"><Pill data-autofocus="" onClick={() => setMore(!more)}>{more ? "Show less" : "Read more"}</Pill></div>}
              </>
            )}
            {!isTv && info?.imdb && <a className="mt-3 inline-block text-sm text-accent-blue underline" href={`https://www.imdb.com/name/${info.imdb}/`} target="_blank" rel="noreferrer">IMDb profile</a>}
            {!available && (
              <div className="mt-6 max-w-xl rounded-[28px] bg-surface p-5">
                <p className="text-foreground/80">Cast profiles (biography, birth details and filmography) come from TMDB. Add a free TMDB key to see them.</p>
                <div className="-ml-1 mt-3 p-1"><Pill variant="primary" data-autofocus="" onClick={() => openSettings()}>Open settings</Pill></div>
              </div>
            )}
            {available && loading && (
              <div role="status" aria-label="Loading profile" className="mt-5 max-w-3xl space-y-3">
                <div className="flex gap-2"><SkelBar className="h-7 w-24" /><SkelBar className="h-7 w-40" /><SkelBar className="h-7 w-32" /></div>
                <SkelBar className="mt-4 w-full" /><SkelBar className="w-full" /><SkelBar className="w-11/12" /><SkelBar className="w-3/4" />
              </div>
            )}
            {available && !loading && !info && <p className="mt-4 text-muted-foreground">{error || "No profile found for this name."}</p>}
          </div>
        </div>
        {available && loading && <div className="mt-8"><SkelRail /><SkelRail /></div>}
        {library.length > 0 && (
          <div className="mt-8">
            <Rail title="In your library">
              {library.map(({ item, credit }) => <Card key={item.id} item={item} sub={credit.role} onOpen={() => void open(item)} />)}
            </Rail>
          </div>
        )}
        {known.length > 0 && <div className="m-rise mt-4" style={{ "--i": 2 } as React.CSSProperties}><Rail title="Known for">{known.map(credit)}</Rail></div>}
        {all.length > 0 && <div className="m-rise mt-4" style={{ "--i": 3 } as React.CSSProperties}><Rail title="Filmography">{all.map(credit)}</Rail></div>}
      </div>
    </div>
  )
}

