// The SDK half of the typed chat, inside the lazy bundle (sdk.ts re-exports it). It takes plain data from the app (config, instructions, tool specs, a runner)
// and returns the transport `useChat` talks to: the model runs in the browser through the AI SDK's agent loop, so there is no server of ours in the path.
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { DirectChatTransport, generateText, isStepCount, jsonSchema, tool, ToolLoopAgent, type JSONValue, type LanguageModel } from "ai"
import { chatBase, chatKey, chatModel, chatProvider, officialAnthropic } from "./chat-cfg"
import type { ChatCfg, ToolDef, VoiceCfg } from "./spec"

/** Ask for the model's reasoning where that is known to work, so the window can show it. Gemini needs thought summaries switched on; Claude needs a thinking
    budget, and only Anthropic's own address is known to accept it. An OpenAI-compatible service is NOT asked: its `reasoning_effort` is refused (400) by models
    without reasoning (gpt-4.1...), which would break the chat; whatever reasoning such a service sends anyway is shown. */
function thinking(cfg: ChatCfg | undefined): { providerOptions?: Record<string, Record<string, JSONValue>> } {
  if (cfg?.trace === false) return {}
  const p = chatProvider(cfg)
  if (p === "gemini") return { providerOptions: { google: { thinkingConfig: { includeThoughts: true } } } }
  if (p === "anthropic" && officialAnthropic(cfg)) return { providerOptions: { anthropic: { thinking: { type: "enabled", budgetTokens: 1024 } } } }
  return {}
}

const MAX_STEPS = 6 // search then act then answer, with room for one retry

/** The app's proxy URL for a target (lib/net.ts `px`): same address back = no proxy to use. Handed in, so this bundle imports nothing of the app. */
export type ViaProxy = (url: string) => string

const blocked = new Set<string>() // origins the browser would not talk to directly: straight to the proxy from the second call on
/** fetch that falls back to the proxy when the browser refuses the direct call (CORS, an http address from an https page, an offline service).
    A TypeError is the only failure it retries: a refused key (401) or a model error is an answer and passes through unchanged. */
function proxiedFetch(via?: ViaProxy): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const origin = new URL(url).origin
    const proxy = via?.(url)
    if (proxy && proxy !== url && blocked.has(origin)) return fetch(proxy, init)
    try { return await fetch(input, init) }
    catch (e) {
      if ((e as Error | undefined)?.name !== "TypeError" || !proxy || proxy === url) throw e // by name: a TypeError from another realm (an iframe, a polyfill) is the same failure
      const r = await fetch(proxy, init)
      blocked.add(origin)
      return r
    }
  }
}

export function chatLanguageModel(cfg: ChatCfg | undefined, voice: VoiceCfg | undefined, via?: ViaProxy): LanguageModel {
  const key = chatKey(cfg, voice), id = chatModel(cfg), fetch = proxiedFetch(via)
  switch (chatProvider(cfg)) {
    case "anthropic": {
      // Any Anthropic-compatible service: its own address, and the key as x-api-key (Anthropic's way) or Authorization: Bearer (what many compatible services want).
      // The browser opt-in header is Anthropic's own rule, sent only to Anthropic: elsewhere it would need to be in the service's CORS allow list.
      const base = { fetch, baseURL: chatBase(cfg, "anthropic"), ...(officialAnthropic(cfg) ? { headers: { "anthropic-dangerous-direct-browser-access": "true" } } : {}) }
      return createAnthropic(cfg?.anthropicAuth === "bearer" ? { ...base, authToken: key } : { ...base, apiKey: key })(id)
    }
    case "openai": return createOpenAICompatible({ name: "openai-compatible", baseURL: chatBase(cfg, "openai"), apiKey: key, fetch })(id)
    default: return createGoogleGenerativeAI({ apiKey: key, fetch })(id)
  }
}

export function makeChatTransport(o: { cfg?: ChatCfg; voice?: VoiceCfg; via?: ViaProxy; instructions: string; tools: ToolDef[]; run: (name: string, args: unknown) => Promise<unknown> }) {
  const tools = Object.fromEntries(o.tools.map((t) => [t.name, tool({ description: t.description, inputSchema: jsonSchema(t.parameters as never), execute: (args: unknown) => o.run(t.name, args) })]))
  const agent = new ToolLoopAgent({ model: chatLanguageModel(o.cfg, o.voice, o.via), instructions: o.instructions, tools, stopWhen: isStepCount(MAX_STEPS), ...thinking(o.cfg) })
  return new DirectChatTransport({ agent })
}

/** Settings > Assistant "Check key": one tiny request; throws the provider's own message when the key, model or address is refused. */
export async function pingChat(cfg: ChatCfg | undefined, voice: VoiceCfg | undefined, via?: ViaProxy): Promise<void> {
  await generateText({ model: chatLanguageModel(cfg, voice, via), prompt: "Reply with the word ok.", maxOutputTokens: 16 })
}
