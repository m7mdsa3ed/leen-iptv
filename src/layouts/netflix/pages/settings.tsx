import "../settings.css"
import { Avatar } from "@/components/gtv"
import { Shell } from "@/components/tv/ui"
import { useProfile } from "@/lib/store"
import { useSync } from "@/lib/sync"
import { fmt, useT } from "@/lib/i18n"
import { SECTIONS, useSettingsNav, type SectionKey } from "@/settings/sections"

/** Netflix "Account" page: membership card, then divided blocks of rows; a row's link expands the shared section inline (accordion). */
const BLOCKS: { key: SectionKey; link: "manage" | "change" | "view" }[] = [
  { key: "profiles", link: "manage" },
  { key: "sources", link: "manage" },
  { key: "playback", link: "change" },
  { key: "display", link: "change" },
  { key: "metadata", link: "change" },
  { key: "history", link: "manage" },
  { key: "network", link: "change" },
  { key: "about", link: "view" },
]
const def = (k: SectionKey) => SECTIONS.find((s) => s.key === k)!

export default function Settings() {
  const t = useT()
  const { open, select, close } = useSettingsNav()
  const p = useProfile()
  const sync = useSync()
  const A = def("account").Component
  const st = sync.status.state
  const status = !sync.configured ? t("nf.settings.notSetUp") : !sync.session ? t("nf.settings.signedOut") : st === "syncing" ? t("nf.settings.syncing") : st === "error" ? t("nf.settings.syncError") : sync.status.lastSyncAt ? t("nf.settings.synced", { time: fmt.date(sync.status.lastSyncAt, { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) }) : t("nf.settings.signedIn")
  const toggle = (k: SectionKey) => (open === k ? close() : select(k))
  const acct = open === "account"
  return (
    <Shell page="settings" title={t("nf.settings.account")}>
      <div className="nf-page">
        <div className="nf-acct">
          <h1 className="nf-acct-h">{t("nf.settings.account")}</h1>
          <div className="nf-member">
            <Avatar name={p?.name ?? "?"} color={p?.color ?? "#5f6368"} className="nf-sq size-14 shrink-0 text-2xl" />
            <div className="min-w-0 flex-1">
              <div dir="auto" className="truncate text-lg font-semibold">{sync.session?.email ?? p?.name ?? t("nf.settings.guest")}</div>
              <div className="text-sm text-muted-foreground">{status}</div>
            </div>
            {sync.session && sync.configured && <button data-nav className="nf-btn" onClick={() => void sync.syncNow()} disabled={st === "syncing"}>{t("nf.settings.syncNow")}</button>}
            <button data-nav data-nav-home={acct ? "" : undefined} className="nf-btn" onClick={() => toggle("account")}>{acct ? t("nf.settings.close") : sync.session ? t("nf.settings.account") : t("nf.settings.signIn")}</button>
          </div>
          {acct && <div className="nf-body"><A /></div>}
          {BLOCKS.map((r) => (
            <section key={r.key} className="nf-blk">
              <h2 className="nf-blk-h">{t(`nf.settings.blk.${r.key}`)}</h2>
              {(() => {
                const s = def(r.key), on = open === r.key, C = s.Component
                return (
                  <div>
                    <div className="nf-rowx">
                      <div className="min-w-0 flex-1"><div className="text-base font-medium">{t(`nf.settings.row.${r.key}`)}</div><div className="text-sm text-muted-foreground">{s.description}</div></div>
                      <button data-nav data-nav-home={on ? "" : undefined} aria-expanded={on} onClick={() => toggle(r.key)} className="nf-act">{on ? t("nf.settings.close") : t(`nf.settings.${r.link}`)}</button>
                    </div>
                    {on && <div className="nf-body"><C /></div>}
                  </div>
                )
              })()}
            </section>
          ))}
        </div>
      </div>
    </Shell>
  )
}
