import "./layout.css"
import type { LayoutDef } from "../types"
import { TABS_NETFLIX } from "../tabs"
import Shell from "./shell"
import Home from "./home"
import Browse from "./pages/browse"
import Live from "./pages/live"
import Detail from "./pages/detail"
import Search from "./pages/search"
import Library from "./pages/library"
import Profiles from "./pages/profiles"
import Category from "./pages/category"
import Genre from "./pages/genre"
import Settings from "./pages/settings"

const def: LayoutDef = { id: "netflix", Shell, Home, tabs: TABS_NETFLIX, pages: { movies: Browse, series: Browse, live: Live, detail: Detail, search: Search, library: Library, profiles: Profiles, category: Category, genre: Genre, settings: Settings } }
export default def
