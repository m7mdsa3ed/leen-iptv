import { type ReactNode } from "react"
import { Bell, Check, Plus, RefreshCw, Trophy, X } from "lucide-react"
import { Field, Pill, SectionCard } from "../controls"
import { openSection } from "../open"
import { TeamBadge } from "@/components/tv/sports"
import { SPORTS_PROVIDERS, type Follow } from "@/lib/api"
import { useApp, useFollows } from "@/lib/store"
import { useRoute } from "@/lib/nav"
import { useSportsSearch } from "@/lib/sports/use-games"
import { SPORTS } from "@/lib/sports/pure"
import { sportOf } from "@/lib/sports/games"
import { fmt, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** Settings > Sports: your teams and tournaments (per profile, synced), search any team or tournament, popular tournaments by sport, reminders. */
export default function SportsSection() {
  const t = useT()
  const follows = useFollows()
  const toggleFollow = useApp((s) => s.toggleFollow)
  const go = useRoute((s) => s.go)
  const S = useSportsSearch()
  const popular = SPORTS_PROVIDERS.flatMap((p) => (p.competitions?.() ?? []).map((c) => ({ ...c, provider: p.id })))

  const teams = follows.filter((f) => f.kind !== "league")
  const leagues = follows.filter((f) => f.kind === "league")
  const has = (provider: string, id: string, league: boolean) => follows.some((f) => f.provider === provider && f.teamId === id && (f.kind === "league") === league)
  const open = (f: Follow) => f.kind === "league" ? go("league", { id: `${f.provider}~${f.teamId}`, name: f.name }) : go("team", { id: `${f.provider}~${f.teamId}`, name: f.name, badge: f.badge, league: f.league })
  const mine = (list: Follow[], empty: string) => list.length === 0
    ? <p className="text-sm text-muted-foreground">{empty}</p>
    : (
      <div className="flex flex-col gap-1">
        {list.map((f) => (
          <div key={`${f.provider}:${f.teamId}`} data-nav-group className="flex items-center gap-1 rounded-2xl bg-surface-2 p-1">
            <button data-nav data-pill onClick={() => open(f)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 text-start">
              {f.kind === "league" ? <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-blue-container"><Trophy className="size-4" /></span> : <TeamBadge team={{ name: f.name, badge: f.badge }} className="size-8" />}
              <span className="min-w-0"><span dir="auto" className="block truncate">{f.name}</span><span dir="auto" className="block truncate text-xs text-muted-foreground">{f.kind === "league" ? t(`pages.sports.sport.${sportOf(f.teamId)}`) : f.league}</span></span>
            </button>
            <button data-nav data-pill aria-label={`${t("settings.sports.unfollow")}: ${f.name}`} onClick={() => toggleFollow(f)} className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground"><X className="size-5" /></button>
          </div>
        ))}
      </div>
    )
  const hit = (key: string, on: boolean, onClick: () => void, icon: ReactNode, title: string, sub?: string) => (
    <button key={key} data-nav data-pill aria-pressed={on} onClick={onClick} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-2.5 text-start">
      {icon}
      <span className="min-w-0 flex-1"><span dir="auto" className="block truncate text-base">{title}</span>{sub && <span dir="auto" className="block truncate text-sm text-muted-foreground">{sub}</span>}</span>
      {on ? <Check className="size-5 shrink-0 text-emerald-500" /> : <Plus className="size-5 shrink-0 opacity-70" />}
    </button>
  )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("settings.sports.intro")}</p>

      <SectionCard title={t("settings.sports.myTeams", { n: fmt.number(teams.length) })} description={t("settings.sports.following.desc")}>
        {mine(teams, t("settings.sports.none"))}
      </SectionCard>
      <SectionCard title={t("settings.sports.myLeagues", { n: fmt.number(leagues.length) })} description={t("settings.sports.tournaments.desc")}>
        {mine(leagues, t("settings.sports.noLeagues"))}
      </SectionCard>

      <SectionCard title={t("settings.sports.search")} description={t("settings.sports.search.desc")}>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1"><Field label={t("settings.sports.team")} value={S.q} onChange={S.setQ} placeholder={t("settings.sports.teamPh")} /></div>
          {S.busy && <RefreshCw aria-label={t("common.loading")} className="mb-3.5 size-5 shrink-0 animate-spin text-muted-foreground" />}
        </div>
        {S.err && <p role="alert" className="text-sm text-destructive">{S.err}</p>}
        {S.teams?.length === 0 && S.comps?.length === 0 && <p className="text-sm text-muted-foreground">{t("settings.sports.noResults")}</p>}
        {!!S.comps?.length && (
          <>
            <div className="text-sm text-muted-foreground">{t("settings.sports.tournaments")}</div>
            <div data-nav-group className="flex flex-col gap-2">
              {S.comps.map((c) => hit(c.id, has(S.provider, c.id, true), () => toggleFollow({ provider: S.provider, teamId: c.id, name: c.name, league: c.league, kind: "league" }),
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-3"><Trophy className="size-4" /></span>, c.name, t(`pages.sports.sport.${sportOf(c.id)}`)))}
            </div>
          </>
        )}
        {!!S.teams?.length && (
          <>
            <div className="mt-1 text-sm text-muted-foreground">{t("settings.sports.teams")}</div>
            <div data-nav-group className="flex flex-col gap-2">
              {S.teams.map((tm) => hit(tm.id, has(S.provider, tm.id, false), () => toggleFollow({ provider: S.provider, teamId: tm.id, name: tm.name, badge: tm.badge, league: tm.league }),
                <TeamBadge team={tm} className="size-8" />, tm.name, [tm.league, tm.women ? t("settings.sports.hint.women") : ""].filter(Boolean).join("  ·  ")))}
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard title={t("settings.sports.popular")} description={t("settings.sports.popular.desc")}>
        {SPORTS.map((sp) => {
          const list = popular.filter((c) => sportOf(c.id) === sp)
          return list.length > 0 && (
            <div key={sp} className="flex flex-col gap-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t(`pages.sports.sport.${sp}`)}</div>
              <div data-nav-group className="flex flex-wrap gap-2">
                {list.map((c) => {
                  const on = has(c.provider, c.id, true)
                  return (
                    <button key={c.id} data-nav data-pill aria-pressed={on} onClick={() => toggleFollow({ provider: c.provider, teamId: c.id, name: c.name, league: c.league, kind: "league" })}
                      className={cn("flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium", on ? "bg-accent-blue-container text-foreground" : "bg-surface-2 text-muted-foreground")}>
                      {on ? <Check className="size-4" /> : <Plus className="size-4" />}<bdi>{c.name}</bdi>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </SectionCard>

      <SectionCard title={t("settings.sports.reminders")} description={t("settings.sports.reminders.desc")}>
        <div><Pill onClick={() => openSection("notifications")}><Bell />{t("settings.sports.openNotify")}</Pill></div>
      </SectionCard>
    </div>
  )
}
