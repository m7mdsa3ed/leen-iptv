import { useState } from "react"
import { Check, Plus } from "lucide-react"
import { Field, Pill, Row, SectionCard, ToggleRow } from "../controls"
import { SPORTS_PROVIDERS, type SportsCompetition, type SportsTeam } from "@/lib/api"
import { useApp, useFollows } from "@/lib/store"
import { useRoute } from "@/lib/nav"
import { useT } from "@/lib/i18n"
import { notificationPermission, notificationsSupported, requestNotifications } from "@/lib/notify"

/** Settings > Sports: follow any team (club or national) or tournament. Follows are per profile and sync. */
export default function SportsSection() {
  const t = useT()
  const follows = useFollows()
  const toggleFollow = useApp((s) => s.toggleFollow)
  const go = useRoute((s) => s.go)
  const proxy = useApp((s) => s.settings.proxy)
  const prov = SPORTS_PROVIDERS.find((p) => p.searchTeams)
  const popular = SPORTS_PROVIDERS.flatMap((p) => (p.competitions?.() ?? []).map((c) => ({ ...c, provider: p.id })))
  const [q, setQ] = useState("")
  const [teams, setTeams] = useState<SportsTeam[] | null>(null)
  const [comps, setComps] = useState<SportsCompetition[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const settings = useApp((s) => s.settings)
  const setSettings = useApp((s) => s.setSettings)
  const notify = settings.sportsNotify
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(() => notificationPermission())
  const permText = perm === "granted" ? t("settings.sports.permission.granted") : perm === "denied" ? t("settings.sports.permission.denied") : perm === "unsupported" ? t("settings.sports.permission.unsupported") : t("settings.sports.permission.default")
  const saveNotify = (p: Partial<{ enabled: boolean; lead: number }>) => setSettings({ sportsNotify: { enabled: notify?.enabled ?? false, lead: notify?.lead ?? 15, ...p } })
  const askPerm = async () => setPerm(notificationsSupported() ? await requestNotifications() : "unsupported")

  const teamFollowed = (id: string) => follows.some((f) => f.provider === prov?.id && f.teamId === id && f.kind !== "league")
  const compFollowed = (c: SportsCompetition & { provider: string }) => follows.some((f) => f.provider === c.provider && f.teamId === c.id && f.kind === "league")
  const search = async () => {
    if (!prov || !q.trim()) return
    setBusy(true); setErr(""); setTeams(null); setComps(null)
    try {
      const cfg = { id: prov.id, enabled: true, proxy }
      const [tn, cp] = await Promise.all([prov.searchTeams!(q.trim(), cfg), prov.searchCompetitions?.(q.trim(), cfg) ?? Promise.resolve([])])
      setTeams(tn); setComps(cp)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  const none = teams?.length === 0 && comps?.length === 0

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("settings.sports.intro")}</p>

      <SectionCard title={t("settings.sports.search")} description={t("settings.sports.search.desc")}>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1"><Field label={t("settings.sports.team")} value={q} onChange={setQ} placeholder={t("settings.sports.teamPh")} /></div>
          <Pill className="shrink-0" disabled={busy || !q.trim()} onClick={() => void search()}>{busy ? t("common.loading") : t("common.search")}</Pill>
        </div>
        {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        {none && <p className="text-sm text-muted-foreground">{t("settings.sports.noResults")}</p>}
        {teams && teams.length > 0 && (
          <>
            <div className="text-sm text-muted-foreground">{t("settings.sports.teams")}</div>
            <div data-nav-group className="flex flex-col gap-2">
              {teams.map((team) => (
                <button key={team.id} data-nav onClick={() => toggleFollow({ provider: prov!.id, teamId: team.id, name: team.name, badge: team.badge, league: team.league })}
                  className="flex items-center gap-3 rounded-2xl bg-surface-2 p-2.5 text-start">
                  {team.badge && <img src={team.badge} alt="" className="size-8 shrink-0 object-contain" />}
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className="block truncate text-base">{team.name}</span>
                    {(team.league || team.women) && <span dir="auto" className="block truncate text-sm text-muted-foreground">{[team.league, team.women ? t("settings.sports.hint.women") : ""].filter(Boolean).join("  ·  ")}</span>}
                  </span>
                  {teamFollowed(team.id) ? <Check className="size-5 shrink-0 text-emerald-500" /> : <Plus className="size-5 shrink-0 opacity-70" />}
                </button>
              ))}
            </div>
          </>
        )}
        {comps && comps.length > 0 && (
          <>
            <div className="mt-1 text-sm text-muted-foreground">{t("settings.sports.tournaments")}</div>
            <div data-nav-group className="flex flex-col gap-2">
              {comps.map((c) => (
                <button key={c.id} data-nav onClick={() => toggleFollow({ provider: prov!.id, teamId: c.id, name: c.name, league: c.league, kind: "league" })}
                  className="flex items-center gap-3 rounded-2xl bg-surface-2 p-2.5 text-start">
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className="block truncate text-base">{c.name}</span>
                    <span dir="auto" className="block truncate text-sm text-muted-foreground">{t("settings.sports.tournament")}</span>
                  </span>
                  {compFollowed({ ...c, provider: prov!.id }) ? <Check className="size-5 shrink-0 text-emerald-500" /> : <Plus className="size-5 shrink-0 opacity-70" />}
                </button>
              ))}
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard title={t("settings.sports.popular")} description={t("settings.sports.popular.desc")}>
        <div data-nav-group className="flex flex-col gap-2">
          {popular.map((c) => (
            <Row key={`${c.provider}:${c.id}`} label={c.name}>
              <Pill onClick={() => toggleFollow({ provider: c.provider, teamId: c.id, name: c.name, league: c.league, kind: "league" })}>{compFollowed(c) ? t("settings.sports.unfollow") : t("settings.sports.follow")}</Pill>
            </Row>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t("settings.sports.following", { n: follows.length })} description={t("settings.sports.following.desc")}>
        {follows.length === 0
          ? <p className="text-sm text-muted-foreground">{t("settings.sports.none")}</p>
          : (
            <div data-nav-group className="flex flex-col gap-2">
              {follows.map((f) => (
                <Row key={`${f.provider}:${f.teamId}`} label={f.name} description={f.kind === "league" ? t("settings.sports.tournament") : f.league ?? f.provider}>
                  {f.kind !== "league" && <Pill onClick={() => go("team", { id: `${f.provider}~${f.teamId}`, name: f.name, badge: f.badge, league: f.league })}>{t("settings.sports.games")}</Pill>}
                  <Pill onClick={() => toggleFollow(f)}>{t("settings.sports.unfollow")}</Pill>
                </Row>
              ))}
            </div>
          )}
      </SectionCard>

      <SectionCard title={t("settings.sports.reminders")} description={t("settings.sports.reminders.desc")}>
        <ToggleRow label={t("settings.sports.notify")} checked={notify?.enabled ?? false} onChange={(v) => saveNotify({ enabled: v })} />
        {notify?.enabled && <Field label={t("settings.sports.lead")} inputMode="numeric" value={String(notify?.lead ?? 15)} onChange={(v) => saveNotify({ lead: Math.max(0, Math.min(1440, Number(v.replace(/\D/g, "")) || 0)) })} />}
        {perm !== "unsupported" && (
          <Row label={t("settings.sports.allow")} description={permText}>
            {perm !== "granted" && <Pill onClick={() => void askPerm()}>{t("settings.sports.allow")}</Pill>}
          </Row>
        )}
      </SectionCard>
    </div>
  )
}
