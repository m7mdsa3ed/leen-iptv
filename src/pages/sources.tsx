import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Pill } from "@/components/gtv"
import { fmt, t, useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"
import { useRoute } from "@/lib/nav"
import { explain } from "@/lib/net"
import { checkPin, createPin, pickConnection, plexServers, type Pin, type PlexServer } from "@/lib/plex"
import type { ConnMode } from "@/lib/plex-pure"
import { jellyfinServerInfo, jellyfinSignIn, normServer, quickConnectCheck, quickConnectEnabled, quickConnectFinish, quickConnectStart, type JfAuth } from "@/lib/jellyfin"

type Type = "M3U" | "Xtream" | "Plex" | "Jellyfin"

export default function Sources() {
  const tr = useT() // re-render on language change; handlers use the non-reactive t()
  const addSource = useApp((s) => s.addSource)
  const reset = useRoute((s) => s.reset)
  const [type, setType] = useState<Type>("Xtream")
  const [f, setF] = useState({ name: "", url: "", epgUrl: "", server: "", user: "", pass: "", token: "" })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === "name" ? e.target.value : e.target.value.trim() })
  // Plex sign-in: pin (waiting for the code at plex.tv/link) -> servers -> test connections -> save
  const [pin, setPin] = useState<Pin | null>(null)
  const [servers, setServers] = useState<PlexServer[] | null>(null)
  const [manual, setManual] = useState(false)
  const [busy, setBusy] = useState("")
  const [err, setErr] = useState("")
  // Jellyfin: username/password, or Quick Connect (code approved in another Jellyfin app, polled here)
  const [qc, setQc] = useState<{ server: string; secret: string; code: string } | null>(null)
  const ok = type === "Jellyfin" ? f.server && f.user : type === "Plex" ? /^https?:\/\//.test(f.server) && f.token : f.name && (type === "M3U" ? /^https?:\/\//.test(f.url) : /^https?:\/\//.test(f.server) && f.user && f.pass)

  useEffect(() => {
    if (!pin) return
    let live = true
    const iv = setInterval(async () => {
      try {
        const token = await checkPin(pin.id)
        if (!token || !live) return
        clearInterval(iv)
        setBusy(t("pages.sources.finding"))
        const list = await plexServers(token)
        if (!live) return
        setServers(list); setPin(null); setBusy("")
        if (!list.length) setErr(t("pages.sources.noPlex"))
      } catch (e) {
        if (!live) return
        clearInterval(iv)
        setErr(explain(e)); setPin(null); setBusy("")
      }
    }, 2000)
    return () => { live = false; clearInterval(iv) }
  }, [pin])

  useEffect(() => {
    if (!qc) return
    let live = true
    let busyTick = false // a check can outlast the 3s interval: never run two at once (two would add the source twice)
    const iv = setInterval(async () => {
      if (busyTick) return
      busyTick = true
      try {
        if (!(await quickConnectCheck(qc.server, qc.secret)) || !live) return
        clearInterval(iv)
        await jfAdd(qc.server, () => quickConnectFinish(qc.server, qc.secret), () => live)
      } catch (e) {
        if (!live) return
        clearInterval(iv)
        setErr(explain(e)); setQc(null); setBusy("")
      } finally { busyTick = false }
    }, 3000)
    return () => { live = false; clearInterval(iv) }
  }, [qc]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Check the address is a Jellyfin server, sign in, save. */
  const jfAdd = async (server: string, auth: () => Promise<JfAuth>, live = () => true) => {
    setErr(""); setBusy(t("pages.sources.signingIn"))
    try {
      const info = await jellyfinServerInfo(server)
      const a = await auth()
      if (!live()) return
      addSource({ name: info.name, type: "jellyfin", server, token: a.token, userId: a.userId, serverId: info.id })
      reset("home")
    } catch (e) { if (live()) { setErr(explain(e)); setBusy(""); setQc(null) } }
  }
  const jfQuick = async () => {
    const server = normServer(f.server)
    setErr(""); setBusy(t("pages.sources.contacting"))
    try {
      await jellyfinServerInfo(server)
      if (!(await quickConnectEnabled(server))) throw new Error(t("pages.sources.qcOff"))
      setQc({ server, ...(await quickConnectStart(server)) }); setBusy("")
    } catch (e) { setErr(explain(e)); setBusy("") }
  }

  const signIn = async () => {
    setErr(""); setBusy(t("pages.sources.contactingPlex"))
    try { setPin(await createPin()) } catch (e) { setErr(explain(e)) }
    setBusy("")
  }
  const [connMode, setConnMode] = useState<ConnMode>("auto")
  const choose = async (s: PlexServer) => {
    setErr(""); setBusy(t("pages.sources.connecting", { name: s.name }))
    try {
      const server = await pickConnection(s, connMode)
      addSource({ name: s.name, type: "plex", server, token: s.token, serverId: s.id, conns: s.connections, connMode })
      reset("home")
    } catch (e) { setErr(explain(e)); setBusy("") }
  }

  const save = () => {
    addSource(
      type === "Plex"
        ? { name: f.name || "Plex", type: "plex", server: f.server.replace(/\/+$/, ""), token: f.token }
        : type === "M3U"
          ? { name: f.name, type: "m3u", url: f.url, epgUrl: f.epgUrl || undefined }
          : { name: f.name, type: "xtream", server: f.server, user: f.user, pass: f.pass, epgUrl: f.epgUrl || undefined },
    )
    reset("home") // App loads the new active source
  }
  const field = (k: keyof typeof f, ph: string, type = "text", inputMode?: "url", ac = "off") => (
    <Input data-nav dir={k === "name" ? "auto" : "ltr"} className="h-12 rounded-2xl text-base md:h-14 md:text-xl" type={type} inputMode={inputMode} autoComplete={ac} spellCheck={false} placeholder={ph} value={f[k]} onChange={set(k)} autoCapitalize="off" autoCorrect="off" />
  )
  const cancel = () => useApp.getState().sources.length > 0 && <Pill variant="ghost" onClick={() => useRoute.getState().back()}>{tr("common.cancel")}</Pill>
  const conn = (s: PlexServer) => fmt.plural(s.owned ? "pages.sources.connOwned" : "pages.sources.connShared", s.connections.length)

  return (
    <div className="flex h-full flex-col items-center gap-6 overflow-y-auto bg-background p-4 py-[max(1rem,env(safe-area-inset-top))] md:justify-center">
      <div className="flex w-full max-w-[40rem] flex-col gap-3 rounded-[28px] bg-surface p-6">
        <h1 className="text-3xl font-medium tracking-tight md:text-4xl">{tr("pages.sources.title")}</h1>
        <div className="flex flex-wrap gap-2 py-2">
          {(["Xtream", "M3U", "Plex", "Jellyfin"] as const).map((t) => (
            <Pill key={t} variant="tonal" className={type === t ? "bg-accent-blue-container text-foreground" : ""} onClick={() => { setType(t); setErr(""); setQc(null); setBusy("") }}>{t}</Pill>
          ))}
        </div>
        {type !== "Plex" && type !== "Jellyfin" && field("name", tr("pages.sources.name"))}
        {type === "M3U" && field("url", tr("pages.sources.playlistUrl"), "url", "url")}
        {type === "Xtream" && (<>{field("server", tr("pages.sources.server"), "url", "url")}{field("user", tr("pages.sources.user"), "text", undefined, "username")}{field("pass", tr("pages.sources.pass"), "password", undefined, "current-password")}</>)}
        {type !== "Plex" && type !== "Jellyfin" && field("epgUrl", tr("pages.sources.epg"), "url", "url")}

        {type === "Plex" && !manual && !pin && !servers && (
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground">{tr("pages.sources.plexInfo")}</p>
            <div className="flex flex-wrap gap-3"><Pill variant="primary" disabled={!!busy} onClick={signIn}>{busy || tr("pages.sources.plexSignIn")}</Pill><Pill onClick={() => { setManual(true); setErr("") }}>{tr("pages.sources.useToken")}</Pill></div>
          </div>
        )}
        {type === "Plex" && pin && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="text-muted-foreground">{tr("pages.sources.plexEnter")} <b dir="ltr" className="text-foreground">plex.tv/link</b></div>
            <div dir="ltr" className="text-6xl font-semibold tracking-[0.3em] md:text-7xl">{pin.code}</div>
            <div className="flex items-center gap-3 text-muted-foreground"><div className="size-5 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />{busy || tr("pages.sources.waitSignIn")}</div>
            <Pill variant="ghost" onClick={() => { setPin(null); setBusy("") }}>{tr("common.cancel")}</Pill>
          </div>
        )}
        {type === "Plex" && servers && servers.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-lg">{tr("pages.sources.connection")}</div>
            <div role="radiogroup" aria-label={tr("pages.sources.connMode")} data-nav-group className="flex flex-wrap gap-2">
              {([["auto", tr("pages.sources.modeAuto")], ["norelay", tr("pages.sources.modeNoRelay")], ["local", tr("pages.sources.modeLocal")]] as const).map(([v, label]) => (
                <Pill key={v} role="radio" aria-checked={connMode === v} variant={connMode === v ? "primary" : "tonal"} onClick={() => setConnMode(v)}>{label}</Pill>
              ))}
            </div>
            <div className="text-sm text-muted-foreground">{tr(connMode === "local" ? "pages.sources.descLocal" : connMode === "norelay" ? "pages.sources.descNoRelay" : "pages.sources.descAuto")}</div>
            <div className="mt-2 text-lg">{tr("pages.sources.chooseServer")}</div>
            {servers.map((s) => (
              <Pill key={s.id} className="h-auto min-h-14 justify-between gap-4 py-2" disabled={!!busy} onClick={() => choose(s)}>
                <span dir="auto" className="truncate">{s.name}</span><span className="text-sm text-muted-foreground">{conn(s)}</span>
              </Pill>
            ))}
            {busy && <div className="flex items-center gap-3 text-muted-foreground"><div className="size-5 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />{busy}</div>}
          </div>
        )}
        {type === "Plex" && manual && (<>{field("server", tr("pages.sources.serverPlex"), "url", "url")}{field("token", tr("pages.sources.plexToken"), "password")}{field("name", tr("pages.sources.nameOpt"))}</>)}
        {type === "Jellyfin" && !qc && (<>
          <p className="text-muted-foreground">{tr("pages.sources.jfInfo")}</p>
          {field("server", tr("pages.sources.serverJf"), "url", "url")}{field("user", tr("pages.sources.user"), "text", undefined, "username")}{field("pass", tr("pages.sources.pass"), "password", undefined, "current-password")}
        </>)}
        {type === "Jellyfin" && qc && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="text-muted-foreground">{tr("pages.sources.qcPre")} <b dir="ltr" className="text-foreground">Settings &gt; Quick Connect</b> {tr("pages.sources.qcPost")}</div>
            <div dir="ltr" className="text-6xl font-semibold tracking-[0.3em] md:text-7xl">{qc.code}</div>
            <div className="flex items-center gap-3 text-muted-foreground"><div className="size-5 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />{busy || tr("pages.sources.waitApproval")}</div>
            <Pill variant="ghost" onClick={() => { setQc(null); setBusy("") }}>{tr("common.cancel")}</Pill>
          </div>
        )}
        {err && <p role="alert" className="text-destructive">{err}</p>}

        <div className="flex flex-wrap gap-3 pt-2">
          {type !== "Plex" && type !== "Jellyfin" && <Pill variant="primary" disabled={!ok} onClick={save}>{tr("pages.sources.saveLoad")}</Pill>}
          {type === "Jellyfin" && !qc && <><Pill variant="primary" disabled={!ok || !!busy} onClick={() => { const sv = normServer(f.server); void jfAdd(sv, () => jellyfinSignIn(sv, f.user, f.pass)) }}>{busy || tr("pages.sources.signIn")}</Pill><Pill disabled={!f.server || !!busy} onClick={jfQuick}>{tr("pages.sources.quickConnect")}</Pill></>}
          {type === "Plex" && manual && <><Pill variant="primary" disabled={!ok} onClick={save}>{tr("pages.sources.saveLoad")}</Pill><Pill onClick={() => { setManual(false); setErr("") }}>{tr("pages.sources.plexSignIn")}</Pill></>}
          {type === "Plex" && servers && <Pill onClick={() => { setServers(null); setErr("") }}>{tr("common.back")}</Pill>}
          {cancel()}
        </div>
      </div>
    </div>
  )
}
