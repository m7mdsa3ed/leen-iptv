import { useState } from "react"
import { Brain, Check, ChevronDown, Loader2, Wrench, X } from "lucide-react"
import { useCatalog } from "@/lib/catalog"
import type { Step } from "@/lib/agent/pure"
import { fmt, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** What the assistant is doing, shown by default (Settings > Assistant turns it off): one line per tool call, and its reasoning when the model gives any.
    Values are plain data from the tools; an item id is shown as the title it names. */
const useTitle = (id: string) => useCatalog((s) => s.byId.get(id)?.name)

function Line({ step, describe }: { step: Step; describe?: boolean }) {
  const t = useT()
  const title = useTitle(step.arg)
  const arg = title ?? (step.arg.includes("|") ? "" : step.arg) // an unknown id is not a thing to read out
  const r = step.result
  const icon = step.state === "run" ? <Loader2 className="size-4 animate-spin" /> : step.state === "error" ? <X className="size-4 text-red-400" /> : <Check className="size-4 text-green-400" />
  const done = !r ? "" : r.kind === "count" ? t("trace.count", { n: fmt.number(r.n) }) : r.kind === "text" ? r.text : r.kind === "error" ? r.text : ""
  return (
    <li className={cn("flex min-w-0 items-center gap-2.5 text-muted-foreground", describe ? "text-sm" : "text-base")}>
      <span aria-hidden className="grid size-5 shrink-0 place-items-center">{icon}</span>
      <Wrench aria-hidden className="size-4 shrink-0 opacity-60" />
      {describe
        // chat: only the model's own words; a call that came without them shows just the tool's name, never the arguments or the result count
        ? <span dir="auto" className="min-w-0 truncate text-foreground">{step.desc || t(`trace.tool.${step.name}`)}</span>
        : <span dir="auto" className="min-w-0 truncate"><span className="text-foreground">{t(`trace.tool.${step.name}`)}</span>{arg ? ` ${arg}` : ""}{done ? ` \u00b7 ${done}` : ""}</span>}
    </li>
  )
}

/** `describe` = the chat: each line is the model's own `description` (see CHAT_TOOLS). Voice keeps the generated line. */
export function Steps({ steps, describe }: { steps: Step[]; describe?: boolean }) {
  const t = useT()
  if (!steps.length) return null
  return <ul aria-label={t("trace.steps")} className={cn("flex flex-col gap-1.5 rounded-2xl bg-white/5", describe ? "px-3.5 py-2.5" : "px-4 py-3")}>{steps.map((s) => <Line key={s.id} step={s} describe={describe} />)}</ul>
}

/** The model's reasoning: open while it streams (so it is read as it arrives), a single tap-to-open line once done. */
export function Reasoning({ text, streaming }: { text: string; streaming: boolean }) {
  const t = useT()
  const [open, setOpen] = useState<boolean | null>(null)
  const shown = open ?? streaming
  if (!text.trim()) return null
  return (
    <div className="max-w-3xl rounded-2xl bg-white/5 px-4 py-3">
      <button type="button" data-nav aria-expanded={shown} onClick={() => setOpen(!shown)} className="flex w-full items-center gap-2.5 rounded-full text-start text-base text-muted-foreground">
        <Brain aria-hidden className={cn("size-4 shrink-0", streaming && "animate-pulse")} />
        <span className="min-w-0 flex-1 truncate">{streaming ? t("trace.thinking") : t("trace.thought")}</span>
        <ChevronDown aria-hidden className={cn("size-4 shrink-0 transition-transform", shown && "rotate-180")} />
      </button>
      {shown && <p dir="auto" className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-muted-foreground text-pretty">{text.trim()}</p>}
    </div>
  )
}
