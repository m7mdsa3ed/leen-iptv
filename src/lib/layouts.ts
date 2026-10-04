export const LAYOUT_IDS = ["googletv"] as const
export type LayoutId = (typeof LAYOUT_IDS)[number]

export const LAYOUTS_META: { id: LayoutId; name: string }[] = [{ id: "googletv", name: "Google TV" }]
