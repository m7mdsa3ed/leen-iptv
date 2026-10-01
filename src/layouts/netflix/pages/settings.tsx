import "../settings.css"
import { Avatar } from "@/components/gtv"
import { Shell } from "@/components/tv/ui"
import { useProfile } from "@/lib/store"
import { useSync } from "@/lib/sync"
import { SECTIONS, useSettingsNav, type SectionKey } from "@/settings/sections"

/** Netflix "Account" page: membership card, then divided blocks of rows; a row's link expands the shared section inline (accordion). */
const BLOCKS: { title: string; keys: { key: SectionKey; label: string; link: string }[] }[] = [
  { title: "Profiles & parental controls", keys: [{ key: "profiles", label: "Profiles & PIN", link: "Manage" }] },
  { title: "Sources", keys: [{ key: "sources", label: "Sources", link: "Manage" }] },
  { title: "Playback", keys: [{ key: "playback", label: "Playback", link: "Change" }] },
  { title: "Display", keys: [{ key: "display", label: "Display", link: "Change" }] },
  { title: "Metadata", keys: [{ key: "metadata", label: "Metadata", link: "Change" }] },
  { title: "Data & privacy", keys: [{ key: "history", label: "History & stats", link: "Manage" }] },
  { title: "Network", keys: [{ key: "network", label: "Network", link: "Change" }] },
  { title: "About", keys: [{ key: "about", label: "About", link: "View" }] },
]
const def = (k: SectionKey) => SECTIONS.find((s) => s.key === k)!

export default function Settings() {
  const { open, select, close } = useSettingsNav()
  const p = useProfile()
  const sync = useSync()
  const A = def("account").Component
  const st = sync.status.state
  const status = !sync.configured ? "Sync not set up" : !sync.session ? "Signed out" : st === "syncing" ? "Syncing..." : st === "error" ? "Sync error" : sync.status.lastSyncAt ? `Synced ${new Date(sync.status.lastSyncAt).toLocaleString()}` : "Signed in"
  const toggle = (k: SectionKey) => (open === k ? close() : select(k))
  const acct = open === "account"
  return (
    <Shell page="settings" title="Account">
      <div className="nf-page">
        <div className="nf-acct">
          <h1 className="nf-acct-h">Account</h1>
          <div className="nf-member">
            <Avatar name={p?.name ?? "?"} color={p?.color ?? "#5f6368"} className="nf-sq size-14 shrink-0 text-2xl" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-semibold">{sync.session?.email ?? p?.name ?? "Guest"}</div>
              <div className="text-sm text-muted-foreground">{status}</div>
            </div>
            {sync.session && sync.configured && <button data-nav className="nf-btn" onClick={() => void sync.syncNow()} disabled={st === "syncing"}>Sync now</button>}
            <button data-nav data-nav-home={acct ? "" : undefined} className="nf-btn" onClick={() => toggle("account")}>{acct ? "Close" : sync.session ? "Account" : "Sign in"}</button>
          </div>
          {acct && <div className="nf-body"><A /></div>}
          {BLOCKS.map((b) => (
            <section key={b.title} className="nf-blk">
              <h2 className="nf-blk-h">{b.title}</h2>
              {b.keys.map((r) => {
                const s = def(r.key), on = open === r.key, C = s.Component
                return (
                  <div key={r.key}>
                    <div className="nf-rowx">
                      <div className="min-w-0 flex-1"><div className="text-base font-medium">{r.label}</div><div className="text-sm text-muted-foreground">{s.description}</div></div>
                      <button data-nav data-nav-home={on ? "" : undefined} aria-expanded={on} onClick={() => toggle(r.key)} className="nf-act">{on ? "Close" : r.link}</button>
                    </div>
                    {on && <div className="nf-body"><C /></div>}
                  </div>
                )
              })}
            </section>
          ))}
        </div>
      </div>
    </Shell>
  )
}
