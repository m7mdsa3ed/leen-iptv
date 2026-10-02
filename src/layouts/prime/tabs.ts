import { Clapperboard, Film, House, Library, Tv } from "lucide-react"
import type { LayoutTab } from "../types"

const tab = (key: string, label: string, labelKey: string, icon: LayoutTab["icon"]): LayoutTab => ({ key, label, labelKey, route: key, icon })
export const TABS_PRIME = [tab("home", "Home", "nav.home", House), tab("movies", "Movies", "nav.movies", Film), tab("series", "TV Shows", "pv.tab.shows", Clapperboard), tab("live", "Live", "nav.live", Tv), tab("library", "Library", "nav.library", Library)]
