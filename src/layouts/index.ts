import { useLayoutEffect } from "react"
import { useApp } from "@/lib/store"
import type { LayoutId } from "@/lib/layouts"
import type { LayoutDef } from "./types"
import googletv from "./googletv"

export type { LayoutDef, ShellProps } from "./types"
export const LAYOUT_DEFS: Record<LayoutId, LayoutDef> = { googletv }

export const useLayoutId = (): LayoutId => useApp((s) => { return s.settings.layout in LAYOUT_DEFS ? s.settings.layout : "googletv" }) // saved ids of removed/renamed layouts fall back
export const useLayoutDef = (): LayoutDef => LAYOUT_DEFS[useLayoutId()]

/** Keeps html[data-layout] in sync (call once, from App). */
export function useLayoutAttr() {
  const id = useLayoutId()
  useLayoutEffect(() => { document.documentElement.dataset.layout = id }, [id])
}
