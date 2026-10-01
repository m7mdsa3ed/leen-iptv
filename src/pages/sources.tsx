import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Pill } from "@/components/gtv"
import { useApp } from "@/lib/store"
import { useRoute } from "@/lib/nav"
import { explain } from "@/lib/net"
import { checkPin, createPin, pickConnection, plexServers, type Pin, type PlexServer } from "@/lib/plex"

type Type = "M3U" | "Xtream" | "Plex"

export default function Sources() {
  const addSource = useApp((s) => s.addSource)
  const reset = useRoute((s) => s.reset)
  const [type, setType] = useState<Type>("Xtream")
  const [f, setF] = useState({ name: "", url: "", epgUrl: "", server: "", user: "", pass: "", token: "" })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.trim() })
  // Plex sign-in: pin (waiting for the code at plex.tv/link) -> servers -> test connections -> save
  const [pin, setPin] = useState<Pin | null>(null)
  const [servers, setServers] = useState<PlexServer[] | null>(null)
  const [manual, setManual] = useState(false)
  const [busy, setBusy] = useState("")
  const [err, setErr] = useState("")
  const ok = type === "Plex" ? /^https?:\/\//.test(f.server) && f.token : f.name && (type === "M3U" ? /^https?:\/\//.test(f.url) : /^https?:\/\//.test(f.server) && f.user && f.pass)

  useEffect(() => {
    if (!pin) return
    let live = true
    const t = setInterval(async () => {
      try {
        const token = await checkPin(pin.id)
        if (!token || !live) return
        clearInterval(t)
        setBusy("Finding your servers...")
        const list = await plexServers(token)
        if (!live) return
        setServers(list); setPin(null); setBusy("")
        if (!list.length) setErr("No Plex Media Server found on this account.")
      } catch (e) {
        if (!live) return
        clearInterval(t)
        setErr(explain(e)); setPin(null); setBusy("")
      }
    }, 2000)
    return () => { live = false; clearInterval(t) }
  }, [pin])

  const signIn = async () => {
    setErr(""); setBusy("Contacting plex.tv...")
    try { setPin(await createPin()) } catch (e) { setErr(explain(e)) }
    setBusy("")
  }
  const choose = async (s: PlexServer) => {
    setErr(""); setBusy(`Connecting to ${s.name}...`)
    try {
      const server = await pickConnection(s)
      addSource({ name: s.name, type: "plex", server, token: s.token, serverId: s.id })
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
    <Input data-nav className="h-12 rounded-2xl text-base md:h-14 md:text-xl" type={type} inputMode={inputMode} autoComplete={ac} spellCheck={false} placeholder={ph} value={f[k]} onChange={set(k)} autoCapitalize="off" autoCorrect="off" />
  )
  const cancel = () => useApp.getState().sources.length > 0 && <Pill variant="ghost" onClick={() => useRoute.getState().back()}>Cancel</Pill>
  const conn = (s: PlexServer) => `${s.owned ? "Yours" : "Shared"} - ${s.connections.length} address${s.connections.length === 1 ? "" : "es"}`

  return (
    <div className="flex h-full flex-col items-center gap-6 overflow-y-auto bg-background p-4 py-[max(1rem,env(safe-area-inset-top))] md:justify-center">
      <div className="flex w-full max-w-[40rem] flex-col gap-3 rounded-[28px] bg-surface p-6">
        <h1 className="text-3xl font-medium tracking-tight md:text-4xl">Add a source</h1>
        <div className="flex gap-2 py-2">
          {(["Xtream", "M3U", "Plex"] as const).map((t) => (
            <Pill key={t} variant="tonal" className={type === t ? "bg-accent-blue-container text-foreground" : ""} onClick={() => { setType(t); setErr("") }}>{t}</Pill>
          ))}
        </div>
        {type !== "Plex" && field("name", "Name")}
        {type === "M3U" && field("url", "Playlist URL (http://...m3u)", "url", "url")}
        {type === "Xtream" && (<>{field("server", "Server (http://host:port)", "url", "url")}{field("user", "Username", "text", undefined, "username")}{field("pass", "Password", "password", undefined, "current-password")}</>)}
        {type !== "Plex" && field("epgUrl", "EPG / XMLTV URL (optional)", "url", "url")}

        {type === "Plex" && !manual && !pin && !servers && (
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground">Movies and shows from your Plex Media Server. No live TV or guide for Plex.</p>
            <div className="flex flex-wrap gap-3"><Pill variant="primary" disabled={!!busy} onClick={signIn}>{busy || "Sign in with Plex"}</Pill><Pill onClick={() => { setManual(true); setErr("") }}>Use a token instead</Pill></div>
          </div>
        )}
        {type === "Plex" && pin && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="text-muted-foreground">Enter this code at <b className="text-foreground">plex.tv/link</b></div>
            <div className="text-6xl font-semibold tracking-[0.3em] md:text-7xl">{pin.code}</div>
            <div className="flex items-center gap-3 text-muted-foreground"><div className="size-5 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />{busy || "Waiting for you to sign in..."}</div>
            <Pill variant="ghost" onClick={() => { setPin(null); setBusy("") }}>Cancel</Pill>
          </div>
        )}
        {type === "Plex" && servers && servers.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-lg">Choose a server</div>
            {servers.map((s) => (
              <Pill key={s.id} className="h-auto min-h-14 justify-between gap-4 py-2" disabled={!!busy} onClick={() => choose(s)}>
                <span className="truncate">{s.name}</span><span className="text-sm text-muted-foreground">{conn(s)}</span>
              </Pill>
            ))}
            {busy && <div className="flex items-center gap-3 text-muted-foreground"><div className="size-5 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />{busy}</div>}
          </div>
        )}
        {type === "Plex" && manual && (<>{field("server", "Server (http://host:32400)", "url", "url")}{field("token", "Plex token", "password")}{field("name", "Name (optional)")}</>)}
        {err && <p role="alert" className="text-destructive">{err}</p>}

        <div className="flex flex-wrap gap-3 pt-2">
          {type !== "Plex" && <Pill variant="primary" disabled={!ok} onClick={save}>Save and load</Pill>}
          {type === "Plex" && manual && <><Pill variant="primary" disabled={!ok} onClick={save}>Save and load</Pill><Pill onClick={() => { setManual(false); setErr("") }}>Sign in with Plex</Pill></>}
          {type === "Plex" && servers && <Pill onClick={() => { setServers(null); setErr("") }}>Back</Pill>}
          {cancel()}
        </div>
      </div>
    </div>
  )
}
