import "./layout.css"
import { House, Library, Tv } from "lucide-react"
import type { LayoutDef, LayoutTab } from "../types"
import Shell from "./shell"
import Home from "./home"
import Live from "./live"
import Browse from "../googletv/pages/browse"
import Library_ from "../googletv/pages/library"
import Search from "../googletv/pages/search"
import Detail from "../googletv/pages/detail"
import Profiles from "../googletv/pages/profiles"
import Category from "../googletv/pages/category"
import Genre from "../googletv/pages/genre"
import Settings from "../googletv/pages/settings"

const tab = (key: string, label: string, labelKey: string, icon: LayoutTab["icon"], route = key): LayoutTab => ({ key, label, labelKey, route, icon })
const TABS: LayoutTab[] = [tab("home", "Home", "nav.home", House), tab("live", "Live", "nav.live", Tv), tab("library", "Library", "nav.library", Library)]

const def: LayoutDef = { id: "livetv", Shell, Home, tabs: TABS, pages: { movies: Browse, series: Browse, live: Live, library: Library_, search: Search, detail: Detail, profiles: Profiles, category: Category, genre: Genre, settings: Settings } }
export default def
