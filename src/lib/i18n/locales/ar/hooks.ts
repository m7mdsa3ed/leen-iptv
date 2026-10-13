import type { Dict } from "../../pure.ts"

const d: Dict = {
  "hooks.browse.movies": "أفلام",
  "hooks.browse.series": "مسلسلات",
  "hooks.sort.default": "الافتراضي",
  "hooks.sort.az": "أ-ي",
  "hooks.sort.rating": "الأعلى تقييم",
  "hooks.sort.added": "المضاف حديثاً",
  "hooks.sort.year": "الأحدث",
  "hooks.detail.resume": "كمّل",
  "hooks.detail.play": "شغّل",
  "hooks.detail.watched": "اتشاف",
  "hooks.detail.markWatched": "علّمها اتشافت",
  "hooks.detail.markUnwatched": "علّمها لسه ماتشافتش",
  "hooks.detail.removeContinue": "شيلها من كمّل مشاهدة",
  "hooks.detail.match": "صحّح البيانات",
  "hooks.detail.ep": "ح {n}",
  "hooks.detail.rating": "التقييم",
  "hooks.detail.refreshMeta": "حدّث البيانات",
  "hooks.expiry.title": "الاشتراك بيخلص",
  "hooks.expiry.soon": { zero: "{name} بيخلص النهارده ({date})", one: "{name} بيخلص خلال يوم ({date})", two: "{name} بيخلص بعد يومين ({date})", few: "{name} بيخلص بعد {n} أيام ({date})", many: "{name} بيخلص بعد {n} يوم ({date})", other: "{name} بيخلص بعد {n} يوم ({date})" },
  "hooks.expiry.ended": "{name} خلص يوم {date}",
}
export default d
