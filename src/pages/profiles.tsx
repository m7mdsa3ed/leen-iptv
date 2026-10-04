import { useState } from "react"
import { Lock, Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Avatar, LeenMark, Pill } from "@/components/gtv"
import { askPin } from "@/components/tv/ui"
import { useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"
import { startPage, useRoute } from "@/lib/nav"

export default function Profiles() {
  const { profiles, sources, setProfile, addProfile } = useApp()
  const t = useT()
  const reset = useRoute((s) => s.reset)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const [pin, setPin] = useState("")

  const pick = async (id: string) => {
    const p = profiles.find((x) => x.id === id)!
    if (p.pin && !(await askPin(p.pin))) return
    setProfile(id)
    reset(sources.length ? startPage() : "sources")
  }

  return (
    <div className="flex h-full flex-col items-center gap-8 overflow-y-auto bg-background p-4 py-[max(1rem,env(safe-area-inset-top))] md:justify-center md:gap-12">
      <div className="flex flex-col items-center gap-3"><LeenMark className="size-16" /><div className="text-muted-foreground"><span className="wordmark text-3xl text-foreground">Leen</span> TV</div></div>
      <h1 className="text-3xl font-medium tracking-tight md:text-5xl">{t("pages.profiles.who")}</h1>
      <div className="flex flex-wrap justify-center gap-4 md:gap-8">
        {profiles.map((p, i) => (
          <button key={p.id} data-nav data-card data-autofocus={i === 0 ? "" : undefined} onClick={() => pick(p.id)} className="flex flex-col items-center gap-4 rounded-2xl p-4">
            <div data-tile className="relative rounded-full">
              <Avatar name={p.name} color={p.color} className="size-24 text-4xl md:size-36 md:text-6xl" />
              {p.pin && <span className="absolute bottom-1 end-1 grid size-8 place-items-center rounded-full bg-black/70 text-white"><Lock className="size-4" /></span>}
            </div>
            <span dir="auto" className="text-lg md:text-2xl">{p.name}</span>
          </button>
        ))}
        {!adding && (
          <button data-nav onClick={() => setAdding(true)} className="flex flex-col items-center gap-4 rounded-2xl p-4 text-muted-foreground">
            <div className="grid size-24 place-items-center rounded-full bg-surface-2 md:size-36"><Plus className="size-12" /></div>
            <span className="text-lg md:text-2xl">{t("pages.profiles.add")}</span>
          </button>
        )}
      </div>
      {adding && (
        <div className="flex w-full max-w-[34rem] flex-col gap-3 rounded-[28px] bg-surface p-6">
          <Input data-nav dir="auto" className="h-12 rounded-2xl text-base md:h-14 md:text-xl" placeholder={t("pages.profiles.name")} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          <Input data-nav dir="ltr" className="h-12 rounded-2xl text-base md:h-14 md:text-xl" placeholder={t("pages.profiles.pin")} type="password" autoComplete="off" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          <div className="flex gap-3 pt-1">
            <Pill variant="primary" disabled={!name.trim()} onClick={() => { addProfile(name.trim(), pin.length === 4 ? pin : undefined); setAdding(false); setName(""); setPin("") }}>{t("common.save")}</Pill>
            <Pill variant="ghost" onClick={() => setAdding(false)}>{t("common.cancel")}</Pill>
          </div>
        </div>
      )}
    </div>
  )
}
