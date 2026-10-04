import { X } from "lucide-react"
import { useNotify } from "@/lib/notify"

/** In-app notifications (e.g. a followed team's kickoff): a small card, bottom-end. No focus trap. */
export function Toasts() {
  const cur = useNotify((s) => s.cur)
  const close = useNotify((s) => s.close)
  if (!cur) return null
  return (
    <div role="status" aria-live="polite" className="m-pop fixed bottom-4 end-4 z-[60] flex max-w-[26rem] items-start gap-3 rounded-2xl bg-surface-3 p-4 text-foreground shadow-2xl">
      <div className="min-w-0 flex-1">
        <div dir="auto" className="text-base font-medium">{cur.title}</div>
        {cur.body && <div dir="auto" className="mt-0.5 text-sm text-muted-foreground">{cur.body}</div>}
      </div>
      <button type="button" aria-label="Close" onClick={close} className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2"><X className="size-4" /></button>
    </div>
  )
}
