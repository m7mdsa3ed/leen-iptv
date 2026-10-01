import { Bookmark, Clapperboard, Film, House, Library, PlayCircle, Tv } from "lucide-react"
import type { LayoutTab } from "./types"

const tab = (key: string, label: string, icon: LayoutTab["icon"], route = key): LayoutTab => ({ key, label, route, icon })
/** Default tab lists per layout (def.tabs). */
export const TABS_GOOGLETV = [tab("home", "For you", House), tab("live", "Live", Tv), tab("movies", "Movies", Film), tab("series", "Shows", Clapperboard), tab("library", "Library", Library)]
export const TABS_APPLETV = [tab("home", "Watch Now", PlayCircle), tab("movies", "Movies", Film), tab("series", "Shows", Clapperboard), tab("live", "Live", Tv), tab("library", "Library", Library)]
export const TABS_NETFLIX = [tab("home", "Home", House), tab("series", "Shows", Clapperboard), tab("movies", "Movies", Film), tab("live", "Live", Tv), tab("library", "My List", Bookmark)]
