import { TriangleAlert } from "lucide-react"
import { Pill } from "@/components/gtv"
import { useT } from "@/lib/i18n"

/** Full-screen playback error. [data-modal] keeps the D-pad on its buttons. */
export function ErrorScreen({ name, msg, canNext, onRetry, onNext, onBack }: { name: string; msg: string; canNext: boolean; onRetry: () => void; onNext: () => void; onBack: () => void }) {
  const t = useT()
  return (
    <div data-modal role="alertdialog" aria-label={msg} className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-black/85 p-6 text-center m-fade">
      <TriangleAlert className="pl-err-ic" />
      <div className="max-w-2xl">
        <div dir="auto" className="pl-sub mb-2">{name}</div>
        <div className="pl-title">{msg}</div>
      </div>
      <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
        <Pill variant="primary" className="pl-primary pl-act" data-autofocus="" onClick={onRetry}>{t("player.retry")}</Pill>
        {canNext && <Pill className="pl-btn pl-act" onClick={onNext}>{t("player.next")}</Pill>}
        <Pill className="pl-btn pl-act" onClick={onBack}>{t("player.back")}</Pill>
      </div>
    </div>
  )
}
