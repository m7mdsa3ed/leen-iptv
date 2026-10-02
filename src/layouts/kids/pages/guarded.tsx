import { useEffect, useState } from "react"
import { Lock } from "lucide-react"
import { Empty, Shell, askPin } from "@/components/tv/ui"
import { useRoute } from "@/lib/nav"
import { useProfile } from "@/lib/store"
import { useT } from "@/lib/i18n"
import DefaultSettings from "../../../pages/settings"
import GtvCategory from "../../googletv/pages/category"
import { useSafe } from "../safe"

/** Category page of the shared Google TV layout, but never for blocked / adult-looking categories. */
export function Category({ id }: { id: string }) {
  const t = useT()
  const safe = useSafe()
  const cut = id.indexOf("|")
  return safe.group(id.slice(0, cut), id.slice(cut + 1)) ? <GtvCategory id={id} /> : <Shell page="movies"><Empty>{t("kd.detail.blocked")}</Empty></Shell>
}

/** Day-stable question so a child cannot just remember it; a wrong answer picks the next one. Choices = answer-3..answer+2 (never negative). */
function Math1({ onOk }: { onOk: () => void }) {
  const t = useT()
  const [n, setN] = useState(0)
  const [bad, setBad] = useState(false)
  const day = Math.floor(Date.now() / 864e5) + n * 3
  const a = 6 + (day % 4), b = 5 + (day % 3) // 11..16 never 0-9 guessable by counting fingers
  const ans = a + b
  const choices = [-3, -2, -1, 0, 1, 2].map((d) => ans + d)
  return (
    <>
      <div className="kd-title">{t("kd.gate.mathTitle")}</div>
      <div dir="ltr" className="text-4xl font-bold">{t("kd.gate.mathText", { a, b })}</div>
      <div className="h-8 text-2xl text-[var(--accent-blue)]">{bad ? t("kd.gate.wrong") : ""}</div>
      <div dir="ltr" className="grid grid-cols-3 gap-4">
        {choices.map((c, i) => <button key={c} data-nav data-autofocus={i === 0 ? "" : undefined} className="kd-num" onClick={() => (c === ans ? onOk() : (setBad(true), setN(n + 1)))}>{c}</button>)}
      </div>
    </>
  )
}

/** Settings behind a grown-up gate: profile PIN when it has one, else a simple sum. Re-locks whenever the page is left. */
export function Settings() {
  const t = useT()
  const pin = useProfile()?.pin
  const reset = useRoute((s) => s.reset)
  const [ok, setOk] = useState(false)
  const [asking, setAsking] = useState(false)
  const ask = () => { setAsking(true); void askPin(pin!).then((good) => { setAsking(false); if (good) setOk(true) }) }
  useEffect(() => { if (pin && !ok) ask() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (ok) return <DefaultSettings />
  return (
    <Shell page="settings" title={t("kd.settings.title")}>
      <div className="mx-auto flex max-w-xl flex-col items-center gap-6 py-10 text-center">
        {pin ? (
          <>
            <Lock className="size-16" />
            <div className="kd-title">{t("kd.settings.title")}</div>
            <p className="text-xl">{t("kd.gate.pinText")}</p>
            <button data-nav data-autofocus="" disabled={asking} className="kd-btn kd-play" onClick={ask}>{t("kd.gate.pinBtn")}</button>
          </>
        ) : <Math1 onOk={() => setOk(true)} />}
        <button data-nav className="kd-btn" onClick={() => reset("home")}>{t("kd.gate.leave")}</button>
      </div>
    </Shell>
  )
}
