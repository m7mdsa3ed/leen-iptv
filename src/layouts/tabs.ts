import { Bookmark, Clapperboard, Film, House, Library, PlayCircle, Tv } from "lucide-react"
import type { LayoutTab } from "./types"

const tab = (key: string, label: string, labelKey: string, icon: LayoutTab["icon"], route = key): LayoutTab => ({ key, label, labelKey, route, icon })
/** Default tab lists per layout (def.tabs). */
export const TABS_GOOGLETV = [tab("home", "For you", "nav.forYou", House), tab("live", "Live", "nav.live", Tv), tab("movies", "Movies", "nav.movies", Film), tab("series", "Shows", "nav.shows", Clapperboard), tab("library", "Library", "nav.library", Library)]
export const TABS_APPLETV = [tab("home", "Watch Now", "nav.watchNow", PlayCircle), tab("movies", "Movies", "nav.movies", Film), tab("series", "Shows", "nav.shows", Clapperboard), tab("live", "Live", "nav.live", Tv), tab("library", "Library", "nav.library", Library)]
export const TABS_NETFLIX = [tab("home", "Home", "nav.home", House), tab("series", "Shows", "nav.shows", Clapperboard), tab("movies", "Movies", "nav.movies", Film), tab("live", "Live", "nav.live", Tv), tab("library", "My List", "nav.myList", Bookmark)]
