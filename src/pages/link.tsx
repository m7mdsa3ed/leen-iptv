import { useState } from "react"
import { Check } from "lucide-react"
import { LeenMark, Pill } from "@/components/gtv"
import { useT } from "@/lib/i18n"
import { loadConfig, syncBackend as api, type Session } from "@/lib/api"
import { approveLink, canLink, cleanCode, prettyCode } from "@/lib/sync/link"
import { Field, SectionCard } from "@/settings/controls"
import { useAct } from "@/settings/AccountSync"

/**
 * Phone side of "sign in a TV": opened from the TV's QR code (#/link/CODE) or by typing the code at <app>/#/link.
 * It signs in with its OWN throw-away session (the app's own account on this device is untouched), sends it to the TV
 * encrypted, and forgets it without signing out, so the session lives on in the TV.
 */
export default function LinkPage({ id }: { id?: string }) {
  const t = useT()
  const a = useAct()
  const [code, setCode] = useState(id ? prettyCode(cleanCode(id)) : "")
  const [email, setEmail] = useState(""), [pw, setPw] = useState(""), [otp, setOtp] = useState("")
  const [mode, setMode] = useState<"password" | "code">("password"), [sent, setSent] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [done, setDone] = useState(false)
  const cfg = loadConfig()
  const fail = () => { throw new Error(t("sync.err.noSession")) }

  return (
    <div className="flex h-full flex-col items-center gap-6 overflow-y-auto bg-background p-4 py-[max(1.5rem,env(safe-area-inset-top))] md:[&>:first-child]:mt-auto md:[&>:last-child]:mb-auto">
      <div className="flex flex-col items-center gap-2 text-center">
        <LeenMark className="size-14" />
        <h1 className="text-3xl font-medium tracking-tight md:text-5xl">{t("sync.link.page.title")}</h1>
      </div>
      <div className="w-full max-w-[32rem]">
        {!canLink() ? (
          <SectionCard title={t("sync.na.title")} description={t("sync.link.page.unavailable")}><span /></SectionCard>
        ) : done ? (
          <SectionCard title={t("sync.link.page.done")}>
            <p className="flex items-center gap-2 text-foreground/80"><Check className="size-5 text-accent-blue" />{t("sync.link.page.doneDesc")}</p>
          </SectionCard>
        ) : (
          <SectionCard title={session ? t("sync.link.page.approve") : t("sync.signIn.title")} description={session ? t("sync.link.page.approveDesc", { email: session.email }) : t("sync.link.page.desc")}>
            <Field label={t("sync.link.page.code")} dir="ltr" value={code} onChange={(v) => setCode(prettyCode(cleanCode(v)).slice(0, 9))} placeholder="ABCD-EFGH" />
            {!session && (
              <>
                <Field label={t("sync.email")} type="email" inputMode="email" dir="ltr" value={email} onChange={setEmail} />
                {mode === "password" ? (
                  <Field label={t("sync.password")} type="password" dir="ltr" value={pw} onChange={setPw} />
                ) : sent ? (
                  <Field label={t("sync.code")} inputMode="numeric" dir="ltr" value={otp} onChange={setOtp} hint={t("sync.code.hint")} />
                ) : (
                  <p className="text-sm text-muted-foreground">{t("sync.codeNote")}</p>
                )}
                <div data-nav-group className="flex flex-wrap gap-2">
                  {mode === "password" ? (
                    <Pill variant="primary" disabled={a.busy || !email || !pw || cleanCode(code).length < 8} onClick={() => a.run(async () => { setSession((await api.password(cfg, email.trim(), pw)) ?? fail()) })}>{t("sync.signIn")}</Pill>
                  ) : sent ? (
                    <Pill variant="primary" disabled={a.busy || otp.length < 6 || cleanCode(code).length < 8} onClick={() => a.run(async () => { setSession((await api.otpVerify(cfg, email.trim(), otp)) ?? fail()) })}>{t("sync.verify")}</Pill>
                  ) : (
                    <Pill variant="primary" disabled={a.busy || !email} onClick={() => a.run(async () => { await api.otpSend(cfg, email.trim()); setSent(true); return t("sync.codeSent") })}>{t("sync.sendCode")}</Pill>
                  )}
                  <Pill variant="ghost" onClick={() => { setMode(mode === "password" ? "code" : "password"); setSent(false) }}>{mode === "password" ? t("sync.useCode") : t("sync.usePassword")}</Pill>
                </div>
              </>
            )}
            {session && (
              <div data-nav-group className="flex flex-wrap gap-2">
                <Pill variant="primary" disabled={a.busy || cleanCode(code).length < 8} onClick={() => a.run(async () => { await approveLink(code, session); setSession(null); setDone(true) })}>{t("sync.link.page.approveBtn")}</Pill>
                <Pill variant="ghost" onClick={() => setSession(null)}>{t("common.cancel")}</Pill>
              </div>
            )}
            {a.ok && <p role="status" className="text-sm text-muted-foreground">{a.ok}</p>}
            {a.err && <p role="alert" className="text-sm text-destructive">{a.err}</p>}
          </SectionCard>
        )}
      </div>
    </div>
  )
}
