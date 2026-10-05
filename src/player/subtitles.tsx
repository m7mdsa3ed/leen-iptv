import { useEffect, useState, type CSSProperties, type RefObject } from "react"
import { cleanCue, cueHtml } from "@/lib/subs-pure"
import { usePrefs } from "./prefs"

const FONT = { default: "inherit", sans: "Arial, Helvetica, sans-serif", serif: "Georgia, 'Times New Roman', serif", mono: "'Courier New', Courier, monospace" }
const COLOR = { white: "#ffffff", yellow: "#ffe94d", cyan: "#6ee7ff", green: "#86f08f" }
const BG = { none: "transparent", box: "rgba(0,0,0,.55)", solid: "rgba(0,0,0,.9)" }
const EDGE = {
  outline: "0 0 .08em #000, .05em .05em .05em #000, -.05em -.05em .05em #000, .05em -.05em .05em #000, -.05em .05em .05em #000",
  shadow: ".06em .08em .18em rgba(0,0,0,.95)",
  none: "none",
}

/** The user's look as styles: `text` for the line block, `bg` for each line's box (shared with the Settings preview). */
export function subLook(p: ReturnType<typeof usePrefs>): { text: CSSProperties; bg: string } {
  return {
    text: {
      fontSize: `calc(${p.subSize} * 0.05vh)`, lineHeight: p.subLine, fontFamily: FONT[p.subFont], fontWeight: p.subBold ? 700 : 500, textAlign: p.subAlign,
      color: COLOR[p.subColor] + Math.round((p.subOpacity / 100) * 255).toString(16).padStart(2, "0"), textShadow: EDGE[p.subEdge], // #rrggbbaa: Chrome 62+
    },
    bg: BG[p.subBg],
  }
}

/** Draws the subtitles itself: any subtitle track the browser would show is switched to "hidden" (cues still fire) and its
    active cues are rendered here with the user's look. Works for sidecar <track>s, hls.js tracks and native in-band tracks. */
export function Subtitles({ vref, lift }: { vref: RefObject<HTMLVideoElement | null>; lift: boolean }) {
  const p = usePrefs()
  const [raw, setLines] = useState<string[]>([])
  const lines = raw.map((x) => cueHtml(cleanCue(x, { noHi: p.subNoHi, rtlFix: p.subRtlFix }))).filter(Boolean)
  useEffect(() => {
    const v = vref.current
    if (!v) return
    const list = v.textTracks
    const mine = new Set<TextTrack>()
    const render = () => {
      const out: string[] = []
      mine.forEach((tr) => { if (tr.mode === "hidden") for (const c of Array.from(tr.activeCues ?? [])) out.push((c as VTTCue).text ?? "") })
      setLines((prev) => (prev.length === out.length && prev.every((x, i) => x === out[i]) ? prev : out))
    }
    const sync = () => {
      const now = new Set(Array.from(list))
      for (const tr of now) {
        if (tr.kind !== "subtitles" && tr.kind !== "captions") continue
        if (tr.mode === "showing") { tr.mode = "hidden"; if (!mine.has(tr)) { mine.add(tr); tr.addEventListener("cuechange", render) } }
        else if (tr.mode === "disabled" && mine.has(tr)) { mine.delete(tr); tr.removeEventListener("cuechange", render) }
      }
      for (const tr of mine) if (!now.has(tr)) { mine.delete(tr); tr.removeEventListener("cuechange", render) }
      render()
    }
    list.addEventListener("change", sync); list.addEventListener("addtrack", sync); list.addEventListener("removetrack", sync)
    sync()
    return () => {
      list.removeEventListener("change", sync); list.removeEventListener("addtrack", sync); list.removeEventListener("removetrack", sync)
      mine.forEach((tr) => tr.removeEventListener("cuechange", render))
    }
  }, [vref])
  if (!lines.length) return null
  const look = subLook(p)
  return (
    <div
      aria-live="off"
      className={`pointer-events-none absolute z-[1] mx-auto flex flex-col gap-[.15em] ${p.subAlign === "start" ? "items-start" : "items-center"}`}
      style={{ ...look.text, insetInline: `${(100 - p.subWidth) / 2}%`, bottom: `${lift ? Math.max(p.subPos, 22) : p.subPos}%`, transition: "bottom var(--dur, .2s)" }} // above the controls while they are up
    >
      {lines.map((h, i) => (
        <div key={i} dir="auto" className="whitespace-pre-line">
          <span className="rounded-[.15em] px-[.3em] [box-decoration-break:clone] [-webkit-box-decoration-break:clone]" style={{ background: look.bg }} dangerouslySetInnerHTML={{ __html: h }} />
        </div>
      ))}
    </div>
  )
}
