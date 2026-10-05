import { useEffect, useRef, useState, type ReactNode } from "react"
import { Check } from "lucide-react"
import { KEY } from "@/lib/nav"

export type Act = { label: string; run: () => void; icon?: ReactNode; detail?: string; checked?: boolean } // checked set = a pick list (radio rows; focus starts on the checked one)
type Trigger = { open: boolean; toggle: (e: React.MouseEvent<HTMLElement>) => void }

/**
 * Overflow ("⋯") menu for Detail actions (Mark watched, Remove from Continue watching, Match metadata).
 * The layout renders its own trigger button so it matches its neighbours. The popover is position: fixed (no hero / overflow clips it), flips above
 * the button near the bottom of the screen, keeps the D-pad inside ([data-modal]) and closes on Back / Esc / a click outside; focus returns to the trigger.
 */
export function ActionsMenu({ items, trigger }: { items: Act[]; trigger: (t: Trigger) => ReactNode }) {
  const [pos, setPos] = useState<null | { top?: number; bottom?: number; start: number }>(null)
  const trig = useRef<HTMLElement | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const close = (refocus = true) => { setPos(null); if (refocus) trig.current?.focus() }
  const toggle = (e: React.MouseEvent<HTMLElement>) => {
    if (pos) return close()
    trig.current = e.currentTarget
    const r = e.currentTarget.getBoundingClientRect()
    const rtl = document.documentElement.dir === "rtl"
    setPos({ ...(window.innerHeight - r.bottom > 260 ? { top: r.bottom + 8 } : { bottom: window.innerHeight - r.top + 8 }), start: rtl ? window.innerWidth - r.right : r.left })
  }
  useEffect(() => {
    if (!pos) return
    requestAnimationFrame(() => (box.current?.querySelector<HTMLElement>("[aria-checked=true]") ?? box.current?.querySelector<HTMLElement>("[data-nav]"))?.focus())
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node) && !trig.current?.contains(e.target as Node)) close(false) }
    document.addEventListener("pointerdown", down)
    return () => document.removeEventListener("pointerdown", down)
  }, [pos]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!items.length) return null
  return (
    <>
      {trigger({ open: !!pos, toggle })}
      {pos && (
        <div
          ref={box} data-modal role="menu"
          style={{ position: "fixed", top: pos.top, bottom: pos.bottom, insetInlineStart: pos.start }}
          className="m-pop z-50 flex min-w-60 max-w-[90vw] flex-col gap-1 rounded-2xl bg-surface-3 p-2 text-foreground shadow-2xl"
          // Back / Esc close the menu only: stop it before the app-level handler (on window) navigates back
          onKeyDown={(e) => { if (e.keyCode === KEY.back || e.keyCode === KEY.esc || e.keyCode === KEY.bksp) { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); close() } }}
        >
          {items.map((a, i) => (
            <button key={i} data-nav role={a.checked === undefined ? "menuitem" : "menuitemradio"} aria-checked={a.checked} onClick={() => { close(); a.run() }} className="flex min-h-11 items-center gap-3 rounded-xl px-4 py-2 text-start text-base hover:bg-foreground/10 focus-visible:bg-foreground/10">
              {a.icon}
              <span className="flex min-w-0 flex-1 flex-col">
                <span dir="auto">{a.label}</span>
                {a.detail && <span dir="auto" className="max-w-[min(28rem,70vw)] truncate text-sm text-muted-foreground">{a.detail}</span>}
              </span>
              {a.checked && <Check aria-hidden className="size-5 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
