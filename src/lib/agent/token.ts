import type { experimental_useRealtime } from "@ai-sdk/react"
import { px } from "@/lib/net"
import { useApp } from "@/lib/store"
import { loadAi, type AiSdk } from "./load"
import { DEFAULT_MODEL, type VoiceCfg } from "./spec"

export type SessionConfig = NonNullable<Parameters<typeof experimental_useRealtime>[0]["sessionConfig"]>

/** Where the realtime hook asks for its token. It is not a server: `shimTokenFetch` answers it in the page, from the key in Settings
    (Google accepts browser calls to its token endpoint), so the TV needs no backend of ours. */
export const TOKEN_URL = "leen:agent-token"

export const voiceCfg = (): VoiceCfg => useApp.getState().settings.voice ?? {}
/** The Gemini Live model for this key (the SDK is loaded on first use, see load.ts). Only the realtime class: the whole Google provider would add its chat models. */
export const realtimeModel = (sdk: AiSdk, cfg: VoiceCfg) => new sdk.GoogleRealtime(cfg.model || DEFAULT_MODEL, { provider: "google.generative-ai", baseURL: "https://generativelanguage.googleapis.com/v1beta", headers: { "x-goog-api-key": cfg.key } })

/** A short-lived Live API token (1 min to start a session, 30 min of session) for exactly this session setup. */
export const mintToken = async (cfg: VoiceCfg, sessionConfig: SessionConfig) => realtimeModel(await loadAi(), cfg).doCreateClientSecret({ sessionConfig })

/** Settings > Voice assistant "Check key": throws Google's own message when the key or model is refused. */
export const checkKey = async (cfg: VoiceCfg) => { await mintToken(cfg, { instructions: "ping" }) }

/** Answer the hook's POST to TOKEN_URL with a token minted from the saved key; every other request goes through untouched. Returns the undo. */
export function shimTokenFetch(): () => void {
  const real = window.fetch
  const patched: typeof fetch = async (input, init) => {
    if (input !== TOKEN_URL) return real.call(window, input, init)
    const cfg = voiceCfg()
    if (!cfg.key) throw new Error("no key")
    const sent = JSON.parse(String(init?.body ?? "{}")) as { sessionConfig?: SessionConfig }
    const sessionConfig = sent.sessionConfig ?? {}
    const t = await mintToken(cfg, sessionConfig)
    return new Response(JSON.stringify({ ...t, tools: sessionConfig.tools }), { status: 200, headers: { "content-type": "application/json" } })
  }
  window.fetch = patched
  return () => { if (window.fetch === patched) window.fetch = real }
}

/** The proxy route for a chat request (Settings > Playback proxy, else this server's own /p when it has one). Handed to the chat bundle as `via`. */
export const chatVia = (url: string) => px(url, useApp.getState().settings.proxy)

/** A failed check, as a sentence: a browser that could not reach the address says "Failed to fetch", which names nothing. */
export function checkError(e: unknown): { kind: "unreachable" | "refused"; msg: string } {
  const msg = e instanceof Error ? e.message : String(e)
  return e instanceof Error && e.name === "TypeError" ? { kind: "unreachable", msg } : { kind: "refused", msg: msg.slice(0, 200) }
}
