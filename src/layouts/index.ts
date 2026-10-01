import { useLayoutEffect } from "react"
import { useApp } from "@/lib/store"
import type { LayoutId } from "@/lib/layouts"
import type { LayoutDef } from "./types"
import googletv from "./googletv"
import appletv from "./appletv"
import netflix from "./netflix"

export type { LayoutDef, ShellProps } from "./types"
export const LAYOUT_DEFS: Record<LayoutId, LayoutDef> = { googletv, appletv, netflix }

export const useLayoutId = (): LayoutId => useApp((s) => { const l = (s.settings.layout as string) === "cinema" ? "netflix" : s.settings.layout; return l in LAYOUT_DEFS ? l : "googletv" }) // saved ids of removed/renamed layouts fall back
export const useLayoutDef = (): LayoutDef => LAYOUT_DEFS[useLayoutId()]

/** Keeps html[data-layout] in sync (call once, from App). */
export function useLayoutAttr() {
  const id = useLayoutId()
  useLayoutEffect(() => { document.documentElement.dataset.layout = id }, [id])
}
