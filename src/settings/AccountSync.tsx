import { useEffect, useState } from "react"
import { focusFirst } from "@/lib/nav"
import { QrCode } from "@/components/QrCode"
import { canLink, createLink, linkBase, linkUrl, pollLink, prettyCode, type TvLink } from "@/lib/sync/link"
import { useSync } from "@/lib/sync"
import { explain } from "@/lib/net"
import { fmt, t as tn, useT } from "@/lib/i18n"
import { ConfirmButton, Field, Pill, Row, SectionCard, Segmented, Toggle } from "./controls"

const when = (t: number) => (t ? fmt.date(t, { dateStyle: "medium", timeStyle: "short" }) : tn("sync.never"))

/** Run an async action with a busy flag and a readable error. */
export function useAct() {
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

type Mode = "signin" | "create" | "code" | "forgot" | "phone"

/** TV side of "sign in with your phone": shows a QR code AND a short code; the session arrives once the phone approves. */
function PhoneSignIn({ onCancel }: { onCancel: () => void }) {
  const t = useT()
  const s = useSync()
  const [link, setLink] = useState<TvLink | null>(null)
  const [err, setErr] = useState(""), [round, setRound] = useState(0)
  useEffect(() => {
    let live = true, timer = 0
    setLink(null); setErr("")
    void (async () => {
      try {
        const l = await createLink()
        if (!live) return
        setLink(l)
        const t0 = Date.now()
        const tick = async () => {
          if (!live) return
          if (Date.now() - t0 > 10 * 60_000) return void setErr(t("sync.link.expired"))
          try { const ses = await pollLink(l); if (ses) return void (await s.adoptSession(ses)) } catch { /* transient: keep polling */ }
          timer = window.setTimeout(tick, 2000)
        }
        void tick()
      } catch (e) { if (live) setErr(explain(e)) }
    })()
    return () => { live = false; clearTimeout(timer) }
  }, [round]) // eslint-disable-line react-hooks/exhaustive-deps
  const base = linkBase()
  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <p className="text-muted-foreground">{t("sync.link.intro")}</p>
      {link && base && <QrCode value={linkUrl(link.code)} label={t("sync.link.qr")} className="size-44 md:size-52" />}
      {link && (
        <>
          <div className="text-sm text-muted-foreground">{base ? t("sync.link.orCode", { url: base.replace(/^https?:\/\//, "") + "/#/link" }) : t("sync.link.noBase")}</div>
          <div dir="ltr" className="text-5xl font-semibold tracking-[0.15em] md:text-6xl">{prettyCode(link.code)}</div>
          <div className="flex items-center gap-3 text-muted-foreground"><div className="size-5 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />{t("sync.link.waiting")}</div>
        </>
      )}
      {!link && !err && <div className="text-muted-foreground">{t("common.loading")}</div>}
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <div data-nav-group className="flex flex-wrap justify-center gap-2">
        <Pill onClick={() => setRound(round + 1)}>{t("sync.link.newCode")}</Pill>
        <Pill variant="ghost" onClick={onCancel}>{t("sync.backToSignIn")}</Pill>
      </div>
    </div>
  )
}

/** Account entry: Sign in / Create account (email + password), or an email code (no password), plus forgot-password. */
export function SignIn() {
  const t = useT()
  const s = useSync()
  const [mode, setMode] = useState<Mode>("signin")
  const [email, setEmail] = useState(""), [pw, setPw] = useState(""), [pw2, setPw2] = useState(""), [code, setCode] = useState("")
  const [step, setStep] = useState<"email" | "code">("email")
  const a = useAct()
  const go = (m: Mode) => { setMode(m); setStep("email"); setPw(""); setPw2("") }

  if (s.recovering) return <SetNewPassword />

  const createErr = mode === "create" && pw ? (pw.length < 8 ? t("sync.err.short") : pw2 && pw !== pw2 ? t("sync.err.mismatch") : undefined) : undefined
  return (
    <SectionCard title={mode === "create" ? t("sync.create.title") : t("sync.signIn.title")} description={t("sync.signIn.desc")}>
      {mode === "phone" ? <PhoneSignIn onCancel={() => go("signin")} /> : null}
      {(mode === "signin" || mode === "create") && (
        <Segmented<Mode> label={t("sync.signIn.title")} value={mode} onChange={go} options={[{ value: "signin", label: t("sync.signIn") }, { value: "create", label: t("sync.createAccount") }]} />
      )}
      {mode !== "phone" && <Field label={t("sync.email")} type="email" inputMode="email" dir="ltr" value={email} onChange={setEmail} />}

      {mode === "signin" && (
        <>
          <Field label={t("sync.password")} type="password" dir="ltr" value={pw} onChange={setPw} />
          <div data-nav-group className="flex flex-wrap gap-2">
            <Pill variant="primary" disabled={a.busy || !email || !pw} onClick={() => a.run(() => s.signInPassword(email, pw))}>{t("sync.signIn")}</Pill>
            <Pill variant="ghost" onClick={() => go("forgot")}>{t("sync.forgot")}</Pill>
            <Pill variant="ghost" onClick={() => go("code")}>{t("sync.useCode")}</Pill>
            {canLink() && <Pill variant="ghost" onClick={() => go("phone")}>{t("sync.link.button")}</Pill>}
          </div>
        </>
      )}

      {mode === "create" && (
        <>
          <Field label={t("sync.password")} type="password" dir="ltr" value={pw} onChange={setPw} hint={t("sync.hint.password")} />
          <Field label={t("sync.confirmPassword")} type="password" dir="ltr" value={pw2} onChange={setPw2} error={createErr} />
          <div data-nav-group className="flex flex-wrap gap-2">
            <Pill variant="primary" disabled={a.busy || !email || pw.length < 8 || pw !== pw2} onClick={() => a.run(() => s.signUp(email, pw))}>{t("sync.createAccount")}</Pill>
            <Pill variant="ghost" onClick={() => go("code")}>{t("sync.useCode")}</Pill>
          </div>
        </>
      )}

      {mode === "code" && (
        <>
          <p className="text-sm text-muted-foreground">{t("sync.codeNote")}</p>
          {step === "code" && <Field label={t("sync.code")} inputMode="numeric" dir="ltr" value={code} onChange={setCode} hint={t("sync.code.hint")} />}
          <div data-nav-group className="flex flex-wrap gap-2">
            {step === "email" ? (
              <Pill variant="primary" disabled={a.busy || !email} onClick={() => a.run(async () => { await s.signInOtpSend(email); setStep("code"); return t("sync.codeSent") })}>{t("sync.sendCode")}</Pill>
            ) : (
              <>
                <Pill variant="primary" disabled={a.busy || code.length < 6} onClick={() => a.run(() => s.signInOtpVerify(email, code))}>{t("sync.verify")}</Pill>
                <Pill disabled={a.busy} onClick={() => a.run(async () => { await s.signInOtpSend(email); return t("sync.newCodeSent") })}>{t("sync.resend")}</Pill>
              </>
            )}
            <Pill variant="ghost" onClick={() => go("signin")}>{t("sync.backToSignIn")}</Pill>
          </div>
        </>
      )}

      {mode === "forgot" && (
        <div data-nav-group className="flex flex-wrap gap-2">
          <Pill variant="primary" disabled={a.busy || !email} onClick={() => a.run(async () => { await s.sendReset(email); return t("sync.resetSent") })}>{t("sync.sendReset")}</Pill>
          <Pill variant="ghost" onClick={() => go("signin")}>{t("sync.backToSignIn")}</Pill>
        </div>
      )}

      {a.ok && <p role="status" className="text-sm text-muted-foreground">{a.ok}</p>}
      {a.err && <p role="alert" className="text-sm text-destructive">{a.err}</p>}
    </SectionCard>
  )
}

/** Wherever the user is when a password-reset link brings them back, ask for the new password (App renders this once). */
export function RecoveryGate() {
  const s = useSync()
  useEffect(() => { if (s.recovering) requestAnimationFrame(focusFirst) }, [s.recovering])
  if (!s.recovering) return null
  return (
    <div data-modal role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
      <div className="w-full max-w-[34rem]"><SetNewPassword /></div>
    </div>
  )
}

/** Shown after opening a password-reset email link on this device. */
export function SetNewPassword() {
  const t = useT()
  const s = useSync()
  const [pw, setPw] = useState(""), [pw2, setPw2] = useState("")
  const a = useAct()
  const err = pw && pw.length < 8 ? t("sync.err.short") : pw2 && pw !== pw2 ? t("sync.err.mismatch") : undefined
  return (
    <SectionCard title={t("sync.newPassword.title")} description={t("sync.newPassword.desc")}>
      <Field label={t("sync.password")} type="password" dir="ltr" value={pw} onChange={setPw} hint={t("sync.hint.password")} />
      <Field label={t("sync.confirmPassword")} type="password" dir="ltr" value={pw2} onChange={setPw2} error={err} />
      <div data-nav-group className="flex flex-wrap gap-2">
        <Pill variant="primary" disabled={a.busy || pw.length < 8 || pw !== pw2} onClick={() => a.run(() => s.setNewPassword(pw))}>{t("sync.newPassword.save")}</Pill>
        <Pill variant="ghost" onClick={s.cancelRecovery}>{t("common.cancel")}</Pill>
      </div>
      {a.err && <p role="alert" className="text-sm text-destructive">{a.err}</p>}
    </SectionCard>
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
