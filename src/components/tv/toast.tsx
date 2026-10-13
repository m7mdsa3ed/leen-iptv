import { X } from "lucide-react"
import { openNote, useNotify } from "@/lib/notify"

/** In-app notifications (e.g. a followed team's kickoff): a small card, bottom-end. No focus trap and no data-nav, so it never takes
 *  focus or keys (the player keeps them); a click / tap opens what it is about (the bell in the top bar lists it too). */
export function Toasts() {
  const cur = useNotify((s) => s.cur)
  const close = useNotify((s) => s.close)
  if (!cur) return null
  return (
    <div role="status" aria-live="polite" className="m-pop fixed bottom-4 end-4 z-[60] flex max-w-[26rem] items-start gap-3 rounded-2xl bg-surface-3 p-4 text-foreground shadow-2xl">
      <div className={cur.route ? "min-w-0 flex-1 cursor-pointer" : "min-w-0 flex-1"} onClick={cur.route ? () => { close(); openNote(cur.route) } : undefined}>
        <div dir="auto" className="text-base font-medium">{cur.title}</div>
        {cur.body && <div dir="auto" className="mt-0.5 text-sm text-muted-foreground">{cur.body}</div>}
      </div>
      <button type="button" tabIndex={-1} aria-label="Close" onClick={close} className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2"><X className="size-4" /></button>
    </div>
  )
}
