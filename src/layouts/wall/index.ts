import "./layout.css"
import { Clapperboard, Film, House, Library as LibIcon, Tv } from "lucide-react"
import type { LayoutDef, LayoutTab } from "../types"
import Shell from "./shell"
import Home from "./home"
import Browse from "./pages/browse"
import Live from "./pages/live"
// ponytail: Detail/Search/Library/Category/Genre/Profiles/Settings reuse the Google TV pages (same props, presentation is shared tokens)
import Detail from "../googletv/pages/detail"
import Search from "../googletv/pages/search"
import Library from "../googletv/pages/library"
import Category from "../googletv/pages/category"
import Genre from "../googletv/pages/genre"
import Profiles from "../googletv/pages/profiles"
import Settings from "../googletv/pages/settings"

const tab = (key: string, label: string, labelKey: string, icon: LayoutTab["icon"]): LayoutTab => ({ key, label, labelKey, route: key, icon })
const TABS: LayoutTab[] = [tab("home", "Home", "nav.home", House), tab("movies", "Movies", "nav.movies", Film), tab("series", "Shows", "nav.shows", Clapperboard), tab("live", "Live", "nav.live", Tv), tab("library", "Library", "nav.library", LibIcon)]

const def: LayoutDef = { id: "wall", Shell, Home, tabs: TABS, pages: { movies: Browse, series: Browse, live: Live, detail: Detail, search: Search, library: Library, category: Category, genre: Genre, profiles: Profiles, settings: Settings } }
export default def
