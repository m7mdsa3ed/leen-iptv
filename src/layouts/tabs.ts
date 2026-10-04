import { Clapperboard, Film, House, Library, Trophy, Tv } from "lucide-react"
import type { LayoutTab } from "./types"

const tab = (key: string, label: string, labelKey: string, icon: LayoutTab["icon"], route = key): LayoutTab => ({ key, label, labelKey, route, icon })
/** Default tab lists for the layout (def.tabs). */
export const TABS_GOOGLETV = [tab("home", "For you", "nav.forYou", House), tab("live", "Live", "nav.live", Tv), tab("sports", "Sports", "nav.sports", Trophy), tab("movies", "Movies", "nav.movies", Film), tab("series", "Shows", "nav.shows", Clapperboard), tab("library", "Library", "nav.library", Library)]
