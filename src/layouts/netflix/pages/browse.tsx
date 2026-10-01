import { Lock, Star } from "lucide-react"
import { Empty, Shell } from "@/components/tv/ui"
import { ALL, FAV, useBrowse } from "../../hooks/use-browse"
import { useMode } from "@/lib/device"
import { KEY } from "@/lib/nav"
import type { Kind } from "@/lib/types"
import { useT } from "@/lib/i18n"
import { Dropdown, DropLabel, PagedGrid, Pick, Row, SkelRows, SourceBar, Tile, usePlay, variantOf } from "../ui"

/** Shows / Movies: title + Genres dropdown strip, then rows by category exactly like Home (My List grid when Favorites is picked). */
export default function Browse({ kind }: { kind: Exclude<Kind, "live"> }) {
  const B = useBrowse(kind)
  const t = useT()
  const label = (c: string) => (c === FAV ? t("nf.myList") : c === ALL ? t("nf.all") : c)
  const mode = useMode()
  const play = usePlay()
  const tile = (i: Parameters<typeof B.open>[0], v: "wide" | "poster", fluid?: boolean) => <Tile key={i.id} item={i} variant={v} fluid={fluid} pct={B.pct(i)} onOpen={() => B.open(i)} onPlay={() => play(i)} />
  return (
    <Shell page={B.page} title={B.kindLabel}>
      {B.status !== "ready" ? <SkelRows /> : (
        <div className="nf-page">
          <div className="nf-strip">
            <h1 className="nf-h1">{B.kindLabel}</h1>
            <Dropdown className="nf-drop" panelClass="w-[min(34rem,calc(100vw-2rem))]" trigger={<DropLabel>{B.g === ALL ? t("nf.browse.genres") : label(B.g)}</DropLabel>}>
              {(close) => (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3">
                    {[ALL, FAV, ...B.groups].map((c) => (
                      <Pick key={c} active={c === B.g}
                        onClick={() => { close(); if (c === ALL || c === FAV) B.setG(c); else B.openCategory(c) }}
                        onKeyDown={(e) => { if (e.keyCode === KEY.yellow) B.toggleLock(c) }}
                        onContextMenu={(e) => { if (mode !== "tv" && B.canLock && c !== FAV && c !== ALL) { e.preventDefault(); B.toggleLock(c) } }}>
                        {c === FAV && <Star className="size-4 shrink-0" />}
                        {B.isLocked(c) && <Lock className="size-3.5 shrink-0" />}
                        <span dir="auto" className="truncate">{label(c)}</span>
                      </Pick>
                    ))}
                  </div>
                  {B.genres.length > 0 && (
                    <>
                      <div className="px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("nf.browse.genres")}</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3">{B.genres.map((n) => <Pick key={n} onClick={() => { close(); B.openGenre(n) }}><span dir="auto" className="truncate">{n}</span></Pick>)}</div>
                    </>
                  )}
                </>
              )}
            </Dropdown>
          </div>
          <SourceBar />
          {B.g === ALL ? (
            B.rails.length ? B.rails.map(([c, a]) => (
              <Row key={c} title={c} onSeeAll={() => B.openCategory(c)}>{a.map((i) => tile(i, variantOf(a)))}</Row>
            )) : <div className="h-64"><Empty>{t("nf.browse.nothing")}</Empty></div>
          ) : B.items.length ? (
            <PagedGrid variant={variantOf(B.items)} items={B.items} render={(i) => tile(i, variantOf(B.items), true)} />
          ) : <div className="h-64"><Empty>{t("nf.browse.nothingList")}</Empty></div>}
        </div>
      )}
    </Shell>
  )
}
