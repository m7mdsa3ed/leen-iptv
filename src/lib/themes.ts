/** Named colour themes layered on the light/dark mode. CSS for each is the marked block at the end of src/index.css (generated from this table). */
export type ColorThemeId = "default" | "midnight" | "amoled" | "forest" | "sunset" | "rose" | "violet" | "mocha"
/** background, surface, surface-2, surface-3, accent, accent container, text on accent */
export type Palette = readonly [string, string, string, string, string, string, string]
export type ThemeDef = { id: ColorThemeId; nameKey: string; dark?: Palette; light?: Palette }

export const THEMES: readonly ThemeDef[] = [
  { id: "default", nameKey: "settings.theme.default", dark: ["#0e0f11", "#1b1c1f", "#25262a", "#2f3135", "#8ab4f8", "#2b4a76", "#062e6f"], light: ["#f4f5f7", "#ffffff", "#eceef2", "#e1e4ea", "#1a73e8", "#d3e3fd", "#ffffff"] },
  { id: "midnight", nameKey: "settings.theme.midnight", dark: ["#0b1020", "#131a2e", "#1b2440", "#26315a", "#7aa2ff", "#24407e", "#0a1633"], light: ["#eef2fb", "#ffffff", "#e1e8f7", "#d2dbf0", "#2f55d4", "#d6e0fb", "#ffffff"] },
  { id: "amoled", nameKey: "settings.theme.amoled", dark: ["#000000", "#0d0d0d", "#161616", "#222222", "#8ab4f8", "#1f3a64", "#062e6f"] },
  { id: "forest", nameKey: "settings.theme.forest", dark: ["#0c130f", "#141f18", "#1d2b22", "#283a2e", "#6fcf97", "#1f4a33", "#05260f"], light: ["#eef4ef", "#ffffff", "#e0ebe3", "#d0dfd4", "#1e7a45", "#cdeedb", "#ffffff"] },
  { id: "sunset", nameKey: "settings.theme.sunset", dark: ["#150f0c", "#211814", "#2e211b", "#3d2d25", "#ff9a62", "#6a3418", "#3a1500"], light: ["#fbf3ee", "#ffffff", "#f5e5dc", "#ecd5c8", "#c8501a", "#fcd9c5", "#ffffff"] },
  { id: "rose", nameKey: "settings.theme.rose", dark: ["#160e12", "#22151b", "#2f1d26", "#3e2733", "#ff8fb1", "#6b2342", "#3d0720"], light: ["#fcf1f4", "#ffffff", "#f6e1e8", "#eecfda", "#c2185b", "#fbd0df", "#ffffff"] },
  { id: "violet", nameKey: "settings.theme.violet", dark: ["#110d1a", "#1a1427", "#251c38", "#322750", "#b69cff", "#46308a", "#1c0b52"], light: ["#f5f1fc", "#ffffff", "#e9e1f8", "#dbd0f1", "#6d3fd1", "#e0d4fb", "#ffffff"] },
  { id: "mocha", nameKey: "settings.theme.mocha", dark: ["#14100d", "#1e1814", "#2a221c", "#382e26", "#d9a877", "#5a3f22", "#2e1a05"], light: ["#f6f0ea", "#ffffff", "#ebe0d5", "#dfd0c1", "#8a5a2b", "#f0dcc4", "#ffffff"] },
]

/** Preview chips: background, raised surface, accent. */
export const swatches = (t: ThemeDef, dark: boolean): readonly string[] => { const p = (dark ? t.dark : t.light) ?? t.dark!; return [p[0], p[2], p[4]] }

// CSS generator (regenerate: node -e "import(\"./src/lib/themes.ts\").then(m=>console.log(m.themeCss()))"): prints the rules appended to index.css
const css = (sel: string, p: Palette, dark: boolean) => {
  const ink = dark ? "255, 255, 255" : "0, 0, 0"
  const fg = dark ? "rgba(255, 255, 255, 0.87)" : "#1f1f1f"
  return `${sel} { --background: ${p[0]}; --surface: ${p[1]}; --surface-2: ${p[2]}; --surface-3: ${p[3]}; --accent-blue: ${p[4]}; --accent-blue-container: ${p[5]}; --primary: ${p[4]}; --primary-foreground: ${p[6]}; --ring: ${p[4]}; --focus-bg: ${dark ? "#ffffff" : "#1f1f1f"}; --focus-fg: ${dark ? "#1f1f1f" : "#ffffff"}; --fade-mid: ${p[0]}b3; --fade-to: ${p[0]}00; --card: ${p[1]}; --popover: ${p[2]}; --secondary: ${p[2]}; --muted: ${p[2]}; --accent: ${p[3]}; --float-bg: ${p[dark ? 2 : 1]}${dark ? "a3" : "b8"}; --foreground: ${fg}; --card-foreground: ${fg}; --popover-foreground: ${fg}; --secondary-foreground: ${fg}; --accent-foreground: ${fg}; --muted-foreground: rgba(${ink}, 0.6); --border: rgba(${ink}, 0.12); --input: rgba(${ink}, 0.18); --fg-10: rgba(${ink}, 0.1); --fg-30: rgba(${ink}, 0.3); --fg-40: rgba(${ink}, 0.4); --fg-70: rgba(${ink}, 0.7); --fg-80: rgba(${ink}, 0.8); }`
}
export const themeCss = () => THEMES.filter((t) => t.id !== "default").flatMap((t) => {
  const b = `html[data-theme=${t.id}][data-layout][data-lang]`
  return [t.light && css(b, t.light, false), t.dark && css(`${b}.dark, ${b} .dark`, t.dark, true)].filter(Boolean) as string[]
}).join("\n")
