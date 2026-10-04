import { useEffect } from "react"
import { create } from "zustand"
import { Pill } from "@/components/gtv"
import { LeenMark } from "@/components/gtv"
import { useT } from "@/lib/i18n"
import { focusFirst } from "@/lib/nav"

/** "Exit Leen?" prompt shown when Back is pressed on the first page of the TV app. Back again (or Stay) dismisses it. */
export const useExitAsk = create<{ open: boolean }>(() => ({ open: false }))
export const askExit = () => useExitAsk.setState({ open: true })
export const closeExit = () => useExitAsk.setState({ open: false })

export function ExitConfirm() {
  const open = useExitAsk((s) => s.open)
  const t = useT()
  useEffect(() => { if (open) requestAnimationFrame(focusFirst) }, [open])
  if (!open) return null
  return (
    <div data-modal role="alertdialog" aria-modal="true" aria-label={t("nav.exit.title")} className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
      <div className="my-auto flex w-full max-w-[26rem] flex-col items-center gap-5 rounded-[28px] bg-surface p-8 text-center shadow-2xl">
        <LeenMark className="size-16" />
        <div>
          <div className="text-2xl font-semibold">{t("nav.exit.title")}</div>
          <div className="mt-1 text-muted-foreground">{t("nav.exit.desc")}</div>
        </div>
        <div className="flex w-full flex-col gap-3" data-nav-group>
          <Pill data-autofocus="" variant="primary" className="w-full" onClick={closeExit}>{t("common.stay")}</Pill>
          <Pill className="w-full" onClick={() => { closeExit(); window.close() }}>{t("common.exit")}</Pill>
        </div>
      </div>
    </div>
  )
}
