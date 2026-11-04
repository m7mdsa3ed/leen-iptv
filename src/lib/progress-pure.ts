// Pure: what counts as "in progress" for Continue watching (no alias imports, `node scripts/*.check.ts` can load it).
/** `next` = a show's entry whose last episode is finished but more episodes follow (set by the player), so the show stays in Continue watching. */
export type Pg = { pos: number; dur: number; t?: number; next?: 1 }

/** Started and not finished, or a show with episodes still to watch. */
export const resumable = (p: Pg | undefined): boolean => !!p && p.dur > 0 && (!!p.next || (p.pos > 30 && p.pos / p.dur < 0.95))
