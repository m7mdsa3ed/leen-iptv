import { Pill } from "@/components/gtv"
import { useT } from "@/lib/i18n"
import { JUMP, type PSeg } from "./skip-pure"

/** "Skip intro / recap / credits" while the playhead is inside that segment (or "Skip 85 s" early in an episode nobody knows the timings of). With the controls hidden on TV, OK skips (use-keys), except the jump. */
export function SkipButton({ seg, onSkip }: { seg: PSeg; onSkip: () => void }) {
  const t = useT()
  return (
    <div className="m-rise absolute end-[var(--gx)] bottom-28 z-10 sm:bottom-40">
      <Pill variant="primary" className="pl-primary pl-act" onClick={onSkip}>{t(`player.skip.${seg.kind}`, { n: JUMP })}</Pill>
    </div>
  )
}
