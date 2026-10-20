import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react"
import { useApp } from "@/lib/store"
import { useCatalog } from "@/lib/catalog"
import { useLang, useT } from "@/lib/i18n"
import { plexStopTranscode } from "@/lib/plex"
import { jellyfinStopTranscode } from "@/lib/jellyfin"
import { downloadSub, searchSubs, subQuery } from "@/lib/subs"
import { DEFAULT_SUB_LANGS, sameLang } from "@/lib/subs-pure"
import type { Item } from "@/lib/types"
import type { Track } from "./engine"
import { prefs, setPrefs } from "./prefs"
import { SIDECAR_ID } from "./use-sidecar"
import type { Picked } from "./use-source"
import type { usePlayback } from "./use-playback"
import type { useSource } from "./use-source"

type Src = ReturnType<typeof useSource>
type Play = ReturnType<typeof usePlayback>
export type Ext = { id: string; label: string; vtt: string } // a subtitle fetched online, for one title

export const langName = (code: string, ui: string) => { try { return new Intl.DisplayNames([ui], { type: "language" }).of(code) ?? code } catch { return code } }

/** Subtitle tracks of the stream the <video> knows natively (in-band / MP4 text), without our own sidecar. */
function useNativeSubs(vref: RefObject<HTMLVideoElement | null>, on: boolean, itemId: string) {
  const t = useT()
  const [list, setList] = useState<Track[]>([])
  useEffect(() => {
    const v = vref.current
    if (!v || !on) return setList([])
    const tl = v.textTracks
    const read = () => setList(Array.from(tl).map((x, i) => ({ x, i })).filter(({ x }) => x.id !== SIDECAR_ID && (x.kind === "subtitles" || x.kind === "captions"))
      .map(({ x, i }) => ({ id: i, label: x.label || x.language || t("player.subtitleTrack", { n: i + 1 }), detail: x.language || undefined })))
    read()
    tl.addEventListener("addtrack", read); tl.addEventListener("removetrack", read)
    return () => { tl.removeEventListener("addtrack", read); tl.removeEventListener("removetrack", read) }
  }, [vref, on, itemId]) // eslint-disable-line react-hooks/exhaustive-deps
  return list
}

/**
 * Audio and subtitles of what is playing, wherever they come from: the media server's own tracks (a new pick that changes the stream
 * restarts it where it was), hls.js tracks, the <video>'s native text tracks, or a subtitle found online. Remembers the last picked
 * languages (media servers) and, with Settings > Subtitles > "Load my language automatically", puts the first language on by itself:
 * the title's own track, else the best online match.
 */
export function useTracks(o: { vref: RefObject<HTMLVideoElement | null>; item: Item; S: Src; E: Play; picked: Picked; setPicked: (p: Picked) => void; resume: MutableRefObject<number>; onAuto: (label: string) => void }) {
  const { vref, item, S, E, picked, setPicked, resume } = o
  const { lang: ui } = useLang()
  const srvAudio = S.mediaServer && S.tracks.audio.length > 0
  const srvSubs = S.mediaServer && S.tracks.subs.length > 0
  const native = useNativeSubs(vref, !srvSubs && !E.hls.current, item.id)
  const [ext, setExtState] = useState<Ext | null>(null)
  const extNow = ext?.id === item.id ? ext : null
  const [off, setOff] = useState({ id: "", sec: 0 }) // subtitle delay, per title
  const [sel, setSel] = useState({ id: "", audio: -1, sub: -1 }) // hls / native picks, per title (-1 audio = the stream's default)
  const mine = sel.id === item.id ? sel : { id: item.id, audio: -1, sub: -1 }

  /** A media-server pick. Audio / an image subtitle is a new stream: resume where this one is and end its transcode; a text subtitle leaves the stream alone. */
  const apply = (p: Picked) => {
    const plain = (x?: number) => x === undefined || x < 0 || !!S.tracks.subs.find((y) => y.id === x)?.text
    const same = (p.audio === undefined || p.audio === picked.audio) && plain(p.sub) && plain(picked.sub)
    if (!same) {
      const v = vref.current
      if (v && v.currentTime > 0) resume.current = v.currentTime
      if (S.plex) plexStopTranscode(S.plex, item)
      if (S.jf) jellyfinStopTranscode(S.jf, item)
    }
    setPicked({ ...picked, ...p })
  }

  const audio: Track[] = srvAudio ? S.tracks.audio : E.audio
  const audioSel = srvAudio ? picked.audio ?? S.tracks.audio.find((x) => x.def)?.id ?? S.tracks.audio[0].id : E.hls.current ? Math.max(0, E.hls.current.audioTrack) : mine.audio
  const subs: Track[] = srvSubs ? S.tracks.subs : E.subs.length ? E.subs : native
  const subSel = extNow ? -2 : srvSubs ? picked.sub ?? -1 : mine.sub // -2: the online one is on

  const pickAudio = (id: number) => {
    if (srvAudio) { if (id !== audioSel) { apply({ audio: id }); setPrefs({ audioLang: S.tracks.audio.find((x) => x.id === id)?.lang ?? "" }) } return }
    if (E.hls.current) E.hls.current.audioTrack = id
    setSel({ ...mine, audio: id })
  }
  /** -1 = off. Clears an online subtitle. */
  const pickSub = (id: number) => {
    setExtState(null)
    if (srvSubs) { if (id !== picked.sub) { apply({ sub: id }); setPrefs({ subLang: id < 0 ? "off" : S.tracks.subs.find((x) => x.id === id)?.lang ?? "" }) } return }
    const h = E.hls.current
    if (h) { h.subtitleTrack = id; h.subtitleDisplay = id >= 0 }
    else Array.from(vref.current?.textTracks ?? []).forEach((x, i) => { if (x.id !== SIDECAR_ID) x.mode = i === id ? "showing" : "disabled" })
    setSel({ ...mine, sub: id })
  }
  /** A subtitle found online replaces whatever was on (a burned-in pick restarts the stream without it). */
  const pickExt = (vtt: string, label: string) => {
    if (srvSubs) { if (picked.sub !== undefined && picked.sub >= 0) apply({ sub: -1 }) }
    else if (E.hls.current) { E.hls.current.subtitleTrack = -1; E.hls.current.subtitleDisplay = false }
    else Array.from(vref.current?.textTracks ?? []).forEach((x) => { if (x.id !== SIDECAR_ID) x.mode = "disabled" })
    setSel({ ...mine, sub: -1 })
    setExtState({ id: item.id, label, vtt })
  }

  /* the remembered languages, once per title when its server track lists arrive (the default audio stays unless a matching track exists) */
  const autoLang = useRef("")
  useEffect(() => {
    const { audio: a, subs: s } = S.tracks
    if ((!a.length && !s.length) || autoLang.current === item.id) return
    autoLang.current = item.id
    const p = prefs(), next: Picked = {}
    const au = p.audioLang ? a.find((x) => x.lang === p.audioLang) : undefined
    if (au && au.id !== (a.find((x) => x.def) ?? a[0]).id) next.audio = au.id
    const su = p.subLang && p.subLang !== "off" ? s.find((x) => x.lang === p.subLang) : undefined
    if (su) next.sub = su.id
    if (next.audio !== undefined || next.sub !== undefined) apply(next)
  }, [S.tracks, item.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /* "Load my language automatically": once per title, after the remembered pick had its turn. Refs: the async part must see the latest state. */
  const cfg = useApp((s) => s.settings.subs)
  const autoSub = useRef("")
  const latest = useRef({ id: item.id, picked, ext: extNow, apply, pickExt, pickSub })
  latest.current = { id: item.id, picked, ext: extNow, apply, pickExt, pickSub }
  useEffect(() => {
    const want = cfg?.auto && !S.live ? (cfg.langs?.length ? cfg.langs : DEFAULT_SUB_LANGS)[0] : undefined
    if (!want || autoSub.current === item.id || prefs().subLang === "off") return
    if (S.mediaServer ? !S.tracksReady : !E.started) return
    autoSub.current = item.id
    const id = item.id, L = latest
    const free = () => L.current.id === id && !L.current.ext && !(L.current.picked.sub !== undefined && L.current.picked.sub >= 0)
    const t0 = window.setTimeout(() => {
      const v = vref.current, h = E.hls.current
      if (!free() || !v || (!S.mediaServer && Array.from(v.textTracks).some((x) => x.id !== SIDECAR_ID && x.mode !== "disabled"))) return // something is already on
      const own = S.mediaServer ? S.tracks.subs.find((x) => sameLang(want, x.lang)) : undefined
      if (own) return L.current.apply({ sub: own.id })
      const i = h ? h.subtitleTracks.findIndex((x) => sameLang(want, x.lang)) : Array.from(v.textTracks).findIndex((x) => sameLang(want, x.language))
      if (i >= 0) return L.current.pickSub(i)
      void (async () => {
        const q = await subQuery(item, useCatalog.getState().byId)
        const { hits } = await searchSubs(q, want)
        const rank = (x: (typeof hits)[number]) => (x.provider === "subdl" ? 0 : 2) + (x.hi ? 1 : 0) // SubDL first: OpenSubtitles allows ~5 downloads a day
        const best = hits.slice().sort((a, b) => rank(a) - rank(b))[0]
        if (!best || !free()) return
        const vtt = await downloadSub(best, q)
        if (!free()) return
        const name = langName(best.lang || want, ui)
        L.current.pickExt(vtt, `${name} · ${best.name}`)
        o.onAuto(name)
      })().catch(() => {}) // quiet: the user can still search by hand
    }, 100)
    return () => clearTimeout(t0)
  }, [item.id, S.tracksReady, E.started, cfg?.auto]) // eslint-disable-line react-hooks/exhaustive-deps

  const offset = off.id === item.id ? off.sec : 0
  return {
    audio, audioSel, pickAudio, subs, subSel, pickSub, ext: extNow, pickExt,
    /** WebVTT the sidecar shows: the online pick, else the server's text subtitle */
    sidecar: extNow?.vtt ?? S.sidecar,
    /** null: this subtitle can't be shifted (burned in, or a track of the stream) */
    offset: extNow || S.sidecar !== null ? offset : null,
    stepOffset: (d: number) => setOff({ id: item.id, sec: Math.round((offset + d * 0.5) * 10) / 10 }),
  }
}
