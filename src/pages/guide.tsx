import { GuideGrid } from "@/components/GuideGrid"
import { Shell, useOpen } from "@/components/tv/ui"
import { useT } from "@/lib/i18n"
import { useRoute } from "@/lib/nav"

export default function Guide() {
  const open = useOpen()
  const t = useT()
  const reset = useRoute((s) => s.reset)
  return (
    <Shell page="guide" title={t("pages.guide.title")}>
      <GuideGrid onOpen={(ch, list) => open(ch, list)} onClose={() => reset("home")} />
    </Shell>
  )
}
