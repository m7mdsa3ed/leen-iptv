export const LAYOUT_IDS = ["googletv", "appletv", "netflix", "livetv", "prime", "roku", "wall", "kids"] as const
export type LayoutId = (typeof LAYOUT_IDS)[number]

export const LAYOUTS_META: { id: LayoutId; name: string; descKey: string }[] = [
  { id: "googletv", name: "Google TV", descKey: "nav.layout.googletv.desc" },
  { id: "appletv", name: "Apple TV", descKey: "nav.layout.appletv.desc" },
  { id: "netflix", name: "Netflix", descKey: "nav.layout.netflix.desc" },
  { id: "livetv", name: "Live TV", descKey: "nav.layout.livetv.desc" },
  { id: "prime", name: "Prime", descKey: "nav.layout.prime.desc" },
  { id: "roku", name: "Simple tiles", descKey: "nav.layout.roku.desc" },
  { id: "wall", name: "Plex style", descKey: "nav.layout.wall.desc" },
  { id: "kids", name: "Kids", descKey: "nav.layout.kids.desc" },
]
