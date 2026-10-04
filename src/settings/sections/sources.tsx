import { ArrowDown, ArrowUp, Check as CheckIcon, Minus, TriangleAlert, X } from "lucide-react"
import { useState } from "react"
import { Pill, RoundButton, ConfirmButton, Field, Row, SectionCard, Segmented, Swatches, ToggleRow } from "../controls"
import { detectPlex, retestPlex } from "@/lib/plex"
import { connKind, isLanHost, plexMode, withRemote, type ConnMode } from "@/lib/plex-pure"
import { explain } from "@/lib/net"
import { useCatalog } from "@/lib/catalog"
import { detectJellyfin, ensureJellyfinConnection, jellyfinSignIn, normServer } from "@/lib/jellyfin"
import { jfActiveKind } from "@/lib/jellyfin-pure"
import { runChecks, testChecks, type Check, type Result } from "@/lib/diagnostics"
import { useSync } from "@/lib/sync"
import type { Source } from "@/lib/types"
import { useRoute } from "@/lib/nav"
import { fmt, useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"
import { SOURCE_SWATCHES, withMeta } from "@/lib/sources"
import { SourceMark } from "@/components/source/SourceMark"

/** Plex only: which address is in use, which addresses are allowed, and a re-test (also re-picks after moving between home and away). */
function PlexConnection({ id }: { id: string }) {
  const t = useT()
  const s = useApp((st) => st.sources.find((x) => x.id === id))!
  const updateSource = useApp((st) => st.updateSource)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const mode = plexMode(s.connMode)
  const retest = async () => {
    setBusy(true); setMsg("")
    try { setMsg(t("settings.sources.connected", { kind: t(`settings.sources.kind.${await retestPlex(s)}`) })) } catch (e) { setMsg(explain(e)) }
    setBusy(false)
  }
  return (
    <>
      <Row label={t("settings.sources.connection")} description={t("settings.sources.inUse", { kind: t(`settings.sources.kind.${connKind(s.conns, s.server)}`), server: (s.server ?? "").replace(/^https?:\/\//, "") })} stack>
        <Segmented<ConnMode> label={t("settings.sources.connMode")} value={mode} onChange={(v) => updateSource(s.id, { connMode: v })}
          options={(["auto", "norelay", "local"] as const).map((v) => ({ value: v, label: t(`settings.sources.mode.${v}`) }))} />
      </Row>
      <p className="text-sm text-muted-foreground">{t(`settings.sources.mode.${mode}.desc`)}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Pill disabled={busy} onClick={() => void retest()}>{busy ? t("settings.sources.testing") : t("settings.sources.retest")}</Pill>
        {msg && <span role="status" className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </>
  )
}

/** Jellyfin only: which address is active (local or remote), the connection mode when both addresses are set, and a re-test (re-picks after moving between home and away). */
function JellyfinConnection({ id }: { id: string }) {
  const t = useT()
  const s = useApp((st) => st.sources.find((x) => x.id === id))!
  const updateSource = useApp((st) => st.updateSource)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const mode = s.connMode === "local" || s.connMode === "remote" ? s.connMode : "auto"
  const both = !!s.localServer && !!s.remoteServer
  const pick = async (next: Source) => {
    setBusy(true); setMsg("")
    try {
      const r = await ensureJellyfinConnection(next, true)
      setMsg(t("source.conn.connected", { kind: t(`source.conn.kind.${jfActiveKind(r)}`) }))
      if (r.server !== s.server) { useCatalog.getState().forget(s.id); void useCatalog.getState().retry(s.id) } // image URLs follow the active address
    } catch (e) { setMsg(explain(e)) }
    setBusy(false)
  }
  return (
    <>
      <Row label={t("source.conn.mode")} description={t("source.conn.active", { kind: t(`source.conn.kind.${jfActiveKind(s)}`), host: (s.server ?? "").replace(/^https?:\/\//, "") })} stack={both}>
        {both && <Segmented<"auto" | "local" | "remote"> label={t("source.conn.mode")} value={mode} onChange={(v) => { updateSource(s.id, { connMode: v }); void pick({ ...s, connMode: v }) }}
          options={(["auto", "local", "remote"] as const).map((v) => ({ value: v, label: t(`source.conn.mode.${v}`) }))} />}
      </Row>
      {both && <p className="text-sm text-muted-foreground">{t(`source.conn.mode.${mode}.desc`)}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Pill disabled={busy} onClick={() => void pick(s)}>{busy ? t("settings.sources.testing") : t("settings.sources.retest")}</Pill>
        {msg && <span role="status" className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </>
  )
}

const ICON = { ok: CheckIcon, warn: TriangleAlert, fail: X, skip: Minus } as const
const TONE = { ok: "text-emerald-700 dark:text-emerald-400", warn: "text-amber-700 dark:text-amber-400", fail: "text-destructive", skip: "text-muted-foreground" } as const

/** Live result of "Test connection": one row per check with the plain-language detail and hint, and a verdict line once all are done. */
function TestResults({ checks, out }: { checks: Check[]; out: Record<string, Result> }) {
  const t = useT()
  const done = checks.every((c) => out[c.id])
  const worst = checks.reduce<Result["status"]>((w, c) => { const s = out[c.id]?.status ?? "ok"; return s === "fail" || w === "fail" ? "fail" : s === "warn" || w === "warn" ? "warn" : w }, "ok")
  return (
    <div role="status" className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3">
      {done && <div className={`font-medium ${TONE[worst]}`}>{t(worst === "ok" ? "settings.sources.test.ok" : worst === "warn" ? "settings.sources.test.warn" : "settings.sources.test.fail")}</div>}
      {checks.map((c) => {
        const r = out[c.id]
        const I = r ? ICON[r.status] : null
        return (
          <div key={c.id} className="flex gap-3 text-sm">
            {I ? <I className={`mt-0.5 size-4 shrink-0 ${TONE[r.status]}`} /> : <span className="mt-1 size-3 shrink-0 animate-pulse rounded-full bg-surface-3" />}
            <div className="min-w-0">
              <div className="font-medium">{c.title}</div>
              {r ? <div dir="auto" className="break-words text-muted-foreground">{r.detail}</div> : null}
              {r?.hint && <div dir="auto" className="break-words text-foreground/70">{r.hint}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Edit what a source connects to: server / playlist URL / credentials / token. Saving clears its cache and reloads it. */
function EditConnection({ id }: { id: string }) {
  const t = useT()
  const s = useApp((st) => st.sources.find((x) => x.id === id))!
  const updateSource = useApp((st) => st.updateSource)
  const [open, setOpen] = useState(false)
  const [d, setD] = useState({ server: "", local: "", remote: "", user: "", pass: "", url: "", token: "" })
  const [busy, setBusy] = useState(false), [err, setErr] = useState("")
  const [found, setFound] = useState<{ server: string; name: string }[] | null>(null), [finding, setFinding] = useState(false), [scan, setScan] = useState(0)
  const [tests, setTests] = useState<{ checks: Check[]; out: Record<string, Result> } | null>(null)
  const sync = useSync()
  const set = (k: keyof typeof d) => (v: string) => setD({ ...d, [k]: v })
  const http = (v: string) => /^https?:\/\/\S+/i.test(v.trim())
  const start = () => {
    const lan = isLanHost(s.server ?? "")
    const local = s.type === "jellyfin" ? (s.localServer ?? (lan ? s.server ?? "" : "")) : ""
    setD({ server: s.server ?? "", local, remote: s.remoteServer ?? (s.type === "jellyfin" && !local ? s.server ?? "" : ""), user: s.user ?? "", pass: "", url: s.url ?? "", token: "" }); setErr(""); setTests(null); setFound(null); setOpen(true)
  }
  /** the changes the form describes (validated); Jellyfin signs in again when a username and password were typed */
  const build = async (): Promise<Partial<Source>> => {
    if (s.type === "xtream") {
      if (!http(d.server) || !d.user.trim()) throw new Error(t("settings.sources.err.required"))
      return { server: d.server.trim().replace(/\/+$/, ""), user: d.user.trim(), pass: d.pass || s.pass }
    }
    if (s.type === "m3u") {
      if (!http(d.url)) throw new Error(t("settings.sources.err.url"))
      return { url: d.url.trim() }
    }
    if (s.type === "plex") {
      if (!http(d.server)) throw new Error(t("settings.sources.err.url"))
      const server = d.server.trim().replace(/\/+$/, "")
      const remote = d.remote.trim().replace(/\/+$/, "")
      if (remote && !http(remote)) throw new Error(t("settings.sources.err.url"))
      // a hand-typed address replaces plex.tv's list of addresses (the automatic fallback would otherwise override it); the remote address is added to the list
      const changed = server !== (s.server ?? "").replace(/\/+$/, "")
      return { server, token: d.token.trim() || s.token, remoteServer: remote || undefined, conns: withRemote(changed ? undefined : s.conns, server, remote, s.remoteServer) }
    }
    const L = d.local.trim(), R = d.remote.trim()
    if ((!L && !R) || (L && !http(L)) || (R && !http(R))) throw new Error(t("settings.sources.err.url"))
    const localServer = L ? normServer(L) : undefined, remoteServer = R ? normServer(R) : undefined
    const cur = normServer(s.server ?? "")
    const server = cur === localServer || cur === remoteServer ? cur : localServer ?? remoteServer!
    const a = d.user.trim() && d.pass ? await jellyfinSignIn(server, d.user.trim(), d.pass) : undefined
    return { server, localServer, remoteServer, ...(a ? { token: a.token, userId: a.userId } : {}) }
  }
  const key = s.type === "jellyfin" ? "local" : "server" // the field Detect fills
  const detect = async () => {
    setFinding(true)
    const r = await (s.type === "plex" ? detectPlex : detectJellyfin)(s.type === "plex" ? d.server : d.local, (p) => setScan(p))
    setFinding(false); setScan(0); setFound(r)
    if (r.length === 1) setD((x) => ({ ...x, [key]: r[0].server }))
  }
  const save = async () => {
    setErr(""); setBusy(true)
    try {
      updateSource(s.id, await build())
      useCatalog.getState().forget(s.id)
      void useCatalog.getState().retry(s.id)
      setOpen(false)
    } catch (e) { setErr(explain(e)) }
    setBusy(false)
  }
  /** run the source's own connection checks against the form values, without saving anything */
  const test = async () => {
    setErr(""); setBusy(true); setTests(null)
    try {
      const checks = testChecks({ ...s, ...(await build()) } as Source, () => sync)
      const out: Record<string, Result> = {}
      setTests({ checks, out })
      await runChecks(checks, (id, r) => { out[id] = r; setTests({ checks, out: { ...out } }) }, 3)
    } catch (e) { setErr(explain(e)) }
    setBusy(false)
  }
  if (!open) return <div><Pill onClick={start}>{t("settings.sources.edit")}</Pill></div>
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface-2 p-4">
      <div className="text-lg font-medium">{t("settings.sources.edit")}</div>
      {(s.type === "plex" || s.type === "jellyfin") ? (<>
        <div className="flex w-full max-w-[32rem] items-end gap-2"><Field className="min-w-0 flex-1" label={t(s.type === "jellyfin" ? "source.conn.local.label" : "settings.sources.f.server")} type="url" inputMode="url" dir="ltr" value={d[key]} onChange={set(key)} /><Pill className="shrink-0" disabled={finding || busy} onClick={() => void detect()}>{finding && scan ? `${scan}%` : t("pages.sources.detect")}</Pill></div>
        {found && (found.length === 0 ? <p className="text-sm text-muted-foreground">{t("pages.sources.detectNone")}</p> : found.length > 1 && <div className="flex flex-wrap gap-2">{found.map((x) => <Pill key={x.server} onClick={() => { setD((y) => ({ ...y, [key]: x.server })); setFound(null) }}>{s.type === "jellyfin" && <bdi>{x.name}</bdi>} <bdi dir="ltr">{x.server}</bdi></Pill>)}</div>)}
        <Field className="w-full max-w-[32rem]" label={t("source.conn.remote.label")} type="url" inputMode="url" dir="ltr" value={d.remote} onChange={set("remote")} hint={t(s.type === "plex" ? "source.conn.remote.hintPlex" : "source.conn.remote.hint")} />
      </>) : s.type === "xtream" && <Field label={t("settings.sources.f.server")} type="url" inputMode="url" dir="ltr" value={d.server} onChange={set("server")} />}
      {s.type === "xtream" && (<>
        <Field label={t("settings.sources.f.user")} dir="ltr" autoComplete="username" value={d.user} onChange={set("user")} />
        <Field label={t("settings.sources.f.pass")} type="password" dir="ltr" autoComplete="current-password" value={d.pass} onChange={set("pass")} hint={t("settings.sources.f.passKeep")} />
      </>)}
      {s.type === "m3u" && <Field label={t("settings.sources.f.url")} type="url" inputMode="url" dir="ltr" value={d.url} onChange={set("url")} />}
      {s.type === "plex" && <Field label={t("settings.sources.f.token")} type="password" dir="ltr" value={d.token} onChange={set("token")} hint={t("settings.sources.f.tokenKeep")} />}
      {s.type === "jellyfin" && (<>
        <p className="text-sm text-muted-foreground">{t("settings.sources.f.jfLogin")}</p>
        <Field label={t("settings.sources.f.user")} dir="ltr" autoComplete="username" value={d.user} onChange={set("user")} />
        <Field label={t("settings.sources.f.pass")} type="password" dir="ltr" autoComplete="current-password" value={d.pass} onChange={set("pass")} />
      </>)}
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      {tests && <TestResults checks={tests.checks} out={tests.out} />}
      <div data-nav-group className="flex flex-wrap gap-2">
        <Pill disabled={busy} onClick={() => void test()}>{busy && tests ? t("settings.sources.testing") : t("settings.sources.test")}</Pill>
        <Pill variant="primary" disabled={busy} onClick={() => void save()}>{busy && !tests ? t("common.loading") : t("settings.sources.save")}</Pill>
        <Pill variant="ghost" disabled={busy} onClick={() => setOpen(false)}>{t("common.cancel")}</Pill>
      </div>
    </div>
  )
}

export default function SourcesSection() {
  const t = useT()
  const sources = useApp((s) => s.sources)
  const { updateSource, moveSource, removeSource, setSettings } = useApp()
  const badges = useApp((s) => s.settings.sourceBadges)
  const stat = useCatalog((s) => s.sources)
  const go = useRoute((s) => s.go)
  const reset = useRoute((s) => s.reset)
  return (
    <div className="flex flex-col gap-4">
      {sources.map((raw, i) => {
        const s = withMeta(raw)
        const st = stat[s.id]
        const status = !s.enabled ? t("settings.sources.disabled") : st?.status === "ready" ? fmt.plural("settings.sources.items", st.count) : st?.status === "loading" ? st.msg || t("settings.sources.loading") : st?.status === "error" ? t("settings.sources.failed") : t("settings.sources.notLoaded")
        return (
          <SectionCard key={s.id} title={<span className="flex items-center gap-3"><SourceMark type={s.type} color={s.color} className="size-5" /><bdi>{s.name}</bdi></span>} description={`${s.type === "plex" ? "Plex" : s.type === "jellyfin" ? "Jellyfin" : s.type === "m3u" ? "M3U" : "Xtream"} - ${status}`}>
            {st?.status === "error" && s.enabled && <p role="alert" className="text-sm text-destructive">{st.msg}</p>}
            {s.type === "plex" && <PlexConnection id={s.id} />}
            {s.type === "jellyfin" && <JellyfinConnection id={s.id} />}
            <EditConnection id={s.id} />
            <Field label={t("settings.sources.name")} value={s.name} onChange={(v) => v.trim() && updateSource(s.id, { name: v })} error={s.name.trim() ? undefined : t("settings.sources.nameEmpty")} />
            <Row label={t("settings.sources.color")} stack><Swatches label={t("settings.sources.color")} value={s.color} colors={SOURCE_SWATCHES} onChange={(c) => updateSource(s.id, { color: c })} /></Row>
            <ToggleRow label={t("settings.sources.enabled")} description={t("settings.sources.enabled.desc")} checked={s.enabled} onChange={(v) => updateSource(s.id, { enabled: v })} />
            <Row label={t("settings.sources.priority")} description={t("settings.sources.priority.desc")}>
              <RoundButton label={t("settings.sources.moveUp")} aria-disabled={i === 0} className={i === 0 ? "opacity-50" : ""} onClick={() => i > 0 && moveSource(s.id, -1)}><ArrowUp /></RoundButton>
              <RoundButton label={t("settings.sources.moveDown")} aria-disabled={i === sources.length - 1} className={i === sources.length - 1 ? "opacity-50" : ""} onClick={() => i < sources.length - 1 && moveSource(s.id, 1)}><ArrowDown /></RoundButton>
            </Row>
            <div className="flex flex-wrap gap-2">
              <Pill disabled={!s.enabled || st?.status === "loading"} onClick={() => void useCatalog.getState().retry(s.id)}>{t("settings.sources.refresh")}</Pill>
              <ConfirmButton confirmLabel={t("settings.sources.removeConfirm")} onConfirm={() => { useCatalog.getState().forget(s.id); removeSource(s.id); if (sources.length === 1) reset("sources") }}>{t("settings.sources.remove")}</ConfirmButton>
            </div>
          </SectionCard>
        )
      })}
      <SectionCard>
        <Row label={t("settings.sources.add")} description={t("settings.sources.add.desc")}><Pill variant="primary" onClick={() => go("sources")}>{t("settings.sources.add")}</Pill></Row>
        <ToggleRow label={t("settings.sources.badges")} description={t("settings.sources.badges.desc")} checked={badges} onChange={(v) => setSettings({ sourceBadges: v })} />
      </SectionCard>
    </div>
  )
}
