import type { Check } from "./library"

/** The parser for the OpenUI library, set by the overlay once the lazy SDK bundle is loaded (the library needs the app's visual parts). */
let check: Check | null = null
export const setChecker = (c: Check | null) => { check = c }
export const getChecker = () => check
