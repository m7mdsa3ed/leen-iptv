import { useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { Card, SkelBar, SkelGrid } from "@/components/gtv"
import { useT, fmt } from "@/lib/i18n"
import { useSourceOf } from "@/lib/sources"
import { useApp } from "@/lib/store"
import { connInfo } from "@/lib/xtream"
import type { Person } from "@/lib/meta/types"
import type { Item } from "@/lib/types"
import type { DetailRating } from "@/layouts/hooks/use-detail"

export const Section = ({ title, children }: { title?: ReactNode; children: ReactNode }) => (
  <section className="mt-5">
    {title && <h2 className="pl-h2 mb-2 text-foreground">{title}</h2>}
    {children}
  </section>
)

export const Chip = ({ children }: { children: ReactNode }) => <span className="pl-tag text-foreground/80">{children}</span>

/** Plot / description lines, or placeholders while the metadata loads. */
export function Plot({ text, loading }: { text?: string; loading: boolean }) {
  if (text) return <p dir="auto" className="max-w-3xl text-base leading-relaxed text-foreground/85">{text}</p>
  if (loading) return <div className="space-y-2" aria-hidden><SkelBar className="w-full max-w-3xl" /><SkelBar className="w-5/6 max-w-3xl" /><SkelBar className="w-2/3 max-w-3xl" /></div>
  return null
}

export function Ratings({ ratings, name }: { ratings: DetailRating[]; name: (s: string) => string }) {
  return <>{ratings.map((r) => <Chip key={r.source}>{name(r.source)} <bdi>{r.value}{r.votes ? ` · ${r.votes}` : ""}</bdi></Chip>)}</>
}

export function StreamFacts({ facts }: { facts: import("@/lib/meta/facts-pure").StreamFacts }) {
  const t = useT()
  const rows: [string, string][] = [
    [t("player.more.resolution"), facts.res ?? ""], [t("player.more.video"), facts.video ?? ""],
    [t("player.more.audio"), [facts.audio, facts.ch].filter(Boolean).join(" · ")], [t("player.more.container"), facts.box ?? ""],
    [t("player.more.size"), facts.size ? `${fmt.number(Math.round(facts.size / 1_000_000))} MB` : ""],
    [t("player.more.added"), facts.added ? fmt.date(new Date(facts.added * 1000), { year: "numeric", month: "short", day: "numeric" }) : ""],
  ]
  const values = rows.filter(([, value]) => value)
  return values.length || facts.langs?.length ? <Section title={t("player.more.sourceInfo")}><div className="flex flex-wrap items-center gap-2">{values.map(([label, value]) => <Chip key={label}>{label}: <bdi dir="ltr">{value}</bdi></Chip>)}{facts.langs?.map((lang) => <Chip key={lang}>{t("player.more.audioLanguage")}: <bdi>{lang}</bdi></Chip>)}</div></Section> : null
}

const grid = "grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(var(--min),1fr))]"

/** Cast grid with photos; selecting opens the person page. */
export function CastRail({ cast, loading, onOpen }: { cast: Person[]; loading: boolean; onOpen: (c: Person) => void }) {
  const t = useT()
  if (!cast.length) return loading ? <Section title={t("player.more.cast")}><SkelGrid n={8} /></Section> : null
  return (
    <Section title={t("player.more.cast")}>
      <div data-nav-group className={grid} style={{ "--min": "7rem" } as CSSProperties}>
        {cast.slice(0, 24).map((c) => (
          <button key={c.name} data-nav onClick={() => onOpen(c)} className="flex flex-col items-center rounded-2xl p-1 text-center">
            {c.photo ? <img src={c.photo} alt="" loading="lazy" decoding="async" className="aspect-square w-full max-w-28 rounded-full bg-surface-2 object-cover" /> : <div className="grid aspect-square w-full max-w-28 place-items-center rounded-full bg-surface-2 text-2xl font-medium">{c.name.slice(0, 1)}</div>}
            <div dir="auto" className="mt-2 w-full truncate text-sm">{c.name}</div>
            {c.role && <div dir="auto" className="w-full truncate text-xs text-muted-foreground">{c.role}</div>}
          </button>
        ))}
      </div>
    </Section>
  )
}

/** "More like this": only titles that exist in the catalog, as a poster grid. */
export function SimilarRail({ items, loading, onOpen }: { items: Item[]; loading: boolean; onOpen: (i: Item) => void }) {
  const t = useT()
  if (!items.length) return loading ? <Section title={t("player.more.similar")}><SkelGrid n={8} /></Section> : null
  return (
    <Section title={t("player.more.similar")}>
      <div data-nav-group className={grid} style={{ "--min": "9.5rem" } as CSSProperties}>
        {items.slice(0, 24).map((i) => <Card key={i.id} item={i} fluid onOpen={() => onOpen(i)} />)}
      </div>
    </Section>
  )
}

/** Xtream only: connections in use / allowed (includes this stream). Fetched when the panel opens; renders nothing if the server won't say. */
export function ConnChip({ item }: { item: Item }) {
  const t = useT()
  const src = useSourceOf(item)
  const proxy = useApp((s) => s.settings.proxy)
  const [c, setC] = useState<{ act: number; max: number } | null>(null)
  useEffect(() => { if (src?.type === "xtream") void connInfo(src, proxy).then(setC) }, [src?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return c ? <div className="mb-3"><Chip>{t("player.more.conns", { used: fmt.number(c.act), max: fmt.number(c.max) })}</Chip></div> : null
}
