import { Field, Pill, Row, SectionCard, Segmented, ToggleRow } from "../controls"
import { useLang, useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"
import { DEFAULT_SUB_LANGS, SUB_LANGS } from "@/lib/subs-pure"
import { SUB_SIZES, SUB_STYLE, setPrefs, usePrefs, type SubStyleKey } from "@/player/prefs"
import { subLook } from "@/player/subtitles"
import { langName, subValue } from "@/player/menus"
import { useSettingsNav } from "../sections"

/** Subtitle providers, language preferences, and device-local subtitle appearance. */
export default function SubtitlesSection() {
  const t = useT()
  const { lang: ui } = useLang()
  const subs = useApp((s) => s.settings.subs) ?? {}
  const setSettings = useApp((s) => s.setSettings)
  const p = usePrefs()
  const { parent, close } = useSettingsNav()
  const langs = subs.langs ?? DEFAULT_SUB_LANGS
  const toggle = (l: string) => setSettings({ subs: { ...subs, langs: langs.includes(l) ? langs.filter((x) => x !== l) : [...langs, l] } })
  const look = subLook(p)
  return (
    <SectionCard title={t("settings.subs.title")} description={t("settings.subs.desc")}>
      {parent && <Row label={t("settings.subs.parentLabel", { parent: parent.title })}><Pill onClick={close}>{t("settings.subs.backToPlayback")}</Pill></Row>}
      <Row label={t("settings.subs.langs")} description={t("settings.subs.langs.desc")} stack>
        <div role="group" aria-label={t("settings.subs.langs")} data-nav-group className="flex flex-wrap gap-2">
          {SUB_LANGS.map((l) => <Pill key={l} role="checkbox" aria-checked={langs.includes(l)} variant={langs.includes(l) ? "primary" : "tonal"} onClick={() => toggle(l)}>{langName(l, ui)}</Pill>)}
        </div>
      </Row>
      <ToggleRow label={t("settings.subs.auto")} description={t("settings.subs.auto.desc")} checked={!!subs.auto} onChange={(v) => setSettings({ subs: { ...subs, auto: v } })} />
      <Field label={t("settings.subs.subdl")} hint={t("settings.subs.subdl.hint")} type="password" dir="ltr" value={subs.subdl ?? ""} onChange={(v) => setSettings({ subs: { ...subs, subdl: v.trim() } })} />
      <Field label={t("settings.subs.os")} hint={t("settings.subs.os.hint")} type="password" dir="ltr" value={subs.os ?? ""} onChange={(v) => setSettings({ subs: { ...subs, os: v.trim() } })} />
      <Row label={t("settings.subs.look")} stack>
        <div className="flex min-h-24 items-end justify-center rounded-xl bg-[linear-gradient(135deg,#1f2a3a,#3b2a1f)] p-4" aria-hidden>
          <span dir="auto" className="rounded-[.15em] px-[.3em] text-center" style={{ ...look.text, fontSize: `calc(${p.subSize} * 0.032vh + 0.6rem)`, background: look.bg }}>{t("settings.subs.preview")}</span>
        </div>
      </Row>
      <Row label={t("player.subSize")} stack>
        <Segmented label={t("player.subSize")} value={p.subSize} options={SUB_SIZES.map((n) => ({ value: n, label: `${n}%` }))} onChange={(v) => setPrefs({ subSize: v })} />
      </Row>
      {(Object.keys(SUB_STYLE) as SubStyleKey[]).map((k) => (
        <Row key={k} label={t(`player.sub.${k}`)} stack>
          <Segmented label={t(`player.sub.${k}`)} value={String(p[k])} options={(SUB_STYLE[k] as readonly (string | number | boolean)[]).map((v) => ({ value: String(v), label: subValue(k, v, t) }))}
            onChange={(v) => setPrefs({ [k]: (SUB_STYLE[k] as readonly (string | number | boolean)[]).find((x) => String(x) === v) })} />
        </Row>
      ))}
    </SectionCard>
  )
}
