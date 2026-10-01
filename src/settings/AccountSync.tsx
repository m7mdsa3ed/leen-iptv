import { useState } from "react"
import { useSync, badKey } from "@/lib/sync"
import { explain } from "@/lib/net"
import { ConfirmButton, Field, Pill, Row, SectionCard, Toggle } from "./controls"

const when = (t: number) => (t ? new Date(t).toLocaleString() : "never")

/** Run an async action with a busy flag and a readable error. */
function useAct() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [ok, setOk] = useState("")
  const run = async (f: () => Promise<string | void>) => {
    setBusy(true); setErr(""); setOk("")
    try { setOk((await f()) || "") } catch (e) { setErr(e instanceof TypeError ? "Couldn't reach Supabase. Check the project URL and your connection." : explain(e)) } finally { setBusy(false) }
  }
  return { busy, err, ok, run }
}

function Setup() {
  const s = useSync()
  const [url, setUrl] = useState(s.config.url), [key, setKey] = useState(s.config.anonKey)
  const a = useAct()
  const keyErr = key ? badKey(key) ?? undefined : undefined
  return (
    <SectionCard title="Set up sync" description="Sync profiles, sources, favorites, progress and settings across your devices through your own free Supabase project.">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Create a project at supabase.com (free tier is fine).</li>
        <li>Open SQL Editor and run the file supabase/schema.sql from this app's source.</li>
        <li>Paste the Project URL and the anon (public) key from Settings &gt; API below.</li>
      </ol>
      <Field label="Project URL" value={url} onChange={setUrl} placeholder="https://xxxx.supabase.co" inputMode="url" />
      <Field label="Anon (public) key" value={key} onChange={setKey} error={keyErr} placeholder="eyJ..." />
      <Pill variant="primary" disabled={a.busy || !url || !key || !!keyErr} onClick={() => a.run(async () => { s.setConfig({ url, anonKey: key }) })}>Save</Pill>
      {a.err && <p role="alert" className="text-sm text-destructive">{a.err}</p>}
    </SectionCard>
  )
}

function SignIn() {
  const s = useSync()
  const [email, setEmail] = useState(""), [code, setCode] = useState(""), [pw, setPw] = useState("")
  const [step, setStep] = useState<"email" | "code">("email"), [usePw, setUsePw] = useState(false)
  const a = useAct()
  const form = (
    <>
      <Field label="Email" type="email" inputMode="email" value={email} onChange={setEmail} />
      {usePw ? (
        <Field label="Password" type="password" value={pw} onChange={setPw} />
      ) : step === "code" ? (
        <Field label="6-digit code" inputMode="numeric" value={code} onChange={setCode} hint="Check your email (the code works on any device)." />
      ) : null}
      <div data-nav-group className="flex flex-wrap gap-2">
        {usePw ? (
          <>
            <Pill variant="primary" disabled={a.busy || !email || !pw} onClick={() => a.run(() => s.signInPassword(email, pw))}>Sign in</Pill>
            <Pill disabled={a.busy || !email || pw.length < 6} onClick={() => a.run(async () => (await s.signUp(email, pw)) === "confirm" ? "Account created. Confirm your email, then sign in." : undefined)}>Create account</Pill>
          </>
        ) : step === "email" ? (
          <Pill variant="primary" disabled={a.busy || !email} onClick={() => a.run(async () => { await s.signInOtpSend(email); setStep("code"); return "Code sent." })}>Send code</Pill>
        ) : (
          <>
            <Pill variant="primary" disabled={a.busy || code.length < 6} onClick={() => a.run(() => s.signInOtpVerify(email, code))}>Verify</Pill>
            <Pill disabled={a.busy} onClick={() => a.run(async () => { await s.signInOtpSend(email); return "New code sent." })}>Resend</Pill>
          </>
        )}
        <Pill variant="ghost" onClick={() => { setUsePw(!usePw); setStep("email") }}>{usePw ? "Use a code instead" : "Use password instead"}</Pill>
      </div>
      {a.ok && <p className="text-sm text-muted-foreground">{a.ok}</p>}
      {a.err && <p role="alert" className="text-sm text-destructive">{a.err}</p>}
    </>
  )
  return (
    <>
      <SectionCard title="Sign in to sync" description="Type your email, then enter the 6-digit code we send you. No password needed.">{form}</SectionCard>
      {!s.fromEnv && <ChangeProject />}
    </>
  )
}

function ChangeProject() {
  const [open, setOpen] = useState(false)
  return open ? <Setup /> : <Pill variant="ghost" className="self-start" onClick={() => setOpen(true)}>Change Supabase project</Pill>
}

function SignedIn() {
  const s = useSync()
  const [pass, setPass] = useState(""), [remember, setRemember] = useState(true)
  const a = useAct(), b = useAct()
  const st = s.status
  return (
    <>
      <SectionCard title="Account & sync" description={s.session?.email}>
        <Row label="Status" description={st.state === "syncing" ? "Syncing..." : st.state === "error" ? st.error : `Last synced: ${when(st.lastSyncAt)}`}>
          <Pill variant="primary" disabled={st.state === "syncing"} onClick={() => void s.syncNow()}>Sync now</Pill>
        </Row>
        <Row label="Sign out of this device"><Pill onClick={() => void s.signOut()}>Sign out</Pill></Row>
      </SectionCard>
      <SectionCard title="Encryption" description={s.hasPassphrase ? "Cloud data is encrypted with your passphrase (AES-256). Only devices that know it can read it." : undefined}>
        {!s.hasPassphrase && (
          <p role="alert" className="rounded-2xl bg-surface-2 p-3 text-sm text-foreground">
            Warning: without a passphrase your cloud data is NOT encrypted. It includes IPTV, Plex and Jellyfin credentials and API keys, readable by anyone with access to your Supabase project. Set a passphrase below.
          </p>
        )}
        {st.needPass && <p role="alert" className="text-sm text-destructive">The cloud data is encrypted. Enter the passphrase to continue syncing.</p>}
        {!s.canEncrypt ? (
          <p className="text-sm text-muted-foreground">Encryption needs https or localhost (this page is plain http). Open the app over https to enable it.</p>
        ) : s.hasPassphrase ? (
          <Row label="Passphrase" description="Stored only if you chose to remember it on this device."><Pill onClick={s.clearPassphrase}>Forget on this device</Pill></Row>
        ) : null}
        {s.canEncrypt && !s.hasPassphrase && (
          <>
            <Field label="Passphrase (8+ characters)" type="password" value={pass} onChange={setPass} hint="Lose it and encrypted cloud data cannot be recovered." />
            <Toggle label="Remember on this device" checked={remember} onChange={setRemember} />
            <Pill variant="primary" disabled={a.busy || pass.length < 8} onClick={() => a.run(async () => { await s.setPassphrase(pass, remember); setPass(""); return "Encryption on." })}>Enable encryption</Pill>
            {a.ok && <p className="text-sm text-muted-foreground">{a.ok}</p>}
            {a.err && <p role="alert" className="text-sm text-destructive">{a.err}</p>}
          </>
        )}
      </SectionCard>
      <SectionCard title="Cloud data">
        <Row label="Delete cloud data" description="Removes the synced copy from Supabase. This device keeps its data and re-uploads on the next change unless you sign out.">
          <ConfirmButton disabled={b.busy} onConfirm={() => b.run(async () => { await s.deleteCloudData(); return "Deleted." })}>Delete</ConfirmButton>
        </Row>
        {b.ok && <p className="text-sm text-muted-foreground">{b.ok}</p>}
        {b.err && <p role="alert" className="text-sm text-destructive">{b.err}</p>}
      </SectionCard>
    </>
  )
}

export default function AccountSync() {
  const s = useSync()
  return <div className="flex flex-col gap-4">{!s.configured ? <Setup /> : s.session ? <SignedIn /> : <SignIn />}</div>
}
