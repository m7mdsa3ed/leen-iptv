import { cn } from "@/lib/utils"

/** The app's switch. With a label it is a whole clickable row (label left, track right); without, just the track. */
export function Toggle({ checked, onChange, label, description, disabled, className }: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  description?: string
  disabled?: boolean
  className?: string
}) {
  const track = (
    <span className={cn("relative inline-block h-8 w-14 shrink-0 rounded-full", checked ? "bg-accent-blue" : "bg-surface-3")}>
      <span
        className={cn(
          "absolute top-1 start-1 size-6 rounded-full bg-white shadow transition-transform duration-150 [html[data-motion=off]_&]:transition-none",
          checked && "translate-x-6 rtl:-translate-x-6",
        )}
      />
    </span>
  )
  return (
    <button
      data-nav
      data-pill={label ? "" : undefined}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-11 min-w-11 shrink-0 items-center gap-4 text-start disabled:opacity-50",
        label ? "w-full rounded-full bg-surface-2 py-2.5 pe-3 ps-6 text-foreground" : "justify-center rounded-full",
        className,
      )}
    >
      {label && (
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium">{label}</span>
          {description && <span className="block text-sm opacity-70">{description}</span>}
        </span>
      )}
      {track}
    </button>
  )
}
