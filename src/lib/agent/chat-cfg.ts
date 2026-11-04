import { CHAT_MODELS, DEFAULT_BASES, type ChatCfg, type ChatProvider, type VoiceCfg } from "./spec"

export const chatProvider = (c?: ChatCfg): ChatProvider => c?.provider ?? "gemini"
/** The key the chat uses: the provider's own; Gemini may share the voice assistant's. */
export const chatKey = (c?: ChatCfg, voice?: VoiceCfg): string => c?.keys?.[chatProvider(c)] || (chatProvider(c) === "gemini" ? voice?.key ?? "" : "")
export const chatModel = (c?: ChatCfg) => c?.models?.[chatProvider(c)] || CHAT_MODELS[chatProvider(c)]
const trim = (u: string) => u.trim().replace(/\/+$/, "")
/** The service address for the provider (its official one unless the user set another). Gemini has no custom address. */
export const chatBase = (c?: ChatCfg, p: ChatProvider = chatProvider(c)): string => trim(c?.bases?.[p] || DEFAULT_BASES[p] || "")
/** Is the Claude address the official one? Only then is Anthropic's browser opt-in header sent (a third-party service would have to list it in its CORS rules). */
export const officialAnthropic = (c?: ChatCfg) => chatBase(c, "anthropic") === DEFAULT_BASES.anthropic

/** Show tool calls and reasoning (on unless the user turned it off in Settings > Assistant). */
export const chatTrace = (c?: ChatCfg) => c?.trace !== false

/** Keep the typed conversation per profile on this device (on unless the user turned it off in Settings > Assistant). */
export const chatRemember = (c?: ChatCfg) => c?.history !== false
