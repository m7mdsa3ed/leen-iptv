import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Pill } from "@/components/gtv"
import { useApp } from "@/lib/store"
import { useRoute } from "@/lib/nav"

export default function Sources() {
  const addSource = useApp((s) => s.addSource)
  const reset = useRoute((s) => s.reset)
  const [type, setType] = useState<"M3U" | "Xtream">("Xtream")
  const [f, setF] = useState({ name: "", url: "", epgUrl: "", server: "", user: "", pass: "" })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.trim() })
  const ok = f.name && (type === "M3U" ? /^https?:\/\//.test(f.url) : /^https?:\/\//.test(f.server) && f.user && f.pass)

  const save = () => {
    addSource(
      type === "M3U"
        ? { name: f.name, type: "m3u", url: f.url, epgUrl: f.epgUrl || undefined }
        : { name: f.name, type: "xtream", server: f.server, user: f.user, pass: f.pass, epgUrl: f.epgUrl || undefined },
    )
    reset("home") // App loads the new active source
  }
  const field = (k: keyof typeof f, ph: string, type = "text", inputMode?: "url", ac = "off") => (
    <Input data-nav className="h-12 rounded-2xl text-base md:h-14 md:text-xl" type={type} inputMode={inputMode} autoComplete={ac} spellCheck={false} placeholder={ph} value={f[k]} onChange={set(k)} autoCapitalize="off" autoCorrect="off" />
  )

  return (
    <div className="flex h-full flex-col items-center gap-6 overflow-y-auto bg-background p-4 py-[max(1rem,env(safe-area-inset-top))] md:justify-center">
      <div className="flex w-full max-w-[40rem] flex-col gap-3 rounded-[28px] bg-surface p-6">
        <h1 className="text-3xl font-medium tracking-tight md:text-4xl">Add a source</h1>
        <div className="flex gap-2 py-2">
          {(["Xtream", "M3U"] as const).map((t) => (
            <Pill key={t} variant="tonal" className={type === t ? "bg-accent-blue-container text-foreground" : ""} onClick={() => setType(t)}>{t}</Pill>
          ))}
        </div>
        {field("name", "Name")}
        {type === "M3U" ? field("url", "Playlist URL (http://...m3u)", "url", "url") : (<>{field("server", "Server (http://host:port)", "url", "url")}{field("user", "Username", "text", undefined, "username")}{field("pass", "Password", "password", undefined, "current-password")}</>)}
        {field("epgUrl", "EPG / XMLTV URL (optional)", "url", "url")}
        <div className="flex flex-wrap gap-3 pt-2">
          <Pill variant="primary" disabled={!ok} onClick={save}>Save and load</Pill>
          {useApp.getState().sources.length > 0 && <Pill variant="ghost" onClick={() => useRoute.getState().back()}>Cancel</Pill>}
        </div>
      </div>
    </div>
  )
}
