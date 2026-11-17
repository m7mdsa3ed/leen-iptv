/** Poster size setting (Settings > Display) -> scale factor used by [data-poster] rails (CSS zoom) and VGrid column width. */
export const CARD_K = { small: 0.85, normal: 1, large: 1.2, xl: 1.4 } as const
export const CARD_SIZES = Object.keys(CARD_K) as (keyof typeof CARD_K)[]
/** Grid size (filter bar / Settings > Browsing): the card sizes plus smaller and bigger steps, VGrid column width only. */
export const GRID_K = { xxs: 0.55, xs: 0.7, ...CARD_K, xxl: 1.7 } as const
export type GridSize = keyof typeof GRID_K
export const GRID_SIZES = Object.keys(GRID_K) as GridSize[]
