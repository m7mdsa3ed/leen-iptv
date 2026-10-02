/** A key name chip + its label ("OK Guide"). Key names are never translated; the chip stays LTR. */
export function KeyHint({ k, label }: { k: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <bdi dir="ltr" className="rounded-md bg-white/15 px-1.5 py-0.5 text-[0.8em] font-medium leading-none">{k}</bdi>
      <span>{label}</span>
    </span>
  )
}
