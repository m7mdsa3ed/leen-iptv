import { useEffect, useMemo, useRef, useState } from "react"
import type { UIMessage } from "ai"
import { MessageSquare, SendHorizontal, Trash2, X } from "lucide-react"
import { ChipButton, LeenMark, Pill, RoundButton } from "@/components/gtv"
import { chatKit } from "@/components/tv/voice-kit"
import { TextInput } from "@/components/tv/text-input"
import { Reasoning, Steps } from "@/components/tv/trace"
import { chatKey, chatRemember, chatTrace } from "@/lib/agent/chat-cfg"
import { clearChat, loadChat, saveChat } from "@/lib/agent/chat-store"
import { loadAi, type AiSdk } from "@/lib/agent/load"
import { asStep, phaseOf, splitFences, type Step } from "@/lib/agent/pure"
import { CHAT_TOOLS, chatInstructions, EXAMPLE_PROGRAM } from "@/lib/agent/spec"
import { chatVia } from "@/lib/agent/token"
import { describeNow, runTool } from "@/lib/agent/tools"
import { closeChat, openChat, useChatUi } from "@/lib/agent/ui"
import { explain } from "@/lib/net"
import { useLang, useT } from "@/lib/i18n"
import { navHooks } from "@/lib/nav"
import { useApp, useProfile } from "@/lib/store"
import { openSection } from "@/settings/open"
import { cn } from "@/lib/utils"

/** Top-bar button for the typed assistant (the voice one is the microphone beside it). */
export function ChatButton() {
  const t = useT()
  return <ChipButton label={t("chat.button")} onClick={openChat}><MessageSquare /></ChipButton>
}

/** Mounted once in App.tsx; Back (App's installNav handler) calls closeChat. */
export function ChatOverlay() {
  return useChatUi((s) => s.open) ? <Panel /> : null
}

/** The chat is a panel on the end edge, not a full-screen window: the app stays visible beside it (only the voice assistant takes the whole screen).
    Dark like the player; the dialog traps the D-pad, a press on the dimmed area beside it closes it. */
function Frame({ children }: { children: React.ReactNode }) {
  const t = useT()
  return (
    <div className="fixed inset-0 z-[55] flex justify-end bg-black/35" onClick={closeChat}>
      <div data-modal role="dialog" aria-modal="true" aria-label={t("chat.title")} onClick={(e) => e.stopPropagation()}
        style={{ "--gx": "1.5rem" } as React.CSSProperties}
        className="dark side-in flex h-full w-full max-w-[34rem] flex-col overflow-hidden border-s border-white/10 bg-[#14161b] pt-[var(--safe-t)] text-foreground shadow-2xl">
        {children}
      </div>
    </div>
  )
}

function Panel() {
  const t = useT()
  const ready = useApp((s) => !!chatKey(s.settings.chat, s.settings.voice))
  const [sdk, setSdk] = useState<AiSdk | null>(null)
  const [err, setErr] = useState("")
  const [attempt, setAttempt] = useState(0)
  useEffect(() => { if (ready) loadAi().then(setSdk, (e: unknown) => setErr(e instanceof Error ? e.message : String(e))) }, [ready, attempt])
  const profile = useProfile()
  const [past, setPast] = useState<{ pid: string; list: UIMessage[] } | null>(null)
  useEffect(() => { // the profile's saved conversation, read once per profile (a profile switch under an open panel loads the other one)
    if (!profile) return setPast(null)
    let live = true
    if (!chatRemember(useApp.getState().settings.chat)) { void clearChat(profile.id); setPast({ pid: profile.id, list: [] }); return } // history off (also when another device turned it off): start blank, drop what was saved
    void loadChat(profile.id).then((list) => { if (live) setPast({ pid: profile.id, list }) })
    return () => { live = false }
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (sdk && ready && profile && past?.pid === profile.id) return <Chat key={profile.id} sdk={sdk} pid={profile.id} past={past.list} />
  return (
    <Frame>
      <div className="m-auto flex max-w-xl flex-col items-center gap-6 px-[var(--gx)] text-center">
        <LeenMark className="size-14" />
        <p role="status" className="text-2xl text-pretty">{!ready ? t("chat.noKey") : err ? t("voice.loadFailed") : t("voice.connecting")}</p>
        <div className="flex gap-3">
          {!ready && <Pill variant="primary" data-autofocus="" onClick={() => { closeChat(); openSection("assistant") }}>{t("voice.openSettings")}</Pill>}
          {err && <Pill variant="primary" data-autofocus="" onClick={() => { setErr(""); setAttempt((n) => n + 1) }}>{t("voice.retry")}</Pill>}
          <Pill variant={ready && !err ? "primary" : "tonal"} data-autofocus={ready && !err ? "" : undefined} onClick={closeChat}>{t("voice.done")}</Pill>
        </div>
      </div>
    </Frame>
  )
}

const textOf = (m: UIMessage) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")

type Block = { type: "steps"; steps: Step[] } | { type: "reasoning"; text: string; streaming: boolean } | { type: "text"; text: string }
/** An assistant message as what to draw, in the order it happened: runs of tool calls grouped into one list, reasoning, and the words. Tool calls and
    reasoning are left out when the user turned the trace off. */
function blocks(m: UIMessage, trace: boolean): Block[] {
  const out: Block[] = []
  for (const p of m.parts) {
    if (p.type === "text") { if (p.text.trim()) out.push({ type: "text", text: p.text }); continue }
    if (!trace) continue
    if (p.type === "reasoning") { if (p.text.trim()) out.push({ type: "reasoning", text: p.text, streaming: p.state === "streaming" }); continue }
    const step = asStep(p as Parameters<typeof asStep>[0])
    if (!step) continue
    const prev = out[out.length - 1]
    if (prev?.type === "steps") prev.steps.push(step)
    else out.push({ type: "steps", steps: [step] })
  }
  return out
}

function Chat({ sdk, pid, past }: { sdk: AiSdk; pid: string; past: UIMessage[] }) {
  const t = useT()
  const { lang } = useLang()
  const input = useRef<HTMLInputElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const [q, setQ] = useState("")
  const library = useMemo(() => sdk.makeLibrary(chatKit), [sdk])
  // Fixed for the conversation: the hook replaces its session when the transport changes. A new open starts a new conversation.
  const transport = useMemo(() => {
    const s = useApp.getState().settings
    return sdk.makeChatTransport({ cfg: s.chat, voice: s.voice, via: chatVia, instructions: chatInstructions(lang, describeNow(), library.prompt({ examples: [EXAMPLE_PROGRAM] })), tools: CHAT_TOOLS, run: runTool })
  }, [sdk, lang, library])
  const trace = useApp((x) => chatTrace(x.settings.chat))
  const chat = sdk.useChat({ transport, messages: past as Parameters<typeof sdk.useChat>[0] extends { messages?: infer M } | undefined ? M : never }) // stored messages are plain JSON (prepareHistory), typed generically; the hook infers tool-specific part types from the transport
  // Saved after each finished answer (not on every streamed word), and when the window closes: a closed window cancels the request, and what arrived is kept.
  const latest = useRef(chat.messages)
  latest.current = chat.messages
  const keep = (list: typeof chat.messages) => { if (chatRemember(useApp.getState().settings.chat)) void saveChat(pid, list) } // read when saving, so turning it off takes effect at once
  useEffect(() => { if (chat.status === "ready" || chat.status === "error") keep(chat.messages) }, [chat.status]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { keep(latest.current) }, [pid]) // eslint-disable-line react-hooks/exhaustive-deps
  const clear = () => { void chat.stop(); chat.setMessages([]); void clearChat(pid) }
  const busy = chat.status === "submitted" || chat.status === "streaming"
  const send = (text: string) => { const v = text.trim(); if (!v || busy) return; setQ(""); void chat.sendMessage({ text: v }) }
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }) }, [chat.messages, chat.status])
  useEffect(() => () => { void chat.stop() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- leaving the window cancels a request in flight
  useEffect(() => { input.current?.focus(); navHooks.text?.(input.current!) }, [])
  const onAction = (e: { type: string; humanFriendlyMessage?: string }) => { if (e.type === "continue_conversation" && e.humanFriendlyMessage) send(e.humanFriendlyMessage) }
  const examples = ["voice.ex1", "voice.ex2", "voice.ex3"] as const
  const last = chat.messages[chat.messages.length - 1]
  // Shown for as long as the request runs (not only until the first piece arrives): between tool calls and under a streaming answer too.
  const phase = phaseOf(last?.role === "assistant" ? (last.parts as Parameters<typeof phaseOf>[0]) : undefined, trace)
  const phaseLabel = phase.kind === "tool" ? phase.desc || `${t(`trace.tool.${phase.name}`)}...` : phase.kind === "thinking" ? t("trace.thinking") : phase.kind === "writing" ? t("chat.writing") : t("chat.working")

  return (
    <Frame>
      <header className="flex items-center gap-3 px-[var(--gx)] py-4">
        <LeenMark className="size-9" />
        <h2 className="min-w-0 flex-1 truncate text-xl font-medium">{t("chat.title")}</h2>
        {chat.messages.length > 0 && <RoundButton label={t("chat.clear")} title={t("chat.clear")} onClick={clear}><Trash2 /></RoundButton>}
        <RoundButton label={t("common.close")} title={t("common.close")} onClick={closeChat}><X /></RoundButton>
      </header>
      <main aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-[var(--gx)] py-4 [scrollbar-width:none]">
        {!chat.messages.length && (
          <div className="my-auto flex flex-col items-center gap-5 text-center">
            <p className="text-2xl font-medium tracking-tight text-pretty">{t("chat.hello")}</p>
            <div data-nav-group className="flex flex-wrap justify-center gap-3">
              {examples.map((k) => <Pill key={k} onClick={() => send(t(k))}>{t(k)}</Pill>)}
            </div>
          </div>
        )}
        {chat.messages.map((m) => m.role === "user" ? (
          <p key={m.id} dir="auto" className="ms-auto max-w-[90%] rounded-3xl rounded-ee-md bg-accent-blue-container px-4 py-2.5 text-base text-pretty">{textOf(m)}</p>
        ) : (
          <div key={m.id} className="flex min-w-0 flex-col gap-3.5">
            {blocks(m, trace).map((b, i) => b.type === "steps" ? <Steps key={i} steps={b.steps} describe />
              : b.type === "reasoning" ? <Reasoning key={i} text={b.text} streaming={b.streaming} />
              : splitFences(b.text, !(busy && m === last)).map((s, j) => s.type === "text"
                ? <p key={`${i}.${j}`} dir="auto" className="whitespace-pre-wrap text-[1.0625rem] leading-relaxed text-pretty">{s.text}</p>
                : <sdk.Renderer key={`${i}.${j}`} response={s.program} library={library} isStreaming={!s.done} onAction={onAction} />))}
          </div>
        ))}
        {busy && <p role="status" aria-live="polite" className="flex items-center gap-3 text-base text-muted-foreground"><span aria-hidden className="typing"><i /><i /><i /></span><span className="min-w-0 truncate">{phaseLabel}</span></p>}
        {chat.error && (
          <div role="alert" className="flex max-w-3xl flex-col gap-3 rounded-2xl bg-red-950/60 p-4">
            <p dir="auto" className="text-base text-pretty">{explain(chat.error)}</p>
            <div><Pill onClick={() => void chat.regenerate()}>{t("voice.retry")}</Pill></div>
          </div>
        )}
        <div ref={end} />
      </main>
      <form className="flex items-center gap-2 px-[var(--gx)] pb-[max(1rem,var(--safe-b))] pt-2" onSubmit={(e) => { e.preventDefault(); send(q) }}>
        <div className="flex h-12 min-w-0 flex-1 items-center rounded-full bg-surface-2 px-4 focus-within:ring-2 focus-within:ring-[var(--ring)]">
          <TextInput unstyled autoEdit ref={input} dir="auto" data-nav data-autofocus="" enterKeyHint="send" autoComplete="off" value={q} placeholder={t("chat.placeholder")} onChange={(e) => setQ(e.target.value)}
            style={{ outline: "none", boxShadow: "none" }} className={cn("h-full min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-base placeholder:text-muted-foreground")} />
        </div>
        <RoundButton type="submit" label={t("chat.send")} title={t("chat.send")} disabled={busy || !q.trim()}><SendHorizontal className="rtl-flip" /></RoundButton>
      </form>
    </Frame>
  )
}
