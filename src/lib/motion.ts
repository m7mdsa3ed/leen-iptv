import { useEffect } from "react"
import { useApp } from "@/lib/store"

/** Keeps <html data-motion="full|reduced|off"> in sync with Settings > Display > Motion. prefers-reduced-motion caps "full" at "reduced". Call once in App. */
export function useMotion() {
  const motion = useApp((s) => s.settings.motion)
  useEffect(() => {
    const q = matchMedia("(prefers-reduced-motion: reduce)")
    const apply = () => { document.documentElement.dataset.motion = q.matches && motion === "full" ? "reduced" : motion }
    apply()
    q.addEventListener("change", apply)
    return () => q.removeEventListener("change", apply)
  }, [motion])
}
