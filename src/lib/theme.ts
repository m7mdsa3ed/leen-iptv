import { useEffect } from "react"
import { isTv } from "@/lib/device"
import { useApp } from "@/lib/store"

export type Theme = "system" | "dark" | "light"

/** TVs have no light/dark preference, so "system" means dark there. */
const resolve = (t: Theme, prefersDark: boolean) => t === "dark" || (t === "system" && (isTv || prefersDark))

/** Keeps <html class="dark"> and the browser theme-color in sync with Settings > Display > Theme. index.html does the pre-paint pass. */
export function useTheme() {
  const theme = useApp((s) => s.settings.theme)
  useEffect(() => {
    const q = matchMedia("(prefers-color-scheme: dark)")
    const apply = () => {
      const dark = resolve(theme, q.matches)
      document.documentElement.classList.toggle("dark", dark)
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0e0f11" : "#f4f5f7")
    }
    apply()
    q.addEventListener("change", apply)
    return () => q.removeEventListener("change", apply)
  }, [theme])
}
