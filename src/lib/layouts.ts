export const LAYOUT_IDS = ["googletv", "appletv", "netflix"] as const
export type LayoutId = (typeof LAYOUT_IDS)[number]

export const LAYOUTS_META: { id: LayoutId; name: string; description: string }[] = [
  { id: "googletv", name: "Google TV", description: "Top bar, big hero and rails with white focus pills." },
  { id: "appletv", name: "Apple TV", description: "Floating tab pill, featured carousel and large rounded shelves." },
  { id: "netflix", name: "Netflix", description: "Tall billboard, tall posters that grow on focus, numbered top picks, red accent." },
]
