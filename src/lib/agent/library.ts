// The OpenUI Lang library the voice assistant draws with (https://www.openui.com/docs/openui-lang/defining-components). Lives in the lazy AI bundle
// (sdk.ts): the app hands in the visual parts (`UiKit`), so this file imports nothing of the app and the bundle never carries a second copy of it.
// No JSX on purpose: `node scripts/agent.check.ts` loads it. Ids are resolved against the live catalog by the kit, so a made-up id draws nothing.
import { createLibrary, createParser, defineComponent, useTriggerAction, type Library } from "@openuidev/react-lang"
import { createElement, type ComponentType, type ReactNode } from "react"
import { z } from "zod/v4"

export type UiKit = {
  Screen: ComponentType<{ title?: string; children?: ReactNode }>
  Shelf: ComponentType<{ title: string; ids: string[]; wide: boolean }>
  Note: ComponentType<{ text: string }>
  Chips: ComponentType<{ options: string[]; pick: (label: string) => void }>
}

export const MAX_IDS = 12
export const MAX_CHIPS = 4

export function makeLibrary(ui: UiKit) {
  const Shelf = defineComponent({
    name: "Shelf",
    description: "A row of titles from the user's library, by id (ids come from search or suggest). wide=true shows landscape cards, else posters.",
    props: z.object({ title: z.string(), ids: z.array(z.string()), wide: z.boolean().optional() }),
    component: ({ props }) => createElement(ui.Shelf, { title: props.title, ids: props.ids.slice(0, MAX_IDS), wide: !!props.wide }),
  })
  const Note = defineComponent({
    name: "Note",
    description: "One short sentence shown on screen, like a caption.",
    props: z.object({ text: z.string() }),
    component: ({ props }) => createElement(ui.Note, { text: props.text }),
  })
  const Chips = defineComponent({
    name: "Chips",
    description: "Up to 4 short follow-up choices. Pressing one sends it to you as if the user had said it.",
    props: z.object({ options: z.array(z.string()) }),
    component: ({ props }) => {
      const trigger = useTriggerAction()
      return createElement(ui.Chips, { options: props.options.slice(0, MAX_CHIPS), pick: (label: string) => trigger(label) })
    },
  })
  const Screen = defineComponent({
    name: "Screen",
    description: "The whole picture: shelves, notes and follow-up chips, top to bottom. Every program starts with root = Screen(...).",
    props: z.object({ parts: z.array(z.union([Shelf.ref, Note.ref, Chips.ref])), title: z.string().optional() }),
    component: ({ props, renderNode }) => createElement(ui.Screen, { title: props.title }, renderNode(props.parts) as ReactNode),
  })
  return createLibrary({
    root: "Screen",
    components: [Screen, Shelf, Note, Chips],
    componentGroups: [{ name: "Voice screen", components: ["Screen", "Shelf", "Note", "Chips"], notes: ["- One Shelf per idea (Continue watching, Tonight). At most 12 ids each.", "- Never write an id you were not given by a tool."] }],
  })
}

export type Check = (program: string) => { ok: true; ids: string[] } | { ok: false; error: string }

type Node = { typeName?: string; props?: Record<string, unknown> }
const walk = (v: unknown, out: Node[]): void => {
  if (Array.isArray(v)) return v.forEach((x) => walk(x, out))
  if (!v || typeof v !== "object") return
  const n = v as Node
  if (n.typeName) out.push(n)
  if (n.props) Object.values(n.props).forEach((x) => walk(x, out))
}

const parsers = new WeakMap<Library, ReturnType<typeof createParser>>()
/** Is this a program the library can draw, and which ids does it ask for? Never throws; the error text is for the model to read and fix. */
export function checkProgram(lib: Library, program: string): ReturnType<Check> {
  if (!program.trim()) return { ok: false, error: "The program is empty." }
  let parser = parsers.get(lib)
  if (!parser) parsers.set(lib, (parser = createParser(lib.toJSONSchema(), lib.root)))
  try {
    const r = parser.parse(program)
    if (!r.root) return { ok: false, error: r.meta.errors.map((e) => e.message).slice(0, 2).join("; ") || "No root. Start with root = Screen([...])." }
    if (r.meta.errors.length) return { ok: false, error: r.meta.errors.map((e) => e.message).slice(0, 3).join("; ") }
    const nodes: Node[] = []
    walk(r.root, nodes)
    return { ok: true, ids: nodes.filter((n) => n.typeName === "Shelf").flatMap((n) => (Array.isArray(n.props?.ids) ? (n.props.ids as unknown[]).filter((x): x is string => typeof x === "string") : [])) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
