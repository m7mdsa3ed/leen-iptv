import { useState } from "react"
import { Lock, Pencil, Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Avatar } from "@/components/gtv"
import { askPin } from "@/components/tv/ui"
import { useApp } from "@/lib/store"
import { startPage, useRoute } from "@/lib/nav"
import { useT } from "@/lib/i18n"

/** "Who's watching?": big rounded-square avatars with names, Add Profile, Manage Profiles (rename / delete). */
export default function Profiles() {
  const t = useT()
  const { profiles, sources, setProfile, addProfile, updateProfile, removeProfile } = useApp()
  const reset = useRoute((s) => s.reset)
  const [manage, setManage] = useState(false)
  const [form, setForm] = useState<null | { id?: string }>(null) // id = editing, none = adding
  const [name, setName] = useState("")
  const [pin, setPin] = useState("")

  const pick = async (id: string) => {
    const p = profiles.find((x) => x.id === id)!
    if (manage) { setForm({ id }); setName(p.name); return }
    if (p.pin && !(await askPin(p.pin))) return
    setProfile(id)
    reset(sources.length ? startPage() : "sources")
  }
  const done = () => { setForm(null); setName(""); setPin("") }
  const save = () => {
    if (form?.id) updateProfile(form.id, { name: name.trim() })
    else addProfile(name.trim(), pin.length === 4 ? pin : undefined)
    done()
  }
  const del = async () => {
    const p = profiles.find((x) => x.id === form?.id)
    if (!p || profiles.length < 2) return
    if (p.pin && !(await askPin(p.pin))) return
    removeProfile(p.id)
    done()
  }
  const sq = "nf-sq size-24 text-4xl md:size-32 md:text-5xl"
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background pb-[env(safe-area-inset-bottom)]">
      <div className="px-[var(--gx)] pt-[max(1.25rem,env(safe-area-inset-top))]"><span aria-hidden className="nf-logo">Leen</span></div>
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-8 md:gap-10">
        <h1 className="text-center text-3xl font-medium md:text-5xl">{manage ? t("nf.profiles.manage") : t("nf.profiles.who")}</h1>
        <div data-nav-group data-nav-wrap className="flex flex-wrap justify-center gap-4 md:gap-8">
          {profiles.map((p, i) => (
            <button key={p.id} data-nav data-autofocus={i === 0 ? "" : undefined} onClick={() => pick(p.id)} className="nf-prof !w-28 md:!w-36">
              <span className="nf-pav block">
                <Avatar name={p.name} color={p.color} className={sq} />
                {p.pin && <span className="absolute bottom-1 end-1 grid size-7 place-items-center rounded-full bg-black/70 text-white"><Lock className="size-4" /></span>}
                {manage && <span className="absolute inset-0 grid place-items-center bg-black/50 text-white"><Pencil className="size-8" /></span>}
              </span>
              <span dir="auto" className="max-w-full truncate text-base md:text-xl">{p.name}</span>
            </button>
          ))}
          {!manage && !form && (
            <button data-nav onClick={() => { setForm({}); setName("") }} className="nf-prof !w-28 md:!w-36">
              <span className="nf-pav block"><span className={`grid place-items-center bg-surface-2 ${sq}`}><Plus className="size-12" /></span></span>
              <span className="text-base md:text-xl">{t("nf.profiles.add")}</span>
            </button>
          )}
        </div>
        {form && (
          <div className="flex w-full max-w-[28rem] flex-col gap-3 rounded bg-surface p-5">
            <Input data-nav data-autofocus="" className="h-12 rounded text-base" dir="auto" placeholder={t("nf.profiles.name")} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
            {!form.id && <Input data-nav className="h-12 rounded text-base" dir="ltr" placeholder={t("nf.profiles.pin")} type="password" autoComplete="off" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />}
            <div className="flex flex-wrap gap-3 pt-1">
              <button data-nav disabled={!name.trim()} onClick={save} className="nf-btn nf-play disabled:opacity-50">{t("nf.profiles.save")}</button>
              <button data-nav onClick={done} className="nf-btn nf-info-btn">{t("nf.profiles.cancel")}</button>
              {form.id && profiles.length > 1 && <button data-nav onClick={del} className="nf-btn nf-info-btn !text-[#ff6b73]">{t("nf.profiles.delete")}</button>}
            </div>
          </div>
        )}
        <button data-nav onClick={() => { setManage(!manage); done() }} className="nf-mng">{manage ? t("nf.profiles.done") : t("nf.profiles.manage")}</button>
      </div>
    </div>
  )
}
