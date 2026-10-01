import type { LayoutDef } from "../types"
import { TABS_APPLETV } from "../tabs"
import Shell from "./shell"
import Home from "./home"
import Browse from "./pages/browse"
import Detail from "./pages/detail"
import Library from "./pages/library"
import Live from "./pages/live"
import Search from "./pages/search"
import Category from "./pages/category"
import Genre from "./pages/genre"
import Person from "./pages/person"
import Settings from "./pages/settings"
import "./layout.css"

const def: LayoutDef = { id: "appletv", Shell, Home, tabs: TABS_APPLETV, pages: { movies: Browse, series: Browse, live: Live, detail: Detail, search: Search, library: Library, category: Category, genre: Genre, person: Person, settings: Settings } }
export default def
