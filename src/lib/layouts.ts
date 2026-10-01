export const LAYOUT_IDS = ["googletv", "appletv", "netflix"] as const
export type LayoutId = (typeof LAYOUT_IDS)[number]

export const LAYOUTS_META: { id: LayoutId; name: string; descKey: string }[] = [
  { id: "googletv", name: "Google TV", descKey: "nav.layout.googletv.desc" },
  { id: "appletv", name: "Apple TV", descKey: "nav.layout.appletv.desc" },
  { id: "netflix", name: "Netflix", descKey: "nav.layout.netflix.desc" },
]
