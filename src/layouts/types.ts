import type { ComponentType, ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import type { LayoutId } from "@/lib/layouts"

export type ShellProps = { page: string; title?: string; children: ReactNode }
/** A navigation item a layout shows: `key` = the Shell `page` it is active on, `route` = what reset(route) opens. */
export type LayoutTab = { key: string; label: string; labelKey: string; route: string; icon: LucideIcon }
/** Pages a layout may replace; an override gets the SAME props as the default page (Detail {id}, Browse {kind}, Category {id}, Genre {id}, Person {id?, name?}). */
export type PageKey = "movies" | "series" | "live" | "detail" | "library" | "profiles" | "settings" | "category" | "genre" | "person" | "episode" | "team" | "match" | "sports"
export type LayoutDef = {
  id: LayoutId
  Shell: ComponentType<ShellProps>
  Home: ComponentType
  tabs: LayoutTab[]
  pages?: Partial<Record<PageKey, ComponentType<any>>> // eslint-disable-line @typescript-eslint/no-explicit-any
}
