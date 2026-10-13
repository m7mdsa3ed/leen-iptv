import { useState } from "react"
import { Bell, CalendarDays, Check, Settings, Trash2, Trophy, Tv, X } from "lucide-react"
import { Pill } from "@/components/gtv"
import { useMode } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"
import { clearInbox, markRead, openNote, useInbox } from "@/lib/notify"
import type { Note } from "@/lib/notify-pure"
import { useBackStep } from "@/lib/nav"
import { openSection } from "@/settings/open"
import { cn } from "@/lib/utils"

const ICON = { kickoff: Trophy, live: Trophy, final: Trophy, digest: CalendarDays, episode: Tv }

/** Top-bar bell (beside the metadata chip): unread count; pressing it lists the notifications fired on this device. Hidden while the inbox is empty. */
export function InboxButton() {
  const list = useInbox((s) => s.list)
  const [open, setOpen] = useState(false)
  const tv = useMode() === "tv"
  useBackStep(open, () => setOpen(false))
  if (!list.length && !open) return null
  const unread = list.filter((n) => !n.read).length
  const label = fmt.plural("gtv.inbox.unread", unread)
  return (
    <>
      {list.length > 0 && (
        <button data-nav data-pill aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}
          className={cn("flex shrink-0 items-center gap-1.5 rounded-full font-medium tabular-nums", unread ? "bg-accent-blue-container text-foreground" : "bg-surface-2 text-muted-foreground", tv ? "min-h-11 px-4 text-base" : "min-h-8 px-2.5 text-xs")}>
          <Bell className={tv ? "size-4" : "size-3.5"} />{unread > 0 && fmt.number(unread)}
        </button>
      )}
      {open && <Panel close={() => setOpen(false)} />}
    </>
  )
}

function Panel({ close }: { close: () => void }) {
  const t = useT()
  const list = useInbox((s) => s.list)
  const mobile = useMode() === "mobile"
  const pick = (n: Note) => { markRead(n.key); close(); openNote(n.route) }
  return (
    <div data-modal role="dialog" aria-modal="true" aria-label={t("gtv.inbox.title")} onClick={(e) => e.target === e.currentTarget && close()}
      className={cn("fixed inset-0 z-50 flex m-fade", mobile ? "items-end bg-black/50" : "items-start justify-end bg-black/30 pe-[var(--gx)] pt-[calc(var(--hdr)+.25rem)]")}>
      <div className={cn("flex flex-col overflow-hidden bg-surface text-foreground shadow-2xl", mobile ? "m-rise max-h-[80vh] w-full rounded-t-[28px] border-t border-[var(--fg-10)] pb-[var(--safe-b)]" : "m-pop max-h-[min(36rem,calc(100vh-var(--hdr)-2rem))] w-[26rem] rounded-[28px]")}>
        <div data-nav-group className="flex items-center gap-2 px-5 pb-2 pt-4">
          <h2 className="min-w-0 flex-1 truncate text-lg font-medium">{t("gtv.inbox.title")}</h2>
          <button data-nav data-pill aria-label={t("gtv.inbox.readAll")} title={t("gtv.inbox.readAll")} onClick={() => markRead()} className="grid size-10 place-items-center rounded-full text-muted-foreground"><Check className="size-5" /></button>
          <button data-nav data-pill aria-label={t("gtv.inbox.clear")} title={t("gtv.inbox.clear")} onClick={() => { clearInbox(); close() }} className="grid size-10 place-items-center rounded-full text-muted-foreground"><Trash2 className="size-5" /></button>
          <button data-nav data-pill aria-label={t("common.close")} onClick={close} className="grid size-10 place-items-center rounded-full text-muted-foreground"><X className="size-5" /></button>
        </div>
        <div data-nav-group className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {!list.length && <p className="px-3 py-6 text-center text-muted-foreground">{t("gtv.inbox.empty")}</p>}
          {list.map((n, i) => {
            const Icon = ICON[n.kind] ?? Bell
            return (
              <button key={n.key} data-nav data-pill data-autofocus={i === 0 ? "" : undefined} onClick={() => pick(n)} className="flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-start hover:bg-[var(--fg-10)]">
                <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-full", n.read ? "bg-surface-2 text-muted-foreground" : "bg-accent-blue-container")}><Icon className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span dir="auto" className={cn("block text-base", !n.read && "font-medium")}>{n.title}</span>
                  {n.body && <span dir="auto" className="line-clamp-2 block text-sm text-muted-foreground">{n.body}</span>}
                  <span className="block text-xs text-muted-foreground">{fmt.date(n.at, { weekday: "short", day: "numeric", month: "short" })} {fmt.time(n.at)}</span>
                </span>
              </button>
            )
          })}
        </div>
        <div className="border-t border-[var(--fg-10)] p-3">
          <Pill className="w-full" onClick={() => { close(); openSection("notifications") }}><Settings />{t("gtv.inbox.settings")}</Pill>
        </div>
      </div>
    </div>
  )
}
