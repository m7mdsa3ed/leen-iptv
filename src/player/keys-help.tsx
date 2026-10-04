import { useT } from "@/lib/i18n"

const ROWS: [string, string][] = [
  ["Space", "player.help.playPause"],
  ["← →", "player.help.seek"],
  ["↑ ↓", "player.help.volume"],
  ["M", "player.help.mute"],
  ["F", "player.help.fullscreen"],
  ["P", "player.help.pip"],
  ["C", "player.help.strip"],
  ["↓", "player.help.more"],
  ["0-9", "player.help.channel"],
  ["?", "player.help.help"],
  ["Esc", "player.help.back"],
]

/** Desktop keyboard shortcuts, toggled with "?". Click or press ? / Esc to close. */
export function KeysHelp({ onClose, live }: { onClose: () => void; live: boolean }) {
  const t = useT()
  return (
    <div role="dialog" aria-label={t("player.help.title")} className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 m-fade" onClick={onClose}>
      <div className="pl-sheet m-pop max-h-[92%] w-[26rem] max-w-[92%] overflow-y-auto rounded-[var(--pl-r)] bg-surface p-6 text-foreground shadow-2xl">
        <div className="pl-title mb-3">{t("player.help.title")}</div>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-2 text-base">
          {ROWS.filter(([k]) => live || !["0-9", "C"].includes(k)).map(([k, key]) => (
            <div key={k} className="contents">
              <dt dir="ltr" className="justify-self-start rounded-lg bg-surface-3 px-2.5 py-0.5 font-mono text-sm">{k}</dt>
              <dd>{t(key === "player.help.volume" && live ? "player.help.channelUpDown" : key)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
