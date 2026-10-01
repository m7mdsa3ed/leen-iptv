import { useState, type ComponentProps, type ReactNode } from "react"
import { Check } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Pill, RoundButton } from "@/components/gtv"
import { Toggle } from "@/components/gtv/toggle"
import { cn } from "@/lib/utils"

/** The ONLY building blocks sections may use, so every layout renders every section consistently. */
export { Pill, RoundButton, Toggle }

/** Rounded surface block. Optional title/description header. Sections stack several of these. */
export function SectionCard({ title, description, children, className }: { title?: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-[28px] bg-surface p-5 text-foreground md:p-6", className)}>
      {(title || description) && (
        <header className="flex flex-col gap-1">
          {title && <h3 className="text-xl font-medium">{title}</h3>}
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </header>
      )}
      {children}
    </section>
  )
}

/** Label/description left, control(s) right (wraps under on narrow screens). `stack` puts the control below. */
export function Row({ label, description, children, stack, className }: { label: ReactNode; description?: ReactNode; children?: ReactNode; stack?: boolean; className?: string }) {
  return (
    <div className={cn("flex gap-x-6 gap-y-3", stack ? "flex-col" : "flex-wrap items-center justify-between", className)}>
      <div className={cn("min-w-0", !stack && "flex-1 basis-56")}>
        <div className="text-base font-medium">{label}</div>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
      </div>
      {children != null && <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

/** Row with a switch on the right. */
export function ToggleRow({ label, description, checked, onChange, disabled }: { label: string; description?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Row label={label} description={description}>
      <Toggle label={label} checked={checked} onChange={onChange} disabled={disabled} className="w-auto bg-transparent p-0 [&>span:first-child]:sr-only" />
    </Row>
  )
}

/** Labelled text input with an inline validation message (shown when `error` is set). */
export function Field({ label, value, onChange, error, hint, className, ...p }: Omit<ComponentProps<typeof Input>, "onChange" | "value" | "className"> & { label: string; value: string; onChange: (v: string) => void; error?: string; hint?: ReactNode; className?: string }) {
  return (
    <label className={cn("flex w-full max-w-[32rem] flex-col gap-1.5", className)}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <Input data-nav autoComplete="off" spellCheck={false} aria-invalid={error ? true : undefined} {...p} value={value} onChange={(e) => onChange(e.target.value)} className="h-12 w-full rounded-2xl text-base focus-visible:ring-0 md:text-lg [html[data-mode=mobile]_&]:text-[16px]" />
      {error ? <span role="alert" className="text-sm text-destructive">{error}</span> : hint ? <span className="text-sm text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

/** 2-5 mutually exclusive options as pills. */
export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} data-nav-group className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Pill key={String(o.value)} role="radio" aria-checked={o.value === value} variant={o.value === value ? "primary" : "tonal"} onClick={() => o.value !== value && onChange(o.value)}>{o.label}</Pill>
      ))}
    </div>
  )
}

/** Colour picker: round swatches (hex values). */
export function Swatches({ value, colors, onChange, label }: { value: string; colors: readonly string[]; onChange: (hex: string) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} data-nav-group className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button key={c} data-nav data-pill type="button" role="radio" aria-checked={c.toLowerCase() === value.toLowerCase()} aria-label={c} onClick={() => onChange(c)} style={{ background: c }} className="grid size-11 shrink-0 place-items-center rounded-full text-white">
          {c.toLowerCase() === value.toLowerCase() && <Check className="size-5" />}
        </button>
      ))}
    </div>
  )
}

/** Destructive action that needs a second press (resets on blur). */
export function ConfirmButton({ children, confirmLabel = "Press again to confirm", onConfirm, disabled, className }: { children: ReactNode; confirmLabel?: string; onConfirm: () => void; disabled?: boolean; className?: string }) {
  const [armed, setArmed] = useState(false)
  return (
    <Pill variant={armed ? "primary" : "ghost"} disabled={disabled} className={className} onBlur={() => setArmed(false)} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? confirmLabel : children}
    </Pill>
  )
}
