import { useRef, useState } from "react"
import { ChevronDown, Search, X } from "lucide-react"
import { Avatar } from "@/components/gtv"
import { useRoute } from "@/lib/nav"
import { cn } from "@/lib/utils"
import { useShellNav } from "../shared"
import type { ShellProps } from "../types"
import { Dropdown, Pick } from "./ui"

/** Netflix: red LEEN wordmark + text tabs left; search + square profile avatar with caret right. Gradient bar that turns solid after scrolling (all pages). Search icon expands into an inline input. Mobile: slim top bar + bottom nav. */
export default function Shell({ page, title, children }: ShellProps) {
  const { tabs, go, mobile, tv, profile } = useShellNav(page)
  const reset = useRoute((s) => s.reset)
  const [scrolled, setScrolled] = useState(false)
  const [sq, setSq] = useState<string | null>(null) // null = collapsed
  const inp = useRef<HTMLInputElement>(null)
  const solid = scrolled
  // only the page scrollers (rails scroll sideways and must not flip the state)
  const onScroll = (e: React.UIEvent) => {
    const t = e.target as HTMLElement
    if (!t.matches(".nf-page, [data-page-content]")) return
    setScrolled(t.scrollTop > 24)
  }
  const search = sq === null ? (
    <button data-nav data-autofocus={page === "search" ? "" : undefined} data-nav-home={page === "search" ? "" : undefined} aria-label="Search" onClick={() => { if (page === "search" || mobile || tv) go("search") /* TV: the Search page has the full-size field */; else { setSq(""); requestAnimationFrame(() => inp.current?.focus()) } }} className="nf-hbtn"><Search className="size-6" /></button>
  ) : (
    <form onSubmit={(e) => { e.preventDefault(); setSq(null); go("search") }} className="nf-hsearch">
      <Search className="size-5 shrink-0" />
      <input ref={inp} data-nav type="search" autoComplete="off" enterKeyHint="search" value={sq} onChange={(e) => setSq(e.target.value)} onBlur={() => !sq && setSq(null)} onKeyDown={(e) => { if (e.key === "Escape") setSq(null) }} placeholder="Titles, channels" />
      <button type="button" data-nav aria-label="Close search" onClick={() => setSq(null)} className="nf-hbtn !min-h-0 !min-w-0"><X className="size-4" /></button>
    </form>
  )
  const avatar = (
    <Dropdown align="right" className="nf-hbtn nf-pbtn" trigger={<><Avatar name={profile?.name ?? "?"} color={profile?.color ?? "#5f6368"} className="size-8 nf-sq" /><ChevronDown className="size-4" /></>}>
      {(close) => (
        <>
          <div className="px-3 py-2 text-xs text-muted-foreground">{profile?.name}</div>
          <Pick onClick={() => { close(); go("settings") }}>Settings</Pick>
          <Pick onClick={() => { close(); reset("profiles") }}>Switch profile</Pick>
          <Pick onClick={() => { close(); go("sources") }}>Sources</Pick>
        </>
      )}
    </Dropdown>
  )
  return (
    <div onScrollCapture={onScroll} className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <header data-nav-wrap className={cn("absolute inset-x-0 top-0 z-30 flex items-center gap-2 px-[var(--gx)]", mobile ? "pt-[env(safe-area-inset-top)]" : "")} style={{ height: "var(--hdr)" }}>
        <div aria-hidden className="nf-bg hdr-fade" data-on={solid ? undefined : ""} />
        <div aria-hidden className="nf-bg bg-background" data-on={solid ? "" : undefined} />
        <h1 className="sr-only">{title}</h1>
        <span aria-hidden className="nf-logo relative">LEEN</span>
        {!mobile && (
          <nav className="relative flex min-w-0 items-center gap-2">
            {tabs.map(({ key: k, label, route }) => (
              <button key={k} data-nav data-nav-home={k === page ? "" : undefined} data-autofocus={k === page ? "" : undefined} data-active={k === page ? "" : undefined} onClick={() => go(route)} className={cn("nf-tab", tv && "text-lg")}>{label}</button>
            ))}
          </nav>
        )}
        <div className="relative ml-auto flex items-center gap-1">{search}{avatar}</div>
      </header>
      <main data-page-content className={cn("min-h-0 flex-1 px-[var(--gx)] pt-[var(--hdr)] [scroll-padding-top:var(--hdr)]", tv ? "overflow-hidden" : "overflow-y-auto")}>{children}</main>
      {mobile && (
        <nav data-nav-wrap className="flex shrink-0 border-t border-[var(--fg-10)] bg-background pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
          {tabs.map(({ key: k, label, route, icon: Icon }) => (
            <button key={k} data-nav data-nav-home={k === page ? "" : undefined} onClick={() => go(route)} className={cn("flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] [@media(max-height:500px)]:h-12", k === page ? "font-bold text-foreground" : "text-muted-foreground")}>
              <Icon className="size-6" />
              {label}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
