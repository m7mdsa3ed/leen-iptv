import { useState } from "react"
import { Field, Pill, Row, SectionCard, Segmented, ToggleRow } from "../controls"
import { chatBase, chatKey, chatModel, chatProvider, chatRemember, chatTrace } from "@/lib/agent/chat-cfg"
import { clearAllChats } from "@/lib/agent/chat-store"
import { loadAi } from "@/lib/agent/load"
import { checkError, checkKey, chatVia } from "@/lib/agent/token"
import { CHAT_MODELS, CHAT_PROVIDERS, DEFAULT_BASES, DEFAULT_MODEL, DEFAULT_VOICE, VOICES, type ChatCfg, type ChatProvider } from "@/lib/agent/spec"
import { openChat, openVoice } from "@/lib/agent/ui"
import { useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"

const NAMES: Record<ChatProvider, string> = { gemini: "Gemini", anthropic: "Claude", openai: "OpenAI-compatible" }
type Check = { state: "idle" | "busy" | "ok" | "bad"; kind?: "unreachable" | "refused"; msg?: string }
const fail = (e: unknown): Check => ({ state: "bad", ...checkError(e) })

/** One page for the assistant: the voice side (Gemini Live key, voice, model) and the typed chat (Gemini, Claude or any Anthropic- or OpenAI-compatible service).
    Keys sync like the other API keys, so turn on encryption if you sync. */
export default function AssistantSection() {
  return (
    <>
      <VoiceCard />
      <ChatCard />
    </>
  )
}

function VoiceCard() {
  const t = useT()
  const cfg = useApp((s) => s.settings.voice) ?? {}
  const setSettings = useApp((s) => s.setSettings)
  const [check, setCheck] = useState<Check>({ state: "idle" })
  const set = (p: Partial<typeof cfg>) => { setCheck({ state: "idle" }); setSettings({ voice: { ...cfg, ...p } }) }
  const run = () => { setCheck({ state: "busy" }); checkKey(cfg).then(() => setCheck({ state: "ok" }), (e: unknown) => setCheck(fail(e))) }
  return (
    <SectionCard title={t("settings.voice.title")} description={t("settings.voice.desc")}>
      <Field label={t("settings.voice.key")} hint={t("settings.voice.key.hint")} type="password" dir="ltr" value={cfg.key ?? ""} onChange={(v) => set({ key: v.trim() })} />
      <Row label={t("settings.voice.check")} description={check.state === "ok" ? t("settings.voice.ok") : check.state === "bad" ? (check.kind === "unreachable" ? t("settings.voice.unreachable") : t("settings.voice.bad", { msg: check.msg ?? "" })) : t("settings.voice.check.desc")}>
        <Pill disabled={!cfg.key || check.state === "busy"} onClick={run}>{check.state === "busy" ? t("settings.voice.checking") : t("settings.voice.check")}</Pill>
        <Pill variant="primary" disabled={!cfg.key} onClick={openVoice}>{t("settings.voice.try")}</Pill>
      </Row>
      <ToggleRow label={t("settings.voice.trace")} description={t("settings.voice.trace.desc")} checked={cfg.trace !== false} onChange={(v) => set({ trace: v })} />
      <Row label={t("settings.voice.voice")} stack>
        <Segmented label={t("settings.voice.voice")} value={cfg.voice ?? DEFAULT_VOICE} options={VOICES.map((v) => ({ value: v, label: v }))} onChange={(v) => set({ voice: v })} />
      </Row>
      <Field label={t("settings.voice.model")} hint={t("settings.voice.model.hint", { model: DEFAULT_MODEL })} dir="ltr" value={cfg.model ?? ""} placeholder={DEFAULT_MODEL} onChange={(v) => set({ model: v.trim() || undefined })} />
    </SectionCard>
  )
}

function ChatCard() {
  const t = useT()
  const cfg = useApp((s) => s.settings.chat) ?? {}
  const voice = useApp((s) => s.settings.voice)
  const setSettings = useApp((s) => s.setSettings)
  const [check, setCheck] = useState<Check>({ state: "idle" })
  const p = chatProvider(cfg)
  const set = (next: ChatCfg) => { setCheck({ state: "idle" }); setSettings({ chat: next }) }
  const run = () => { setCheck({ state: "busy" }); loadAi().then((sdk) => sdk.pingChat(cfg, voice, chatVia)).then(() => setCheck({ state: "ok" }), (e: unknown) => setCheck(fail(e))) }
  const own = cfg.keys?.[p] ?? ""
  const shared = p === "gemini" && !own && !!voice?.key
  const base = p === "gemini" ? NAMES.gemini : chatBase(cfg)
  return (
    <SectionCard title={t("settings.chat.title")} description={t("settings.chat.desc")}>
      <Row label={t("settings.chat.provider")} stack>
        <Segmented label={t("settings.chat.provider")} value={p} options={CHAT_PROVIDERS.map((v) => ({ value: v, label: NAMES[v] }))} onChange={(v) => set({ ...cfg, provider: v })} />
      </Row>
      <Field label={t("settings.chat.key", { name: NAMES[p] })} hint={shared ? t("settings.chat.key.shared") : t(`settings.chat.key.hint.${p}`)} type="password" dir="ltr" value={own}
        onChange={(v) => set({ ...cfg, keys: { ...cfg.keys, [p]: v.trim() || undefined } })} />
      {p !== "gemini" && (
        <Field label={t("settings.chat.base")} hint={t(`settings.chat.base.hint.${p}`)} dir="ltr" value={cfg.bases?.[p] ?? ""} placeholder={DEFAULT_BASES[p]}
          onChange={(v) => set({ ...cfg, bases: { ...cfg.bases, [p]: v.trim() || undefined } })} />
      )}
      {p === "anthropic" && (
        <Row label={t("settings.chat.auth")} description={t("settings.chat.auth.desc")} stack>
          <Segmented label={t("settings.chat.auth")} value={cfg.anthropicAuth ?? "key"} options={[{ value: "key", label: "x-api-key" }, { value: "bearer", label: "Authorization: Bearer" }]} onChange={(v) => set({ ...cfg, anthropicAuth: v })} />
        </Row>
      )}
      <Field label={t("settings.chat.model")} hint={t("settings.chat.model.hint", { model: CHAT_MODELS[p] })} dir="ltr" value={cfg.models?.[p] ?? ""} placeholder={CHAT_MODELS[p]}
        onChange={(v) => set({ ...cfg, models: { ...cfg.models, [p]: v.trim() || undefined } })} />
      <ToggleRow label={t("settings.chat.trace")} description={t("settings.chat.trace.desc")} checked={chatTrace(cfg)} onChange={(v) => set({ ...cfg, trace: v })} />
      <ToggleRow label={t("settings.chat.history")} description={t("settings.chat.history.desc")} checked={chatRemember(cfg)} onChange={(v) => { set({ ...cfg, history: v }); if (!v) void clearAllChats() }} />
      <Row label={t("settings.chat.check")} description={check.state === "ok" ? t("settings.chat.ok", { model: chatModel(cfg) }) : check.state === "bad" ? (check.kind === "unreachable" ? t("settings.chat.unreachable", { url: base }) : t("settings.chat.bad", { msg: check.msg ?? "" })) : t("settings.chat.check.desc", { url: base })}>
        <Pill disabled={!chatKey(cfg, voice) || check.state === "busy"} onClick={run}>{check.state === "busy" ? t("settings.voice.checking") : t("settings.voice.check")}</Pill>
        <Pill variant="primary" disabled={!chatKey(cfg, voice)} onClick={openChat}>{t("settings.voice.try")}</Pill>
      </Row>
    </SectionCard>
  )
}
