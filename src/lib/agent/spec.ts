// What the voice agent is and what it may do: the tool list the model sees and its instructions. Each tool has an executor of the same name in tools.ts.
/** Settings.voice: the user's Gemini API key (Google AI Studio), plus optional model and voice. `trace` (default on) shows what the assistant is doing:
    its tool calls and, in chat, its reasoning. Synced like the other API keys. */
export type VoiceCfg = { key?: string; model?: string; voice?: string; trace?: boolean }
export const DEFAULT_MODEL = "gemini-3.8-live"

/** Settings.chat: which provider answers typed questions, one key per provider (Gemini falls back to the voice key), optional model, and for Claude and
    OpenAI-compatible a custom address (`bases`: any Anthropic- or OpenAI-compatible service). `anthropicAuth`: how a Claude-compatible service wants the key. */
export const CHAT_PROVIDERS = ["gemini", "anthropic", "openai"] as const
export type ChatProvider = (typeof CHAT_PROVIDERS)[number]
export type ChatCfg = { provider?: ChatProvider; keys?: Partial<Record<ChatProvider, string>>; models?: Partial<Record<ChatProvider, string>>; bases?: Partial<Record<ChatProvider, string>>; anthropicAuth?: "key" | "bearer"; trace?: boolean; history?: boolean }
export const CHAT_MODELS: Record<ChatProvider, string> = { gemini: "gemini-2.5-flash", anthropic: "claude-haiku-4-5", openai: "gpt-4.1-mini" }
export const DEFAULT_BASES: Partial<Record<ChatProvider, string>> = { anthropic: "https://api.anthropic.com/v1", openai: "https://api.openai.com/v1" }
export const VOICES = ["Kore", "Puck", "Aoede", "Charon", "Fenrir"] as const
export const DEFAULT_VOICE = "Kore"

export type ToolDef = { type: "function"; name: string; description: string; parameters: Record<string, unknown> }

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): ToolDef => ({
  type: "function", name, description, parameters: { type: "object", properties, ...(required.length ? { required } : {}) },
})

export const TOOLS: ToolDef[] = [
  fn("search", "Search the user's library by title or channel name. Returns up to 8 hits, each with an id. Call it before open or play unless you already have an id from an earlier result.",
    { query: { type: "string", description: "What to look for, as spoken." }, kind: { type: "string", enum: ["all", "movie", "series", "live"], description: "Limit to one kind. Default all." } }, ["query"]),
  fn("open", "Open a title's details page by id.", { id: { type: "string", description: "An id returned by search or suggest." } }, ["id"]),
  fn("play", "Start playing a movie, show or live channel by id. A show plays the episode the user is on; a movie resumes where the user stopped unless from_start is true.",
    { id: { type: "string", description: "An id returned by search or suggest." }, from_start: { type: "boolean", description: "Play from the beginning instead of resuming." } }, ["id"]),
  fn("player", "Control what is playing now.",
    { action: { type: "string", enum: ["pause", "resume", "stop", "next", "previous", "seek"] }, seconds: { type: "number", description: "For seek: seconds to jump, negative to go back." } }, ["action"]),
  fn("go", "Go to a page of the app.", { page: { type: "string", enum: ["home", "live", "movies", "series", "sports", "history", "settings"] } }, ["page"]),
  fn("suggest", "Get a few things worth watching now: what the user is midway through, favorites and recent history. Returns items with ids.",
    { kind: { type: "string", enum: ["any", "movie", "series", "live"], description: "Default any." } }),
  fn("channel", "Switch live TV to a channel by name or channel number.", { name: { type: "string", description: "Channel name or number, as spoken." } }, ["name"]),
  fn("show", "Draw on the TV screen while you talk: shelves of titles (ids from search or suggest), a caption, follow-up chips. `program` is OpenUI Lang (the syntax is in your instructions). Call it whenever you list or recommend titles. It replaces what is on screen; it is cleared when you play or open something. If it answers with an error, fix the program and call it again.",
    { program: { type: "string", description: "An OpenUI Lang program: root = Screen([...]) and the parts it uses." } }, ["program"]),
]

/** The example the model sees next to the library's own prompt. */
export const EXAMPLE_PROGRAM = [
  "root = Screen([cont, note, more], \"Tonight\")",
  "cont = Shelf(\"Continue watching\", [\"src|movie|12\", \"src|series|7\"])",
  "note = Note(\"Two things you started\")",
  "more = Chips([\"Something new\", \"A comedy\"])",
].join("\n")

/** `now` = a line about the screen right now (page, what is playing), so "pause this" and "go back" make sense. */
export const instructions = (lang: "en" | "ar", now: string, screen?: string) =>
  [
    "You are the voice of Leen TV, an IPTV app on a television. The user talks to you from the couch with the TV on.",
    "You control the app only through your tools: search, open, play, player, go, suggest, channel and show. Never claim you did something a tool did not confirm.",
    "Replies are spoken: one or two short sentences, no lists, no ids, no URLs. Say what you did or what you found, not how.",
    "To play or open something by name, search first, then act on the best hit. If two hits are close (different years, a movie and a series), ask which one in one short question.",
    "If a tool says nothing matched, a category is locked or a source is offline, say so plainly and offer one alternative.",
    "When asked what to watch, call suggest (the app puts the picks on screen), name at most three, and ask which one.",
    "When you list or recommend titles, call show with a Shelf of their ids and say in a few words what is on screen. After you play or open something the screen clears by itself. Never put an id you were not given in a program.",
    "The TV may be playing audio while you listen. Ignore speech that is clearly from the video and answer only to a person addressing you.",
    lang === "ar"
      ? "Speak Egyptian Arabic (Masri) by default, and switch to the language the user speaks to you. Keep titles in their original language."
      : "Speak English by default, and switch to the language the user speaks to you. Keep titles in their original language.",
    `Right now: ${now}`,
    ...(screen ? [`\n\n# The screen language (OpenUI Lang)\nThe show tool takes a program in this language.\n${screen}`] : []),
  ].join(" ")

/** The typed chat: same tools as voice (minus `show`: the answer itself carries the screen as an openui-lang fence). */
/** Chat tools carry one extra argument, `description`: the model writes the status line the user reads while the call runs ("Searching for Heat"), so the
    window shows its words instead of a generated "Looking for ideas movie · 1 result". Voice tools do not (nothing is read there). */
const withDescription = (t: ToolDef): ToolDef => {
  const p = t.parameters as { properties: Record<string, unknown>; required?: string[] }
  return { ...t, parameters: { ...p, properties: { ...p.properties, description: { type: "string", description: "Required. A few words, in the user's language, saying what you are doing, shown to the user while this runs. Like: Searching for Heat. No ids." } }, required: [...(p.required ?? []), "description"] } }
}
export const CHAT_TOOLS = TOOLS.filter((x) => x.name !== "show").map(withDescription)
export const chatInstructions = (lang: "en" | "ar", now: string, screen: string) =>
  [
    "You are Leen, the assistant inside Leen TV, an IPTV app. The user types to you on a TV, phone or desktop.",
    "You control the app only through your tools: search, open, play, player, go, suggest and channel. Never claim you did something a tool did not confirm.",
    "Every tool call needs its description argument: a few words in the user's language saying what you are doing (Searching for Heat, Opening Breaking Bad, Playing channel 7). It is the status line the user sees while the call runs. No ids.",
    "Keep answers short: a sentence or two. No ids or URLs in the words you write.",
    "To play or open something by name, search first, then act on the best hit. If two hits are close (a movie and a series, different years), ask which one.",
    "If a tool says nothing matched, a category is locked or a source is offline, say so plainly and offer one alternative.",
    "When you list or recommend titles, add ONE block after your words, with a Shelf of their ids (from search or suggest only, never made up) and optionally 2-4 Chips as follow-ups. The block is ALWAYS fenced: a line with exactly ```openui-lang, the program, then a line with ```. Never write the program outside a fence, and never say the program in words. When you only answer a question, write no block.",
    lang === "ar"
      ? "Answer in Egyptian Arabic (Masri) by default, and in the language the user writes to you. Keep titles in their original language."
      : "Answer in English by default, and in the language the user writes to you. Keep titles in their original language.",
    `Right now: ${now}`,
    `\n\n# The screen language (OpenUI Lang)\n${screen}`,
  ].join(" ")
