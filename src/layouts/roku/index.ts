import "./layout.css"
import type { LayoutDef } from "../types"
import gtv from "../googletv"
import { TABS_ROKU } from "./tabs"
import Shell from "./shell"
import Home from "./home"
import Browse from "./pages/browse"
import Live from "./pages/live"
import Library from "./pages/library"
import Detail from "./pages/detail"

// Search/Category/Genre/Profiles/Settings: the Google TV pages (same props, token-styled, no tab bar dependency)
const { search, category, genre, profiles, settings } = gtv.pages ?? {}
const def: LayoutDef = { id: "roku", Shell, Home, tabs: TABS_ROKU, pages: { movies: Browse, series: Browse, live: Live, library: Library, detail: Detail, search, category, genre, profiles, settings } }
export default def
