import { addLogoRows, emptyLogoIndex, sealLogoIndex, type LogoIndex, type LogoRow } from "./logos-pure"

let ix: Promise<LogoIndex | null> | undefined
/**
 * The bundled channel logo index (public/channel-logos.json, ~3 MB), loaded once on first use. XHR, not fetch: the packaged TV app runs from file://.
 * Indexed 2000 rows per task: the whole file at once freezes a TV CPU for a second or two.
 */
export const loadLogoIndex = (): Promise<LogoIndex | null> =>
  (ix ??= new Promise((res) => {
    const x = new XMLHttpRequest()
    x.open("GET", "./channel-logos.json")
    x.onload = () => {
      let rows: LogoRow[]
      try { rows = JSON.parse(x.responseText) as LogoRow[] } catch { return res(null) }
      const out = emptyLogoIndex()
      const step = (i: number) => {
        addLogoRows(out, rows.slice(i, i + 2000))
        if (i + 2000 < rows.length) setTimeout(step, 0, i + 2000)
        else res(sealLogoIndex(out))
      }
      step(0)
    }
    x.onerror = () => res(null) // no logos is fine: channels keep their initials
    x.send()
  }))
