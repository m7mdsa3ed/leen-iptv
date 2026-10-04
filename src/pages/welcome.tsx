import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import { LeenMark, Pill } from "@/components/gtv"
import { useT } from "@/lib/i18n"
import { useRoute } from "@/lib/nav"
import { useApp } from "@/lib/store"
import { useSync } from "@/lib/sync"
import { SignIn } from "@/settings/AccountSync"

const ACCOUNT = [1, 2, 3, 4].map((n) => `welcome.account.${n}`)
const GUEST = [1, 2, 3, 4].map((n) => `welcome.guest.${n}`)

/** First launch (builds with cloud sync): sign in for sync + backup, or continue without an account. */
export default function Welcome() {
  const t = useT()
  const reset = useRoute((s) => s.reset)
  const setSettings = useApp((s) => s.setSettings)
  const sync = useSync()
  const [signIn, setSignIn] = useState(false)

  const choose = (accountChoice: "guest" | "account") => { setSettings({ accountChoice }); reset("profiles") }
  useEffect(() => { if (sync.session) choose("account") }, [sync.session]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = (items: string[]) => (
    <ul className="flex flex-1 flex-col gap-3 text-start text-base text-foreground/80">
      {items.map((k) => <li key={k} className="flex gap-3"><Check className="mt-0.5 size-5 shrink-0 text-accent-blue" /><span>{t(k)}</span></li>)}
    </ul>
  )

  return (
    <div className="flex h-full flex-col items-center gap-8 overflow-y-auto bg-background p-4 py-[max(1.5rem,env(safe-area-inset-top))] md:gap-10 md:[&>:first-child]:mt-auto md:[&>:last-child]:mb-auto">
      <div className="flex flex-col items-center gap-3 text-center">
        <LeenMark className="size-16 md:size-20" />
        <h1 className="text-3xl font-medium tracking-tight md:text-5xl">{t("welcome.title")}</h1>
        <p className="max-w-xl text-muted-foreground">{t("welcome.subtitle")}</p>
      </div>
      {signIn ? (
        <div className="flex w-full max-w-[34rem] flex-col gap-4">
          <SignIn />
          <Pill variant="ghost" className="self-start" onClick={() => setSignIn(false)}>{t("welcome.back")}</Pill>
        </div>
      ) : (
        <div className="grid w-full max-w-[56rem] gap-4 md:grid-cols-2 md:gap-6" data-nav-group>
          <section className="flex flex-col gap-5 rounded-[28px] bg-surface p-6 md:p-8">
            <h2 className="text-2xl font-medium tracking-tight">{t("welcome.account.title")}</h2>
            {list(ACCOUNT)}
            <Pill data-autofocus="" variant="primary" onClick={() => setSignIn(true)}>{t("welcome.account.cta")}</Pill>
          </section>
          <section className="flex flex-col gap-5 rounded-[28px] bg-surface p-6 md:p-8">
            <h2 className="text-2xl font-medium tracking-tight">{t("welcome.guest.title")}</h2>
            {list(GUEST)}
            <Pill onClick={() => choose("guest")}>{t("welcome.guest.cta")}</Pill>
          </section>
        </div>
      )}
    </div>
  )
}
