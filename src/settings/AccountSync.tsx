import { useState } from "react"
import { useSync } from "@/lib/sync"
import { explain } from "@/lib/net"
import { fmt, t as tn, useT } from "@/lib/i18n"
import { ConfirmButton, Field, Pill, Row, SectionCard, Toggle } from "./controls"

const when = (t: number) => (t ? fmt.date(t, { dateStyle: "medium", timeStyle: "short" }) : tn("sync.never"))

/** Run an async action with a busy flag and a readable error. */
function useAct() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [ok, setOk] = useState("")
  const run = async (f: () => Promise<string | void>) => {
    setBusy(true); setErr(""); setOk("")
    try { setOk((await f()) || "") } catch (e) { setErr(e instanceof TypeError ? tn("sync.err.unreachable") : explain(e)) } finally { setBusy(false) }
  }
  return { busy, err, ok, run }
}

/** Shown when the build has no Supabase project (.env). Sync is configured by whoever builds the app, not by each user. */
function NotAvailable() {
  const t = useT()
  return (
    <SectionCard title={t("sync.na.title")} description={t("sync.na.desc")}>
      {import.meta.env.DEV && <p className="text-sm text-muted-foreground">{t("sync.na.dev")}</p>}
    </SectionCard>
  )
}

export function SignIn() {
  const t = useT()
  const s = useSync()
  const [email, setEmail] = useState(""), [code, setCode] = useState(""), [pw, setPw] = useState("")
  const [step, setStep] = useState<"email" | "code">("email"), [usePw, setUsePw] = useState(false)
  const a = useAct()
  const form = (
    <>
      <Field label={t("sync.email")} type="email" inputMode="email" dir="ltr" value={email} onChange={setEmail} />
      {usePw ? (
        <Field label={t("sync.password")} type="password" dir="ltr" value={pw} onChange={setPw} />
      ) : step === "code" ? (
        <Field label={t("sync.code")} inputMode="numeric" dir="ltr" value={code} onChange={setCode} hint={t("sync.code.hint")} />
      ) : null}
      <div data-nav-group className="flex flex-wrap gap-2">
        {usePw ? (
          <>
            <Pill variant="primary" disabled={a.busy || !email || !pw} onClick={() => a.run(() => s.signInPassword(email, pw))}>{t("sync.signIn")}</Pill>
            <Pill disabled={a.busy || !email || pw.length < 6} onClick={() => a.run(async () => (await s.signUp(email, pw)) === "confirm" ? t("sync.accountCreated") : undefined)}>{t("sync.createAccount")}</Pill>
          </>
        ) : step === "email" ? (
          <Pill variant="primary" disabled={a.busy || !email} onClick={() => a.run(async () => { await s.signInOtpSend(email); setStep("code"); return t("sync.codeSent") })}>{t("sync.sendCode")}</Pill>
        ) : (
          <>
            <Pill variant="primary" disabled={a.busy || code.length < 6} onClick={() => a.run(() => s.signInOtpVerify(email, code))}>{t("sync.verify")}</Pill>
            <Pill disabled={a.busy} onClick={() => a.run(async () => { await s.signInOtpSend(email); return t("sync.newCodeSent") })}>{t("sync.resend")}</Pill>
          </>
        )}
        <Pill variant="ghost" onClick={() => { setUsePw(!usePw); setStep("email") }}>{usePw ? t("sync.useCode") : t("sync.usePassword")}</Pill>
      </div>
      {a.ok && <p className="text-sm text-muted-foreground">{a.ok}</p>}
      {a.err && <p role="alert" className="text-sm text-destructive">{a.err}</p>}
    </>
  )
  return (
    <>
      <SectionCard title={t("sync.signIn.title")} description={t("sync.signIn.desc")}>{form}</SectionCard>
    </>
  )
}

function SignedIn() {
  const t = useT()
  const s = useSync()
  const [pass, setPass] = useState(""), [remember, setRemember] = useState(true)
  const a = useAct(), b = useAct()
  const st = s.status
  return (
    <>
      <SectionCard title={t("sync.account.title")} description={s.session?.email}>
        <Row label={t("sync.status")} description={st.state === "syncing" ? t("sync.syncing") : st.state === "error" ? st.error : t("sync.lastSynced", { when: when(st.lastSyncAt) })}>
          <Pill variant="primary" disabled={st.state === "syncing"} onClick={() => void s.syncNow()}>{t("sync.syncNow")}</Pill>
        </Row>
        <Row label={t("sync.signOutDevice")}><Pill onClick={() => void s.signOut()}>{t("sync.signOut")}</Pill></Row>
      </SectionCard>
      <SectionCard title={t("sync.enc.title")} description={s.hasPassphrase ? t("sync.enc.on") : undefined}>
        {!s.hasPassphrase && (
          <p role="alert" className="rounded-2xl bg-surface-2 p-3 text-sm text-foreground">
            {t("sync.enc.warn")}
          </p>
        )}
        {st.needPass && <p role="alert" className="text-sm text-destructive">{t("sync.enc.needPass")}</p>}
        {!s.canEncrypt ? (
          <p className="text-sm text-muted-foreground">{t("sync.enc.needsHttpsPage")}</p>
        ) : s.hasPassphrase ? (
          <Row label={t("sync.pass")} description={t("sync.pass.stored")}><Pill onClick={s.clearPassphrase}>{t("sync.pass.forget")}</Pill></Row>
        ) : null}
        {s.canEncrypt && !s.hasPassphrase && (
          <>
            <Field label={t("sync.pass.new")} type="password" dir="ltr" value={pass} onChange={setPass} hint={t("sync.pass.hint")} />
            <Toggle label={t("sync.pass.remember")} checked={remember} onChange={setRemember} />
            <Pill variant="primary" disabled={a.busy || pass.length < 8} onClick={() => a.run(async () => { await s.setPassphrase(pass, remember); setPass(""); return t("sync.enc.enabled") })}>{t("sync.enc.enable")}</Pill>
            {a.ok && <p className="text-sm text-muted-foreground">{a.ok}</p>}
            {a.err && <p role="alert" className="text-sm text-destructive">{a.err}</p>}
          </>
        )}
      </SectionCard>
      <SectionCard title={t("sync.cloud.title")}>
        <Row label={t("sync.cloud.delete")} description={t("sync.cloud.delete.desc")}>
          <ConfirmButton disabled={b.busy} onConfirm={() => b.run(async () => { await s.deleteCloudData(); return t("sync.cloud.deleted") })}>{t("common.delete")}</ConfirmButton>
        </Row>
        {b.ok && <p className="text-sm text-muted-foreground">{b.ok}</p>}
        {b.err && <p role="alert" className="text-sm text-destructive">{b.err}</p>}
      </SectionCard>
    </>
  )
}

export default function AccountSync() {
  const s = useSync()
  return <div className="flex flex-col gap-4">{!s.configured ? <NotAvailable /> : s.session ? <SignedIn /> : <SignIn />}</div>
}
