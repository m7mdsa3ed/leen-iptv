import { useRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode, type Ref } from "react"
import { Check, X } from "lucide-react"
import { isTv } from "@/lib/device"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/* The player's five primitives (look in player.css). Every control in src/player is one of these, so sizes, fills, the picked
   state and TV focus (data-pill: the app turns it white; data-primary: + the accent ring) are the same everywhere. */

type B = ButtonHTMLAttributes<HTMLButtonElement>
const flag = (b?: boolean) => (b ? "" : undefined)

/** Round icon button: transport, back, close, steppers. `on` = a toggle that is on (white). */
export const IconBtn = ({ label, on, size, className, ...b }: B & { label: string; on?: boolean; size?: "sm" | "lg" }) => (
  <button type="button" data-nav data-pill data-on={flag(on)} data-primary={flag(on)} data-size={size} aria-label={label} className={cn("pl-ibtn", className)} {...b} />
)

/** Pill with an optional icon: the control row, choices, actions, tabs. `on` = picked / the main action (white); `ghost` = no fill
 *  until picked (the panel's tabs); `dot` = a small accent dot (something in there is active). */
export const Chip = ({ icon, on, ghost, dot, size, className, children, ...b }: B & { icon?: ReactNode; on?: boolean; ghost?: boolean; dot?: boolean; size?: "lg" }) => (
  <button type="button" data-nav data-pill data-on={flag(on)} data-primary={flag(on)} data-ghost={flag(ghost && !on)} data-size={size} className={cn("pl-chip", className)} {...b}>
    {icon}{children}{dot && <span aria-hidden className="pl-dot" />}
  </button>
)

/** List row (tracks, versions, episodes, channels, categories): an optional lead (thumbnail, logo), a label with an optional second
 *  line, and a trail (default: a check while `on`, and the row is a pick: aria-pressed). */
export const Row = ({ on, lead, label, detail, trail, className, ...b }: Omit<B, "children"> & { on?: boolean; lead?: ReactNode; label: ReactNode; detail?: ReactNode; trail?: ReactNode }) => (
  <button type="button" data-nav data-pill data-on={flag(on)} aria-pressed={trail === undefined ? !!on : undefined} className={cn("pl-row", className)} {...b}>
    {lead}
    <span className="pl-row-text">
      <bdi dir="auto">{label}</bdi>
      {detail && <span className="pl-row-detail">{detail}</span>}
    </span>
    {trail === undefined ? on && <Check /> : trail}
  </button>
)

/** Small label: facts, "Playing", the red LIVE. */
export const Tag = ({ tone, children }: { tone?: "live" | "on"; children: ReactNode }) => <span className="pl-tag" data-tone={tone}><bdi>{children}</bdi></span>

/** A titled block inside a sheet. */
export const Group = ({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) => (
  <section className={cn("pl-group", className)}>
    <h3 className="pl-label">{title}</h3>
    {children}
  </section>
)

/** One line of choices (a chip each), the picked one white. One line for the D-pad. */
export function Choices<T extends string | number>({ items, value, onPick, label }: { items: T[]; value: T; onPick: (v: T) => void; label: (v: T) => ReactNode }) {
  return (
    <div data-nav-group className="pl-wrap">
      {items.map((v) => <Chip key={String(v)} on={v === value} aria-pressed={v === value} onClick={() => onPick(v)}>{label(v)}</Chip>)}
    </div>
  )
}

/**
 * The one surface for a layer over the video: a scrim (tap = close), then a head (`head`, plus Close on pointer devices) over the
 * caller's body. side bottom = the panel (swipe down on the head closes it), start = the channel list. [data-modal] keeps the D-pad in.
 */
export function Sheet({ side, label, head, onClose, sref, children, ...rest }: HTMLAttributes<HTMLElement> & { side: "bottom" | "start"; label: string; head: ReactNode; onClose: () => void; sref?: Ref<HTMLElement> }) {
  const t = useT()
  const y = useRef<number | null>(null)
  return (
    <>
      <div aria-hidden className="pl-scrim m-fade" onClick={onClose} />
      <section ref={sref} data-modal role="dialog" aria-label={label} data-side={side} className={side === "bottom" ? "pl-sheet m-rise" : "pl-sheet m-fade"} {...rest}>
        <header className="pl-sheet-head"
          onTouchStart={(e) => (y.current = e.touches[0].clientY)}
          onTouchEnd={(e) => { if (side === "bottom" && y.current !== null && e.changedTouches[0].clientY - y.current > 70) onClose(); y.current = null }}>
          {head}
          {!isTv && <IconBtn label={t("player.close")} onClick={onClose} className="ms-auto"><X /></IconBtn>}
        </header>
        {children}
      </section>
    </>
  )
}
