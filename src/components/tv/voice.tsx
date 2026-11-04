import { useEffect, useMemo, useRef, useState } from "react"
import type { UIMessage } from "ai"
import { AudioLines, Mic, MicOff, PhoneOff } from "lucide-react"
import { ChipButton, LeenMark, Pill, RoundButton } from "@/components/gtv"
import { Steps } from "@/components/tv/trace"
import { kit } from "@/components/tv/voice-kit"
import { loadAi, type AiSdk } from "@/lib/agent/load"
import { createMeter, type Meter } from "@/lib/agent/meter"
import { asStep, type Step } from "@/lib/agent/pure"
import { setChecker } from "@/lib/agent/screen"
import { DEFAULT_VOICE, EXAMPLE_PROGRAM, instructions, TOOLS } from "@/lib/agent/spec"
import { realtimeModel, shimTokenFetch, TOKEN_URL, voiceCfg, type SessionConfig } from "@/lib/agent/token"
import { describeNow, runTool } from "@/lib/agent/tools"
import { closeVoice, openVoice, useVoice } from "@/lib/agent/ui"
import { useLang, useT } from "@/lib/i18n"
import { openMic } from "@/lib/media/mic"
import { useApp } from "@/lib/store"
import { openSection } from "@/settings/open"
import { cn } from "@/lib/utils"

const IDLE_MS = 30000 // no sound from either side: the session closes itself
const BARS = 29 // odd: one bar is the centre, the newest level sits there and older ones ripple out to both ends

/** The quick action: top-bar microphone button. */
export function VoiceButton() {
  const t = useT()
  return <ChipButton label={t("voice.button")} onClick={openVoice}><Mic /></ChipButton>
}

/** Mounted once in App.tsx. Full = a full-screen window; dock = a capsule over the app while the assistant's work plays on screen. One session either way:
    the Session below is never remounted when the mode changes. */
export function VoiceOverlay() {
  return useVoice((s) => s.open) ? <Panel /> : null
}

type State = { live: boolean; failed: boolean; speaking: boolean; muted: boolean; text: string }

function Panel() {
  const hasKey = useApp((s) => !!s.settings.voice?.key)
  const [attempt, setAttempt] = useState(0)
  return hasKey ? <Loader key={attempt} retry={() => setAttempt((n) => n + 1)} /> : <Shell><NoKey /></Shell>
}

/** The full-screen window: dark text colours like the player, but see-through (the app shows through a thin scrim) with a slow moving gradient; the docked
    capsule is the session's own view, passed in. `speaking` lifts the gradient while the assistant talks. */
function Shell({ children, dock, speaking }: { children: React.ReactNode; dock?: React.ReactNode; speaking?: boolean }) {
  const t = useT()
  const mode = useVoice((s) => s.mode)
  if (mode === "dock" && dock) return <>{dock}</>
  return (
    <div data-modal role="dialog" aria-modal="true" aria-label={t("voice.title")}
      className="dark fixed inset-0 z-[56] flex flex-col overflow-hidden voice-scrim text-foreground">
      <div aria-hidden className={cn("aurora", speaking ? "opacity-100" : "opacity-70")}><i /><i /><i /></div>
      {children}
    </div>
  )
}

function NoKey() {
  const t = useT()
  return (
    <div className="m-auto flex max-w-xl flex-col items-center gap-6 px-[var(--gx)] text-center">
      <LeenMark className="size-14" />
      <p className="text-2xl text-pretty">{t("voice.noKey")}</p>
      <div className="flex gap-3">
        <Pill variant="primary" data-autofocus="" onClick={() => { closeVoice(); openSection("assistant") }}>{t("voice.openSettings")}</Pill>
        <Pill onClick={closeVoice}>{t("voice.done")}</Pill>
      </div>
    </div>
  )
}

/** The AI SDK is a separate script (lib/agent/load.ts): fetched when the window first opens, then kept. */
function Loader({ retry }: { retry: () => void }) {
  const t = useT()
  const [sdk, setSdk] = useState<AiSdk | null>(null)
  const [err, setErr] = useState("")
  useEffect(() => { loadAi().then(setSdk, (e: unknown) => setErr(e instanceof Error ? e.message : String(e))) }, [])
  if (sdk) return <Session sdk={sdk} retry={retry} />
  return (
    <Shell>
      <div className="m-auto flex flex-col items-center gap-6 px-[var(--gx)] text-center">
        <LeenMark className="size-14" />
        <p role="status" className="text-2xl font-medium">{err ? t("voice.loadFailed") : t("voice.connecting")}</p>
        <div className="flex gap-3">
          {err && <Pill variant="primary" data-autofocus="" onClick={retry}>{t("voice.retry")}</Pill>}
          <Pill variant={err ? "tonal" : "primary"} data-autofocus={err ? undefined : ""} onClick={closeVoice}>{t("voice.done")}</Pill>
        </div>
      </div>
    </Shell>
  )
}

/** Level bars written straight to the DOM each step (React never re-renders for a level). The assistant's voice in the accent, the user's in white; flat while connecting. */
function Bars({ meter, live, count = BARS, className }: { meter: Meter; live: boolean; count?: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el || !live || document.documentElement.dataset.motion === "off") return
    const bars = Array.from(el.children) as HTMLElement[]
    const half = (bars.length - 1) / 2
    const history: number[] = new Array(half + 1).fill(0)
    let raf = 0, last = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (now - last < 50) return
      last = now
      const v = meter.read()
      history.pop(); history.unshift(v.level)
      el.dataset.agent = String(v.agent)
      bars.forEach((b, i) => { b.style.transform = `scaleY(${Math.max(0.12, history[Math.abs(i - half)])})` })
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); bars.forEach((b) => { b.style.transform = "" }); el.dataset.agent = "false" }
  }, [meter, live])
  return (
    <div ref={box} dir="ltr" aria-hidden data-agent="false" className={cn("group flex items-center justify-center gap-1.5", className)}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="h-full w-1.5 scale-y-[.12] rounded-full bg-white/80 transition-[transform,background-color] duration-100 ease-out group-data-[agent=true]:bg-accent-blue" />
      ))}
    </div>
  )
}

const said = (m?: UIMessage) => m?.parts.map((p) => (p.type === "text" ? p.text : "")).join("").trim() ?? ""

function Session({ sdk, retry }: { sdk: AiSdk; retry: () => void }) {
  const t = useT()
  const { lang } = useLang()
  const program = useVoice((s) => s.program)
  const trace = useApp((x) => x.settings.voice?.trace !== false)
  const [err, setErr] = useState("")
  const [seen, setSeen] = useState(false) // was connected once: a later drop is "ended", not "connecting"
  const [muted, setMuted] = useState(false)
  const mic = useRef<MediaStream | null>(null)
  const idle = useRef(0), lastBeat = useRef(0)
  const meter = useMemo(createMeter, [])
  const cfg = useMemo(voiceCfg, [])
  const model = useMemo(() => realtimeModel(sdk, cfg), [sdk, cfg])
  const library = useMemo(() => sdk.makeLibrary(kit), [sdk])
  const sessionConfig = useMemo<SessionConfig>(() => ({
    instructions: instructions(lang, describeNow(), library.prompt({ examples: [EXAMPLE_PROGRAM] })),
    voice: cfg.voice || DEFAULT_VOICE, tools: TOOLS as SessionConfig["tools"], inputAudioTranscription: {}, outputAudioTranscription: {},
  }), [cfg, lang, library])
  const beat = () => {
    const n = Date.now()
    if (n - lastBeat.current < 1000) return
    lastBeat.current = n
    clearTimeout(idle.current)
    idle.current = window.setTimeout(closeVoice, IDLE_MS)
  }
  const rt = sdk.useRealtime({
    model, api: { token: TOKEN_URL }, sessionConfig,
    onToolCall: ({ toolCall }) => runTool(toolCall.toolName, toolCall.args),
    onEvent: (e) => { if (e.type === "audio-chunk") meter.chunk(e.delta); beat() },
    onError: (e) => setErr(e.message),
  })

  useEffect(() => {
    const undo = shimTokenFetch()
    setChecker((p) => sdk.checkProgram(library, p))
    let dead = false
    beat()
    void (async () => {
      try {
        const s = await openMic()
        if (dead) return s.getTracks().forEach((x) => x.stop())
        mic.current = s
        meter.attach(s)
        await rt.connect()
      } catch (e) { if (!dead) setErr(e instanceof Error ? e.message : String(e)) }
    })()
    return () => {
      dead = true
      clearTimeout(idle.current)
      setChecker(null)
      mic.current?.getTracks().forEach((x) => x.stop())
      mic.current = null
      meter.dispose()
      rt.disconnect()
      undo()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- one session per mount; the hook's controls keep their identity

  useEffect(() => {
    if (rt.status !== "connected") return
    setSeen(true)
    if (!mic.current || rt.isCapturing) return
    try { rt.startAudioCapture(mic.current) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }, [rt.status]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!rt.isPlaying) meter.reset() }, [rt.isPlaying, meter]) // the user cut in, or it finished: nothing queued is going to be heard
  // Muting silences the track, not the session: the model hears quiet and the conversation stays open.
  useEffect(() => { mic.current?.getAudioTracks().forEach((x) => { x.enabled = !muted }) }, [muted, rt.status])

  const ended = seen && rt.status !== "connected"
  const failed = !!err || rt.status === "error" || ended
  const live = !failed && rt.status === "connected"
  const lastOf = (role: UIMessage["role"]) => said([...rt.messages].reverse().find((m) => m.role === role && said(m)))
  const you = lastOf("user"), leen = lastOf("assistant")
  // What it is doing: the latest tool calls (the SDK fills in each one's answer), newest last. Gemini Live gives no reasoning text, so there is none to show.
  const steps = useMemo(() => (trace ? rt.messages.flatMap((m) => m.parts.map((p) => asStep(p as Parameters<typeof asStep>[0])).filter((x): x is Step => !!x)).slice(-4) : []), [rt.messages, trace])
  const label = failed ? err || t("voice.ended") : !live ? t("voice.connecting") : muted ? t("voice.muted") : rt.isPlaying ? t("voice.speaking") : t("voice.listening")
  const state: State = { live, failed, speaking: rt.isPlaying, muted, text: label }
  const ask = (text: string) => rt.sendTextMessage(text)

  const dock = (
    <div role="status" aria-live="polite" className="dark fixed bottom-[calc(var(--safe-b)+1.5rem)] end-[var(--gx)] z-[56] flex h-16 max-w-[28rem] items-center gap-3 rounded-full bg-surface-2 p-1.5 ps-5 text-foreground shadow-lg ring-1 ring-white/10">
      {live ? <Bars meter={meter} live count={7} className="h-7 gap-1" /> : <AudioLines className="size-5 text-muted-foreground" />}
      <span dir="auto" className="min-w-0 flex-1 truncate text-base">{leen && live ? leen : label}</span>
      <button type="button" aria-label={t("voice.expand")} title={t("voice.expand")} onClick={openVoice} className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-3"><Mic className="size-5" /></button>
      <button type="button" aria-label={t("voice.hangUp")} title={t("voice.hangUp")} onClick={closeVoice} className="grid size-12 shrink-0 place-items-center rounded-full bg-red-600 text-white"><PhoneOff className="size-5" /></button>
    </div>
  )

  return (
    <Shell dock={dock} speaking={rt.isPlaying}>
      <header className="flex items-center gap-4 px-[var(--gx)] pt-[max(1.5rem,var(--safe-t))]">
        <LeenMark className="size-10" />
        <p role="status" aria-live="polite" className="min-w-0 flex-1 truncate text-xl font-medium">{state.text}</p>
        <RoundButton label={t(muted ? "voice.unmute" : "voice.mute")} title={t(muted ? "voice.unmute" : "voice.mute")} aria-pressed={muted} onClick={() => setMuted(!muted)} disabled={!live}>
          {muted ? <MicOff /> : <Mic />}
        </RoundButton>
        <Pill variant="primary" data-autofocus="" onClick={closeVoice} className="!bg-red-600 !text-white"><PhoneOff className="size-5" />{t("voice.hangUp")}</Pill>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-[var(--gx)] py-8 pb-[max(2rem,var(--safe-b))] [scrollbar-width:none] [text-shadow:0_1px_14px_rgba(0,0,0,.5)]">
        <div className={cn("flex flex-col items-center gap-5 text-center", program ? "" : "my-auto")}>
          <Bars meter={meter} live={live} className={program ? "h-12" : "h-28"} />
          {you && <p dir="auto" className="max-w-3xl text-xl text-muted-foreground text-pretty">{you}</p>}
          {leen && <p dir="auto" className={cn("max-w-3xl text-pretty", program ? "text-2xl" : "text-4xl font-medium tracking-tight")}>{leen}</p>}
          {!you && !leen && live && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-lg text-muted-foreground">{t("voice.hint")}</p>
              <div data-nav-group className="flex flex-wrap justify-center gap-3" aria-label={t("voice.try")}>
                {(["voice.ex1", "voice.ex2", "voice.ex3"] as const).map((k) => <Pill key={k} onClick={() => ask(t(k))}>{t(k)}</Pill>)}
              </div>
            </div>
          )}
          {steps.length > 0 && <div className="w-full max-w-3xl text-start"><Steps steps={steps} /></div>}
          {failed && (
            <div className="flex gap-3">
              <Pill variant="primary" onClick={retry}>{t("voice.retry")}</Pill>
              <Pill onClick={closeVoice}>{t("voice.done")}</Pill>
            </div>
          )}
        </div>
        {program && (
          <section aria-label={t("voice.title")} className="m-pop mx-auto w-full max-w-[96rem]">
            <sdk.Renderer response={program} library={library} onAction={(e) => { if (e.type === "continue_conversation" && e.humanFriendlyMessage) ask(e.humanFriendlyMessage) }} />
          </section>
        )}
      </main>
    </Shell>
  )
}
