// Entry of the lazy AI SDK bundle (vite.config.ts `aiBundle` builds it to its own file; load.ts loads it). Nothing else in src/ may import these
// packages as values, or they land in the startup bundle again.
import "./poly" // first: the SDK below calls APIs Chromium 94 lacks
export { experimental_useRealtime as useRealtime, useChat } from "@ai-sdk/react"
export { Experimental_GoogleRealtimeModel as GoogleRealtime } from "@ai-sdk/google"
export { Renderer } from "@openuidev/react-lang"
export { checkProgram, makeLibrary } from "./library"
export { makeChatTransport, pingChat } from "./chat-sdk"
