import { Pill } from "@/components/gtv"
import { useT } from "@/lib/i18n"
import type { Seg } from "@/lib/plex-pure"

/** "Skip intro / recap / credits" while the playhead is inside that segment. With the controls hidden on TV, OK skips (use-keys). */
export function SkipButton({ seg, onSkip }: { seg: Seg; onSkip: () => void }) {
  const t = useT()
  return (
    <div className="m-rise absolute end-[var(--gx)] bottom-28 z-10 sm:bottom-40">
      <Pill variant="primary" className="pl-primary pl-act" onClick={onSkip}>{t(`player.skip.${seg.kind}`)}</Pill>
    </div>
  )
}
