import "./layout.css"
import type { LayoutDef } from "../types"
import { TABS_PRIME } from "./tabs"
import Shell from "./shell"
import Home from "./home"
import Browse from "./pages/browse"
import Live from "./pages/live"
import Detail from "./pages/detail"
import Settings from "./pages/settings"
// Search / Library / Category / Genre / Profiles take the same props and only use tokens: reuse Google TV's
import Search from "../googletv/pages/search"
import Library from "../googletv/pages/library"
import Category from "../googletv/pages/category"
import Genre from "../googletv/pages/genre"
import Profiles from "../googletv/pages/profiles"

const def: LayoutDef = { id: "prime", Shell, Home, tabs: TABS_PRIME, pages: { movies: Browse, series: Browse, live: Live, detail: Detail, settings: Settings, search: Search, library: Library, category: Category, genre: Genre, profiles: Profiles } }
export default def
