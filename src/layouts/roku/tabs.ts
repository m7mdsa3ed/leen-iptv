import { Clapperboard, Film, House, Library, Tv } from "lucide-react"
import type { LayoutTab } from "../types"

const tab = (key: string, label: string, labelKey: string, icon: LayoutTab["icon"], route = key): LayoutTab => ({ key, label, labelKey, route, icon })
/** Kept for code that reads def.tabs; the Roku Shell shows no tab bar. */
export const TABS_ROKU = [tab("home", "Home", "nav.home", House), tab("live", "Live", "nav.live", Tv), tab("movies", "Movies", "nav.movies", Film), tab("series", "Shows", "nav.shows", Clapperboard), tab("library", "Library", "nav.library", Library)]
