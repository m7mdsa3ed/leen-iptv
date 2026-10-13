import { useSettingsNav } from "./sections"

/**
 * The settings outlet: the page the sidebar points at, from the section in the URL (`#/settings/<sec>`).
 * Every layout's settings screen draws its own sidebar (and header) around it, so the sidebar is mounted once and
 * only this region changes when another section is picked. `key` mounts a section fresh each time it is opened.
 */
export function SettingsOutlet() {
  const { key, section } = useSettingsNav()
  const C = section.Component
  return <C key={key} />
}
