import "./layout.css"
import { Clapperboard, Film, House, Tv } from "lucide-react"
import type { LayoutDef, LayoutTab } from "../types"
import Shell from "./shell"
import Home from "./home"
import { Browse, Live } from "./pages/browse"
import Detail from "./pages/detail"
import { Category, Settings } from "./pages/guarded"

const tab = (key: string, label: string, labelKey: string, icon: LayoutTab["icon"]): LayoutTab => ({ key, label, labelKey, route: key, icon })
// no Library tab, no Settings tab: Settings is the PIN-gated lock button in the Shell
const TABS_KIDS = [tab("home", "Home", "nav.home", House), tab("movies", "Movies", "nav.movies", Film), tab("series", "Shows", "nav.shows", Clapperboard), tab("live", "Live", "nav.live", Tv)]

const def: LayoutDef = { id: "kids", Shell, Home, tabs: TABS_KIDS, pages: { movies: Browse, series: Browse, live: Live, detail: Detail, category: Category, settings: Settings } }
export default def
