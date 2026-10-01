import { useEffect, useState } from "react"

export type Mode = "tv" | "desktop" | "mobile"

export type Override = "auto" | Mode

// Manual choice from Settings. Read once at load (isTv is a module constant), so changing it reloads the app.
export const getOverride = (): Override => {
  try {
    const v = localStorage.getItem("iptv-mode")
    return v === "tv" || v === "desktop" || v === "mobile" ? v : "auto"
  } catch { return "auto" }
}
export const setOverride = (o: Override) => {
  try { o === "auto" ? localStorage.removeItem("iptv-mode") : localStorage.setItem("iptv-mode", o) } catch { /* private mode */ }
  location.reload()
}

const ov = getOverride()
// ?tv=1 always wins so a bad override can be undone from the URL
const urlTv = /[?&]tv=1\b/.test(location.search)
export const isTv = urlTv || ov === "tv" || (ov === "auto" && /Web0S|webOS|SmartTV/i.test(navigator.userAgent))

const calc = (): Mode =>
  isTv ? "tv" : ov !== "auto" ? ov : window.innerWidth < 768 || matchMedia("(pointer: coarse) and (max-height: 500px)").matches ? "mobile" : "desktop"
const apply = (m: Mode) => { document.documentElement.dataset.mode = m; return m }
apply(calc())

export function useMode(): Mode {
  const [m, setM] = useState(calc)
  useEffect(() => {
    if (isTv || ov !== "auto") return
    const f = () => setM(apply(calc()))
    window.addEventListener("resize", f)
    f()
    return () => window.removeEventListener("resize", f)
  }, [])
  return m
}

export function useTouch(): boolean {
  const [t, setT] = useState(() => matchMedia("(pointer: coarse)").matches)
  useEffect(() => {
    const q = matchMedia("(pointer: coarse)")
    const f = () => setT(q.matches)
    q.addEventListener("change", f)
    return () => q.removeEventListener("change", f)
  }, [])
  return t
}
