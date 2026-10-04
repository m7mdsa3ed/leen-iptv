import "./layout.css"
import type { LayoutDef } from "../types"
import { TABS_GOOGLETV } from "../tabs"
import Shell from "./shell"
import Home from "./home"
import Browse from "./pages/browse"
import Live from "./pages/live"
import Library from "./pages/library"
import Detail from "./pages/detail"
import Profiles from "./pages/profiles"
import Category from "./pages/category"
import Genre from "./pages/genre"
import Settings from "./pages/settings"

const def: LayoutDef = { id: "googletv", Shell, Home, tabs: TABS_GOOGLETV, pages: { movies: Browse, series: Browse, live: Live, library: Library, detail: Detail, profiles: Profiles, category: Category, genre: Genre, settings: Settings } }
export default def
