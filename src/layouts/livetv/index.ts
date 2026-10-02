import "./layout.css"
import { Clapperboard, Film, Library, Tv } from "lucide-react"
import type { LayoutDef, LayoutTab } from "../types"
import Shell from "./shell"
import Home from "./home"
import Browse from "../googletv/pages/browse"
import Library_ from "../googletv/pages/library"
import Search from "../googletv/pages/search"
import Detail from "../googletv/pages/detail"
import Profiles from "../googletv/pages/profiles"
import Category from "../googletv/pages/category"
import Genre from "../googletv/pages/genre"
import Settings from "../googletv/pages/settings"

const tab = (key: string, label: string, labelKey: string, icon: LayoutTab["icon"], route = key): LayoutTab => ({ key, label, labelKey, route, icon })
// Live is the home page (key "home"); the shell also marks it active on page "live"
const TABS: LayoutTab[] = [tab("home", "Live", "nav.live", Tv), tab("movies", "Movies", "nav.movies", Film), tab("series", "Shows", "nav.shows", Clapperboard), tab("library", "Library", "nav.library", Library)]

const def: LayoutDef = { id: "livetv", Shell, Home, tabs: TABS, pages: { movies: Browse, series: Browse, live: Home, library: Library_, search: Search, detail: Detail, profiles: Profiles, category: Category, genre: Genre, settings: Settings } }
export default def
