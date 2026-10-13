import type { Dict } from "../../pure.ts"

const d: Dict = {
  "hooks.browse.movies": "Movies",
  "hooks.browse.series": "Series",
  "hooks.sort.default": "Default",
  "hooks.sort.az": "A-Z",
  "hooks.sort.rating": "Top rated",
  "hooks.sort.added": "Recently added",
  "hooks.sort.year": "Newest",
  "hooks.detail.resume": "Resume",
  "hooks.detail.play": "Play",
  "hooks.detail.watched": "Watched",
  "hooks.detail.markWatched": "Mark watched",
  "hooks.detail.markUnwatched": "Mark unwatched",
  "hooks.detail.removeContinue": "Remove from Continue watching",
  "hooks.detail.match": "Match metadata",
  "hooks.detail.ep": "E{n}",
  "hooks.detail.rating": "Rating",
  "hooks.detail.refreshMeta": "Refresh metadata",
  "hooks.expiry.title": "Subscription ending",
  "hooks.expiry.soon": { one: "{name} ends within a day ({date})", other: "{name} ends in {n} days ({date})" },
  "hooks.expiry.ended": "{name} ended on {date}",
}
export default d
