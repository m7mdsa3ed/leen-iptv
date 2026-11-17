import { useEffect, useRef, useState } from "react"
import { Menu, RefreshCw, Search, Settings, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"
import { MetaQueueButton } from "@/components/tv/meta-queue"
import { InboxButton } from "@/components/tv/inbox"
import { HealthButton } from "@/components/tv/health"
import { Avatar, LeenMark, Pill, RailItem, RoundButton } from "@/components/gtv"
import { Clock } from "@/components/tv/ui"
import { useBackStep } from "@/lib/nav"
import { isTv } from "@/lib/device"
import { useShellNav } from "../shared"
import type { ShellProps } from "../types"

export default function Shell({ page, title, children }: ShellProps) {
  const t = useT()
  const { tabs, go, status, profile, mobile, tv } = useShellNav(page)
  const [menu, setMenu] = useState(false)
  useBackStep(menu, () => setMenu(false))
  const pick = (k: string) => { setMenu(false); go(k) }
  const PILL = 4 // ponytail: the pill holds 4 tabs + Menu; the rest live in the drawer
  const more = tabs.slice(PILL)
  const inMore = more.some((x) => x.key === page)
  const search = (
    <RoundButton label={t("gtv.shell.search")} title={t("gtv.shell.search")} active={page === "search"} data-autofocus={page === "search" ? "" : undefined} onClick={() => go("search")} className="bg-transparent">
      <Search />
    </RoundButton>
  )
  const queue = <><MetaQueueButton /><HealthButton /><InboxButton /></> // titles waiting for metadata (activity panel) + source health + the notifications bell
  const state = <span className={cn("text-muted-foreground", tv ? "text-xl" : "text-sm")}>{status === "loading" ? t("gtv.shell.updating") + " " : ""}<Clock /></span>
  const main = <main data-page-content className={cn("min-h-0 flex-1 ps-[var(--gs)] pe-[var(--gx)] pb-[var(--content-b)] pt-[var(--content-t)] [scroll-padding-top:var(--content-t)]", tv ? "overflow-hidden" : "overflow-y-auto")}>{children}</main>
  // bars, safe areas and their gradients: see "Bars and safe areas" in index.css (.topbar = exactly --hdr tall, .float-nav = floating pill inside --nav-h, --rail-w = the side rail)
  if (!mobile) return (
    // desktop / tablet / TV: no top bar. A transparent side rail floats over the page (layout.css "Side navigation rail"; pages keep clear of it with --gs)
    // and holds everything the bar had: Search, the tabs, the status items (metadata queue, sources, notifications), the clock and the profile.
    <div className="has-rail relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <h1 className="sr-only">{title}</h1>
      {main}
      <SideRail page={page} go={go} />
    </div>
  )
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="topbar">
        <LeenMark className="size-8" />
        <h1 className="min-w-0 flex-1 truncate text-xl font-medium">{title}</h1>
        {queue}
        {state}
        {search}
      </header>
      {main}
      <nav data-nav-wrap aria-label={t("gtv.shell.main")} className="float-nav">
        {tabs.slice(0, PILL).map(({ key: k, label, route, icon: Icon }) => (
          <button key={k} data-nav data-nav-home={k === page ? "" : undefined} aria-current={k === page ? "page" : undefined} onClick={() => go(route)} className="float-tab">
            <Icon className="size-5" />{label}
          </button>
        ))}
        <button data-nav data-nav-home={inMore || page === "settings" ? "" : undefined} aria-current={inMore || page === "settings" ? "page" : undefined} aria-expanded={menu} onClick={() => setMenu(true)} className="float-tab">
          <Menu className="size-5" />{t("gtv.shell.menu")}
        </button>
      </nav>
      {menu && (
        <div data-modal role="dialog" aria-modal="true" aria-label={t("gtv.shell.menu")} className="fixed inset-0 z-50 flex items-end bg-black/50 m-fade" onClick={(e) => e.target === e.currentTarget && setMenu(false)}>
          <div className="m-rise w-full rounded-t-[28px] border-t border-[var(--fg-10)] bg-surface ps-[var(--gs)] pe-[var(--gx)] pb-[calc(var(--safe-b)+1rem)] pt-3 shadow-2xl">
            <div aria-hidden className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--fg-30)]" />
            <div className="flex items-center gap-3">
              <Avatar name={profile?.name ?? "?"} color={profile?.color ?? "#5f6368"} photo={profile?.photo} className="size-12 text-lg" />
              <div className="min-w-0 flex-1">
                <div dir="auto" className="truncate text-lg font-medium">{profile?.name}</div>
                <div className="truncate text-sm text-muted-foreground">{state}</div>
              </div>
              <Pill data-autofocus className="min-h-10 px-4 text-sm" onClick={() => pick("profiles")}><Users />{t("gtv.shell.switchProfile")}</Pill>
            </div>
            {more.length > 0 && (
              <div data-nav-group className="mt-5 grid grid-cols-3 gap-2">
                {more.map(({ key: k, label, route, icon: Icon }) => (
                  <button key={k} data-nav aria-current={k === page ? "page" : undefined} onClick={() => pick(route)} className={cn("flex flex-col items-center gap-2 rounded-2xl py-3 text-sm", k === page ? "bg-accent-blue-container font-semibold" : "bg-surface-2 text-muted-foreground")}>
                    <Icon className="size-6" />{label}
                  </button>
                ))}
              </div>
            )}
            <button data-nav aria-current={page === "settings" ? "page" : undefined} onClick={() => pick("settings")} className="mt-2 flex min-h-12 w-full items-center gap-3 rounded-2xl bg-surface-2 px-4 text-base">
              <Settings className="size-5 text-muted-foreground" />{t("common.settings")}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Side navigation (desktop, tablet, TV): a column of icons that opens over the page with labels on hover, or while keyboard / D-pad focus is inside it
    (a mouse click focuses the item too, but must not hold it open). Look: "Side navigation rail" in layout.css; D-pad: [data-nav-rail] in lib/nav.ts. */
function SideRail({ page, go }: { page: string; go: (k: string) => void }) {
  const t = useT()
  const { tabs, profile, tv, status } = useShellNav(page)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    let kbd = isTv
    const k = () => { kbd = true }, p = () => { if (!isTv) kbd = false } // a click must not hold the rail open (TV: the Magic Remote pointer focuses by hover, keep it)
    // document-wide: also closes a rail whose tab view was hidden while it held focus (cached tab views stay mounted)
    const f = () => { const a = document.activeElement; setOpen(kbd && !!a && !!ref.current?.contains(a) && !a.closest("[data-modal]")) } // a status panel the rail opened is not the rail
    window.addEventListener("keydown", k, true)
    window.addEventListener("pointerdown", p, true)
    document.addEventListener("focusin", f)
    document.addEventListener("focusout", f)
    return () => { window.removeEventListener("keydown", k, true); window.removeEventListener("pointerdown", p, true); document.removeEventListener("focusin", f); document.removeEventListener("focusout", f) }
  }, [])
  return (
    <aside className="gtv-rail" data-open={open ? "" : undefined}>
      <nav ref={ref} data-nav-rail data-nav-aside aria-label={t("gtv.shell.main")} className="gtv-rail-panel no-scrollbar">
        {/* three groups: the outer two share the free height equally, so Search + the tabs sit on the screen's vertical centre */}
        <div className="gtv-rail-top">
          <div aria-hidden className="gtv-rail-logo"><LeenMark className={tv ? "size-11" : "size-9"} /></div>
          <div className="gtv-rail-clock" role="status">
            {status === "loading" && <><span className="sr-only">{t("gtv.shell.updating")}</span><RefreshCw aria-hidden className={cn("size-3", !tv && "animate-spin")} /></>}
            <Clock />
          </div>
        </div>
        <div className="gtv-rail-mid">
          <RailItem label={t("gtv.shell.search")} current={page === "search"} onClick={() => go("search")}><Search /></RailItem>
          {tabs.map(({ key: k, label, route, icon: Icon }) => (
            <RailItem key={k} label={label} current={k === page} home={k === page} onClick={() => go(route)}><Icon /></RailItem>
          ))}
        </div>
        <div className="gtv-rail-end">
          <MetaQueueButton rail /><HealthButton rail /><InboxButton rail />
          <RailItem label={profile?.name ? `${t("common.settings")} (${profile.name})` : t("common.settings")} current={page === "settings"} onClick={() => go("settings")}>
            <Avatar name={profile?.name ?? "?"} color={profile?.color ?? "#5f6368"} photo={profile?.photo} className="gtv-rail-avatar" />
          </RailItem>
        </div>
      </nav>
    </aside>
  )
}

