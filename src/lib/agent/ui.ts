import { create } from "zustand"
import { useApp } from "@/lib/store"
import { KEY } from "@/lib/nav"
import { chatKey } from "./chat-cfg"

/** The voice assistant: `open` = a session is running; `mode` full = the full-screen overlay, dock = a small capsule over the app (the call goes on while
    you watch what it opened); `program` = the OpenUI Lang screen the model drew (null = the plain listening view). The overlay (components/tv/voice.tsx)
    draws it; this file is free of the SDK so the player and the shell can import it cheaply. */
export const useVoice = create<{ open: boolean; mode: "full" | "dock"; program: string | null }>(() => ({ open: false, mode: "full", program: null }))
export const openVoice = () => useVoice.setState((s) => (s.open ? { mode: "full" } : { open: true, mode: "full", program: null }))
export const closeVoice = () => useVoice.setState({ open: false, mode: "full", program: null })
/** The assistant took the user somewhere (played, opened, went to a page): shrink to the capsule so the screen shows it. */
export const dockVoice = () => { closeChat(); useVoice.setState((s) => (s.open ? { mode: "dock", program: null } : s)) }

/** The typed chat window (components/tv/chat.tsx). It closes when the assistant takes the user somewhere, like the voice window docks. */
export const useChatUi = create<{ open: boolean }>(() => ({ open: false }))
export const openChat = () => useChatUi.setState({ open: true })
export const closeChat = () => useChatUi.setState((s) => (s.open ? { open: false } : s))
/** A chat provider has a key (its own, or for Gemini the voice key). */
export const chatReady = () => { const s = useApp.getState().settings; return !!chatKey(s.chat, s.voice) }
/** The assistant drew something: bring the full screen back if it was docked, so it is seen. */
export const showProgram = (program: string) => useVoice.setState({ program, mode: "full" })
/** A Gemini key is saved: the player's Blue key opens voice instead of its audio panel (Green still opens that). */
export const voiceReady = () => !!useApp.getState().settings.voice?.key

/** Blue button anywhere outside the player (and inside it once voice is set up: player/use-keys.ts) opens the assistant, or expands its capsule. */
export function installVoiceKey() {
  const f = (e: KeyboardEvent) => {
    if (e.keyCode !== KEY.blue || e.repeat) return
    const s = useVoice.getState()
    if (s.open && s.mode === "full") return
    const el = e.target as HTMLElement | null
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
    e.preventDefault(); openVoice()
  }
  window.addEventListener("keydown", f)
  return () => window.removeEventListener("keydown", f)
}
