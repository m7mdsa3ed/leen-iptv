import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { isTv, useTouch } from "@/lib/device"
import { navState, useRoute } from "@/lib/nav"
import { useApp } from "@/lib/store"
import { srcOfId } from "@/lib/merge-pure"
import type { Item } from "@/lib/types"
import { STREAM_QS, type StreamQ } from "@/lib/quality"
import { plexStopTranscode } from "@/lib/plex"
import { jellyfinStopTranscode } from "@/lib/jellyfin"
import { fmt, useLang, useT } from "@/lib/i18n"
import { openTrailer } from "@/components/TrailerModal"
import { Controls } from "@/player/controls"
import { ErrorScreen } from "@/player/error-screen"
import { Flash, NumberEntry, Spinner, useFlash } from "@/player/indicators"
import { KeysHelp } from "@/player/keys-help"
import { PlayerMenu, type MenuKind } from "@/player/menus"
import { NextCard } from "@/player/next-card"
import { SkipButton } from "@/player/skip-button"
import { useSegments } from "@/player/use-segments"
import { MorePanel } from "@/player/more/panel"
import { useGuard } from "@/player/more/hooks"
import { ChannelStrip } from "@/player/overlays/channel-strip"
import type { MoreActions } from "@/player/more/actions"
import { FITS, prefs, setPrefs, SUB_SIZES } from "@/player/prefs"
import { TopBar } from "@/player/top-bar"
import { useEngine } from "@/player/use-engine"
import { useKeys } from "@/player/use-keys"
import { useNextUp } from "@/player/use-next-up"
import { useSidecar } from "@/player/use-sidecar"
import { useStream, type Picked } from "@/player/use-stream"
import { useTracking } from "@/player/use-tracking"
import { Subtitles } from "@/player/subtitles"
import { langName } from "@/player/menus"
import { useCatalog } from "@/lib/catalog"
import { downloadSub, searchSubs, subQuery } from "@/lib/subs"
import { DEFAULT_SUB_LANGS, sameLang } from "@/lib/subs-pure"
import { BANNER_MS, fsEl, HIDE_MS, isEpisode } from "@/player/util"
import { closePlayer, usePlayerHost } from "@/player/host"
import { Pause as PauseIcon, PictureInPicture2, Play as PlayIcon, X } from "lucide-react"
import "./player.css"

const NONE: string[] = []
type MoreState = "closed" | "open" | "closing"
type Overlay = "none" | "strip" // live only: bottom channel strip

// ponytail: module-level so the picked quality carries to the next episode; resets to Original on reload
let lastQ: StreamQ = STREAM_QS[0]

/** `mini` = shrunk to the corner while another page is on top (see player/host.tsx): video only, no keys, tap to expand.
 *  `start` = play the first title from the beginning (ignores its resume point). */
export default function Player({ queue: q0, index, start, mini = false }: { queue: Item[]; index: number; start?: boolean; mini?: boolean }) {
  const t = useT()
  const touch = useTouch()
  const back = useRoute((s) => s.back)
  const toggleFav = useApp((s) => s.toggleFav)
  const favs = useApp((s) => (s.profileId && s.data[s.profileId]?.favs) || NONE)
  const vref = useRef<HTMLVideoElement>(null)
  const root = useRef<HTMLDivElement>(null)
  // queue + position are local state: the More panel can switch to another title / channel list without leaving the route
  const [queue, setQueue] = useState(q0)
  const [idx, setIdx] = useState(index)
  const qref = useRef(queue)
  qref.current = queue
  const item = queue[idx]
  // live with Group channel variants on: the channel's primary carries the other variants in `alts`
  const vp = useCatalog((s) => (item.kind === "live" ? s.primaryOf.get(item.id) ?? s.byId.get(item.id) : undefined))
  const sources = useApp((s) => s.sources)
  const variants = vp?.alts?.length ? [vp, ...vp.alts].map((v) => ({ item: v, src: sources.length > 1 ? sources.find((x) => x.id === srcOfId(v.id))?.name : undefined })) : []
  const [show, setShow] = useState(true)
  const [banner, setBanner] = useState(true)
  const [menu, setMenu] = useState<MenuKind | null>(null)
  const [help, setHelp] = useState(false)
  const [more, setMoreState] = useState<MoreState>("closed")
  const moreRef = useRef<MoreState>("closed")
  const setMore = (m: MoreState) => { moreRef.current = m; setMoreState(m) }
  const [sq, setSq] = useState<StreamQ>(lastQ) // media-server quality, kept for the next item this session
  const [ov, setOvState] = useState<Overlay>("none")
  const ovRef = useRef<Overlay>("none")
  const setOv = (o: Overlay) => { ovRef.current = o; setOvState(o) }
  const guard = useGuard()
  const [fit, setFit] = useState(() => prefs().fit)
  const [speed, setSpeed] = useState(() => prefs().speed)
  const [audioSel, setAudioSel] = useState(0)
  const [subSel, setSubSel] = useState(-1)
  const [picked, setPicked] = useState<Picked & { id: string }>({ id: "" }) // media-server track picks, tagged with their item
  const tr: Picked = picked.id === item.id ? picked : {}
  const [ext, setExt] = useState<{ id: string; label: string; vtt: string } | null>(null) // subtitle fetched online (any source), per title
  const extNow = ext?.id === item.id ? ext : null
  const [subSize, setSubSize] = useState(() => prefs().subSize)
  const [off, setOff] = useState({ id: "", sec: 0 }) // subtitle delay is per title, so it resets on the next one
  const subOffset = off.id === item.id ? off.sec : 0
  const [num, setNum] = useState("")
  const [vol, setVol] = useState(() => prefs().vol)
  const [muted, setMuted] = useState(() => prefs().muted)
  const [fs, setFs] = useState(false)
  const [pip, setPip] = useState(false)
  const [sleepMin, setSleepMin] = useState(0) // 0 = off, else the chosen preset in minutes
  const [sleepAt, setSleepAt] = useState<number | null>(null) // wall-clock time the timer fires
  const [flash, fire] = useFlash()
  const hideT = useRef(0)
  const bannerT = useRef(0)
  const numT = useRef(0)
  const numRef = useRef("")
  const resume = useRef(0)
  const ptr = useRef("mouse")
  const tap = useRef({ t: 0, w: 0 })
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const opener = useRef<HTMLElement | null>(null) // control that opened a menu: focus returns to it
  const returnMore = useRef(false) // focus returns to the More button after the panel closes
  const seekFirst = useRef(false) // the controls came up from a seek key: focus the seek bar instead of Play

  const S = useStream(item, sq, tr)
  const { live } = S
  useSidecar(vref, extNow?.vtt ?? S.sidecar, subOffset)
  const E = useEngine({ vref, item, live, raw: S.raw, url: S.url, direct: S.direct, setProxied: S.setProxied, src: S.src, fallback: S.fallback && (() => { const v = vref.current; if (v && v.currentTime > 0) resume.current = v.currentTime; S.fallback!() }) })
  const startId = useRef(start ? item.id : "")
  useTracking({ vref, item, live, src: S.src, plex: S.plex, jf: S.jf, resume, meas: E.meas, statsRef: E.statsRef, startId })
  const hasNext = !live && isEpisode(item.id) && idx < queue.length - 1
  const showNext = useApp((s) => s.settings.nextBanner ?? true), autoAll = useApp((s) => s.settings.autoNext ?? true)
  const noAuto = useApp((s) => s.settings.noAutoShows) ?? [], showKey = item.series ?? item.group
  const autoNext = autoAll && !noAuto.includes(showKey) // per-show off switch (Next card)
  const toggleShowAuto = () => useApp.getState().setSettings({ noAutoShows: noAuto.includes(showKey) ? noAuto.filter((k) => k !== showKey) : [...noAuto, showKey] })

  /* ---------- controls visibility ---------- */
  // the countdown never hides while paused, while a menu / help sheet is open, or under a mouse resting on the controls; it restarts when that ends
  const hold = useRef(false), hover = useRef(false)
  hold.current = E.paused || !!menu || help
  const idle = useCallback(() => {
    if (hold.current || hover.current || moreRef.current === "open" || ovRef.current !== "none") return
    setShow(false)
    const a = document.activeElement as HTMLElement | null
    if (!a?.closest("[data-next],[data-modal]")) a?.blur() // not the Next card, nor a menu / the error screen (their buttons keep the D-pad)
  }, [])
  const poke = useCallback(() => {
    if (moreRef.current === "open" || ovRef.current !== "none") return // the panel / overlays hold the UI: no auto-hide, no controls behind them
    setShow(true)
    clearTimeout(hideT.current)
    hideT.current = window.setTimeout(idle, HIDE_MS)
  }, [idle])
  useEffect(() => { if (show && !hold.current) poke() }, [E.paused, menu, help]) // eslint-disable-line react-hooks/exhaustive-deps -- also runs on mount, so the controls up at start hide on TV too
  const hide = () => { setShow(false); (document.activeElement as HTMLElement)?.blur() }
  const showBanner = useCallback(() => { setBanner(true); clearTimeout(bannerT.current); bannerT.current = window.setTimeout(() => setBanner(false), BANNER_MS) }, [])
  useEffect(() => { showBanner() }, [item.id, showBanner])

  /* ---------- transport ---------- */
  // zapping into another category honours its PIN lock like the strip and the More panel do (inside one category the lock was already passed)
  const idxRef = useRef(idx), guardRef = useRef(guard)
  idxRef.current = idx
  guardRef.current = guard
  const zapTo = useCallback((j: number) => {
    const q = qref.current, to = q[j]
    if (!to) return
    const go = () => { setIdx(j); showBanner() }
    if (to.group !== q[idxRef.current]?.group) guardRef.current(to, go)
    else go()
  }, [showBanner])
  const zap = useCallback((d: number) => { const n = qref.current.length; zapTo((idxRef.current + d + n) % n) }, [zapTo])
  const advance = () => { setIdx((i) => Math.min(i + 1, qref.current.length - 1)); showBanner() }
  const nu = useNextUp({ vref, enabled: hasNext && showNext, itemId: item.id, onNext: advance, auto: autoNext })
  const nextOn = hasNext && nu.show
  const sg = useSegments({ vref, item, live, plex: S.plex, jf: S.jf })
  const skipOn = !!sg.seg && !nextOn // credits give way to the Next card
  const nextItem = queue[idx + 1]
  const next_ = () => (live ? zap(1) : idx < queue.length - 1 && setIdx(idx + 1))
  const prev_ = () => (live ? zap(-1) : idx > 0 && setIdx(idx - 1))
  const seek = (d: number) => {
    if (!show) seekFirst.current = true // Left/Right with the controls hidden: they come up with the seek bar focused, so a held key keeps scrubbing
    const v = vref.current!
    v.currentTime = Math.min(Math.max(0, v.currentTime + d), v.duration || 1e9)
    fire(d < 0 ? "back" : "fwd", `${d < 0 ? "-" : "+"}${fmt.digits(Math.abs(d))}`)
  }
  const seekFrac = (f: number) => { const v = vref.current!; if (v.duration > 0) v.currentTime = f * v.duration; poke() }
  const play = () => { void vref.current!.play().catch(() => {}); fire("play") }
  const pause = () => { vref.current!.pause(); fire("pause") }
  const toggle = () => (vref.current!.paused ? play() : pause())
  const setVolume = (x: number, flashIt = true) => {
    const v = vref.current!
    v.volume = x; v.muted = x === 0
    if (flashIt) fire(x === 0 ? "mute" : "vol", x === 0 ? "" : `${fmt.digits(Math.round(x * 100))}%`)
  }
  const bumpVolume = (d: number) => setVolume(Math.min(1, Math.max(0, vref.current!.volume + d)))
  const toggleMute = () => {
    const v = vref.current!
    if (v.muted || v.volume === 0) { v.muted = false; if (v.volume === 0) v.volume = 0.5 } else v.muted = true
    fire(v.muted ? "mute" : "vol", v.muted ? "" : `${fmt.digits(Math.round(v.volume * 100))}%`)
  }
  // the request is a promise that rejects silently: try the player, then the whole page, then the <video>'s own fullscreen, and say why it failed
  const toggleFs = () => {
    type Fs = { requestFullscreen?: () => Promise<void> | void; webkitRequestFullscreen?: () => void; webkitEnterFullscreen?: () => void }
    const d = document as unknown as Record<string, (() => Promise<void> | void) | undefined>
    if (fsEl()) return void Promise.resolve((d.exitFullscreen || d.webkitExitFullscreen)?.call(document)).catch(() => {})
    const req = (el: Element | null) => {
      const e = el as unknown as Fs | null
      const f = e?.requestFullscreen || e?.webkitRequestFullscreen
      return f ? Promise.resolve(f.call(e)) : Promise.reject(new Error("unsupported"))
    }
    req(root.current).catch(() => req(document.documentElement)).catch((err) => {
      const v = vref.current as unknown as Fs | null
      if (v?.webkitEnterFullscreen) v.webkitEnterFullscreen()
      else console.warn("[player] fullscreen refused:", err)
    })
  }
  const digit = (d: number) => {
    numRef.current = (numRef.current + d).slice(-4)
    setNum(numRef.current)
    clearTimeout(numT.current)
    numT.current = window.setTimeout(() => {
      const n = numRef.current, q = qref.current
      numRef.current = ""; setNum("")
      const k = q.findIndex((x) => x.num === +n)
      const j = k >= 0 ? k : +n - 1
      if (j >= 0 && j < q.length) zapTo(j)
    }, 1500)
  }

  /* ---------- menus ---------- */
  const srvAudio = S.mediaServer && S.tracks.audio.length > 0
  const srvSubs = S.mediaServer && S.tracks.subs.length > 0
  // which sheet each sheet was opened from (Settings > Speed): Back on the remote and the sheet's back arrow return there; a sheet opened from a control just closes
  const menuFrom = useRef<Partial<Record<MenuKind, MenuKind>>>({})
  const menuBack = () => { const up = menu ? menuFrom.current[menu] : undefined; return up ? () => openMenu(up, true) : undefined }
  const openMenu = (m: MenuKind, up?: boolean) => {
    if (!up) { if (menu) menuFrom.current[m] = menu; else delete menuFrom.current[m] }
    const v = vref.current!, h = E.hls.current
    const a = document.activeElement as HTMLElement | null
    if (a?.closest("[data-controls]")) opener.current = a // a sheet opened from another sheet (Settings > Speed) keeps the original control
    if (m === "audio" || m === "av") setAudioSel(srvAudio ? tr.audio ?? S.tracks.audio.find((x) => x.def)?.id ?? S.tracks.audio[0].id : Math.max(0, h?.audioTrack ?? 0))
    if ((m === "subs" || m === "av") && srvSubs) setSubSel(tr.sub ?? -1)
    else if (m === "subs" || m === "av") {
      if (!h) E.setSubs(Array.from(v.textTracks).map((x, i) => ({ id: i, label: x.label || x.language || t("player.subtitleTrack", { n: i + 1 }) })))
      setSubSel(h ? (h.subtitleDisplay ? h.subtitleTrack : -1) : Array.from(v.textTracks).findIndex((x) => x.mode === "showing"))
    }
    setMenu(m)
    poke()
  }
  // media server: a new audio pick / burned-in subtitle is a new stream URL and resumes where this one is (same path as a quality change);
  // a text subtitle (Jellyfin WebVTT) leaves the stream alone
  const apply = (p: Picked) => {
    const plain = (x?: number) => x === undefined || x < 0 || !!S.tracks.subs.find((y) => y.id === x)?.text
    if (!((p.audio === undefined || p.audio === tr.audio) && plain(p.sub) && plain(tr.sub))) {
      const v = vref.current
      if (v && v.currentTime > 0) resume.current = v.currentTime
      if (S.plex) plexStopTranscode(S.plex, item)
      if (S.jf) jellyfinStopTranscode(S.jf, item)
    }
    setPicked({ ...tr, ...p, id: item.id })
  }
  // apply the remembered language once per title, when its track lists arrive (default audio stays unless a matching track exists)
  const autoFor = useRef("")
  useEffect(() => {
    const { audio, subs } = S.tracks
    if ((!audio.length && !subs.length) || autoFor.current === item.id) return
    autoFor.current = item.id
    const p = prefs(), next: Picked = {}
    const a = p.audioLang ? audio.find((x) => x.lang === p.audioLang) : undefined
    if (a && a.id !== (audio.find((x) => x.def) ?? audio[0]).id) next.audio = a.id
    const s = p.subLang && p.subLang !== "off" ? subs.find((x) => x.lang === p.subLang) : undefined
    if (s) next.sub = s.id
    if (next.audio !== undefined || next.sub !== undefined) apply(next)
  }, [S.tracks, item.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // Settings > Subtitles > "Load my language automatically": once per title, after the remembered-language pick above had its turn.
  // The title's own track in the first language, else the best online match (non-HI first). Refs: the async part must see the latest state.
  const subsCfg = useApp((s) => s.settings.subs)
  const autoSub = useRef("")
  const { lang: uiLang } = useLang()
  const latest = useRef<{ id: string; tr: Picked; ext: typeof extNow; apply: typeof apply; pickExt: (vtt: string, label: string) => void }>({ id: item.id, tr, ext: extNow, apply, pickExt: () => {} })
  useEffect(() => {
    const want = subsCfg?.auto && !live ? (subsCfg.langs?.length ? subsCfg.langs : DEFAULT_SUB_LANGS)[0] : undefined
    if (!want || autoSub.current === item.id || prefs().subLang === "off") return
    if (S.mediaServer ? !S.tracksReady : !E.started) return
    autoSub.current = item.id
    const id = item.id, L = latest
    const on = () => L.current.id === id && !L.current.ext && !(L.current.tr.sub !== undefined && L.current.tr.sub >= 0)
    const t0 = window.setTimeout(() => {
      const v = vref.current, h = E.hls.current
      if (!on() || !v || (!S.mediaServer && Array.from(v.textTracks).some((x) => x.mode !== "disabled"))) return // something is already on
      const own = S.mediaServer ? S.tracks.subs.find((x) => sameLang(want, x.lang)) : undefined
      if (own) { L.current.apply({ sub: own.id }); setSubSel(own.id); return }
      const hi = h ? h.subtitleTracks.findIndex((x) => sameLang(want, x.lang)) : Array.from(v.textTracks).findIndex((x) => sameLang(want, x.language))
      if (hi >= 0) { if (h) { h.subtitleTrack = hi; h.subtitleDisplay = true } else v.textTracks[hi].mode = "showing"; return }
      void (async () => {
        const q = await subQuery(item, useCatalog.getState().byId)
        const { hits } = await searchSubs(q, want)
        const rank = (x: (typeof hits)[number]) => (x.provider === "subdl" ? 0 : 2) + (x.hi ? 1 : 0) // SubDL first: OpenSubtitles allows ~5 downloads a day
        const best = hits.slice().sort((a, b) => rank(a) - rank(b))[0]
        if (!best || !on()) return
        const vtt = await downloadSub(best, q)
        if (on()) { L.current.pickExt(vtt, `${langName(best.lang || want, uiLang)} · ${best.name}`); fire("sub", langName(best.lang || want, uiLang)) }
      })().catch(() => {}) // quiet: the user can still search by hand
    }, 100) // after the remembered-language pick has landed
    return () => clearTimeout(t0)
  }, [item.id, S.tracksReady, E.started, subsCfg?.auto]) // eslint-disable-line react-hooks/exhaustive-deps
  const pickSub = (i: number) => {
    setExt(null)
    if (srvSubs) {
      if (i !== subSel) { apply({ sub: i }); setPrefs({ subLang: i < 0 ? "off" : S.tracks.subs.find((x) => x.id === i)?.lang ?? "" }) }
      setSubSel(i); setMenu(null); return
    }
    const h = E.hls.current
    if (h) { h.subtitleTrack = i; h.subtitleDisplay = i >= 0 }
    else Array.from(vref.current!.textTracks).forEach((x, j) => (x.mode = j === i ? "showing" : "disabled"))
    setSubSel(i); setMenu(null)
  }
  // a subtitle fetched online replaces whatever subtitle was on (a burned-in pick restarts the stream without it)
  const pickExt = (vtt: string, label: string) => {
    if (srvSubs) { if (tr.sub !== undefined && tr.sub >= 0) apply({ sub: -1 }) }
    else if (E.hls.current) { E.hls.current.subtitleTrack = -1; E.hls.current.subtitleDisplay = false }
    else Array.from(vref.current!.textTracks).forEach((x) => (x.mode = "disabled"))
    setSubSel(-1); setExt({ id: item.id, label, vtt }); setMenu(null)
  }
  latest.current = { id: item.id, tr, ext: extNow, apply, pickExt: (vtt, label) => { const m = menu; pickExt(vtt, label); setMenu(m) } } // auto pick keeps an open sheet open
  const pickAudio = (i: number) => {
    if (srvAudio) {
      if (i !== audioSel) { apply({ audio: i }); setPrefs({ audioLang: S.tracks.audio.find((x) => x.id === i)?.lang ?? "" }) }
      setAudioSel(i); setMenu(null); return
    }
    if (E.hls.current) E.hls.current.audioTrack = i; setAudioSel(i); setMenu(null)
  }
  const pickQ = (q: StreamQ) => {
    setMenu(null)
    if (q.id === sq.id) return
    const v = vref.current
    if (v && v.currentTime > 0) resume.current = v.currentTime // the new stream resumes where this one is
    if (S.plex) plexStopTranscode(S.plex, item)
    if (S.jf) jellyfinStopTranscode(S.jf, item)
    setSq((lastQ = q))
  }
  const stepSubSize = (d: number) => {
    const n = SUB_SIZES[Math.min(SUB_SIZES.length - 1, Math.max(0, SUB_SIZES.indexOf(subSize as (typeof SUB_SIZES)[number]) + d))]
    setSubSize(n); setPrefs({ subSize: n })
  }
  const stepSubOffset = (d: number) => setOff({ id: item.id, sec: Math.round((subOffset + d * 0.5) * 10) / 10 })
  const pickSpeed = (n: number) => {
    const v = vref.current!
    v.defaultPlaybackRate = n; v.playbackRate = n
    setSpeed(n); setPrefs({ speed: n }); setMenu(null)
  }
  const pickFit = (i: number) => { setFit(i); setPrefs({ fit: i }); setMenu(null) }
  const cycleFit = () => pickFit((fit + 1) % FITS.length)
  const setSleep = (n: number) => {
    setMenu(null)
    setSleepMin(n)
    setSleepAt(n ? Date.now() + n * 60000 : null)
    fire("clock", n ? t("player.sleep.min", { n }) : t("player.off"))
  }
  // one timeout for the whole remaining time: when it fires, stop playback and leave the player
  useEffect(() => {
    if (!sleepAt) return
    const id = window.setTimeout(() => {
      vref.current?.pause()
      setSleepMin(0); setSleepAt(null)
      stopRef.current() // the latest stop(): the player may be the mini one by now, and a stale one would pop an unrelated page
    }, Math.max(0, sleepAt - Date.now()))
    return () => clearTimeout(id)
  }, [sleepAt]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- More panel ---------- */
  const openMore = () => {
    if (moreRef.current !== "closed" || E.err) return
    setMore("open"); setMenu(null); setHelp(false); setShow(false)
    clearTimeout(hideT.current)
  }
  const closeMore = () => {
    if (moreRef.current !== "open") return
    setMore("closing")
    returnMore.current = true
    poke()
  }
  const finishMore = () => { if (moreRef.current === "closing") setMore("closed") }
  const playItem = (i: Item, q?: Item[], keepOpen?: boolean) => {
    const cur = qref.current
    const k = cur.findIndex((x) => x.id === i.id)
    if (k >= 0) setIdx(k)
    else {
      const nq = q && q.some((x) => x.id === i.id) ? q : [i]
      const j = nq.findIndex((x) => x.id === i.id)
      setQueue(nq); setIdx(j)
      useRoute.getState().replace("player", { queue: nq, index: j }) // keeps the URL (refresh) on the new title
    }
    showBanner()
    if (!keepOpen) closeMore()
  }
  // replace the route: the next page takes over and the player keeps running in the mini player (player/host.tsx)
  const details = (id: string) => useRoute.getState().replace("detail", { id })
  const person = (c: { id?: string; name: string }) => useRoute.getState().replace("person", { id: c.id, name: c.name })
  const trailer = (x: { key: string; name: string }) => { vref.current?.pause(); openTrailer(x) }
  const impl = useRef<MoreActions>(null as unknown as MoreActions)
  impl.current = { close: closeMore, closed: finishMore, play: playItem, details, person, trailer }
  const act = useMemo<MoreActions>(() => ({
    close: () => impl.current.close(), closed: () => impl.current.closed(),
    play: (i, q, k) => impl.current.play(i, q, k), details: (id) => impl.current.details(id),
    person: (c) => impl.current.person(c), trailer: (x) => impl.current.trailer(x),
  }), [])

  /* ---------- live overlays: guide + channel strip ---------- */
  const openOverlay = (o: "strip") => {
    if (!live || E.err || moreRef.current !== "closed") return
    if (ovRef.current === o) return
    setMenu(null); setHelp(false); setShow(false)
    clearTimeout(hideT.current)
    setOv(o)
  }
  const closeOverlay = () => {
    if (ovRef.current === "none") return
    setOv("none")
    ;(document.activeElement as HTMLElement | null)?.blur()
    if (!isTv) poke() // desktop / touch: the controls come back; TV: clean video (banner shows after a tune)
  }
  // tuning goes through the same path as the More panel (setIdx / queue replacement: debounced engine teardown, history, route params)
  const tuneImpl = useRef<(c: Item, list: Item[]) => void>(() => {})
  tuneImpl.current = (c, list) => {
    if (c.id === item.id) return closeOverlay()
    guard(c, () => { playItem(c, list, true); closeOverlay() })
  }
  const tune = useCallback((c: Item, list: Item[]) => tuneImpl.current(c, list), [])
  const closeImpl = useRef(closeOverlay)
  closeImpl.current = closeOverlay
  const closeOv = useCallback(() => closeImpl.current(), [])
  useEffect(() => { if (E.err) closeImpl.current() }, [E.err])

  /* ---------- nav lock + focus ---------- */
  navState.lock = !mini && !show && !menu && !E.err && more === "closed" && !nextOn && ov === "none"
  useEffect(() => () => { navState.lock = false }, [])
  // focus enters the menu / error buttons (both are [data-modal], so the D-pad stays inside them); the last modal in the DOM is the top one
  useEffect(() => {
    if (mini || (!menu && !E.err)) return
    requestAnimationFrame(() => {
      const all = root.current?.querySelectorAll<HTMLElement>("[data-modal]")
      const m = all?.[all.length - 1]
      ;(m?.querySelector<HTMLElement>("[data-autofocus]") ?? m?.querySelector<HTMLElement>("[data-nav]"))?.focus()
    })
  }, [menu, E.err, mini])
  // controls up: focus goes back to what opened the menu / the More button, else Play
  useEffect(() => {
    if (mini || !show || menu || E.err || more !== "closed" || ov !== "none" || nextOn) return // the Next card keeps the focus it took
    requestAnimationFrame(() => {
      const q = (s: string) => root.current?.querySelector<HTMLElement>(s)
      const el = returnMore.current ? q("[data-more]") : opener.current?.isConnected ? opener.current : (seekFirst.current && q("[data-seek]")) || q("[data-play]")
      returnMore.current = false; opener.current = null; seekFirst.current = false
      el?.focus()
    })
  }, [show, menu, E.err, more, ov, mini, nextOn])

  /* ---------- desktop/mobile extras: fullscreen state, idle hide, wake lock ---------- */
  useEffect(() => {
    const f = () => setFs(!!fsEl())
    document.addEventListener("fullscreenchange", f); document.addEventListener("webkitfullscreenchange", f)
    if (!isTv) poke()
    return () => {
      document.removeEventListener("fullscreenchange", f); document.removeEventListener("webkitfullscreenchange", f)
      clearTimeout(tap.current.w); clearTimeout(hideT.current); clearTimeout(bannerT.current); clearTimeout(numT.current)
    }
  }, [poke])
  useEffect(() => () => { if (fsEl() === document.documentElement) void document.exitFullscreen?.().catch(() => {}) }, []) // page-level fallback: leave it with the player
  useEffect(() => {
    if (isTv || E.paused || E.err) return
    let l: WakeLockSentinel | null = null
    const get = () => { if (document.visibilityState === "visible") navigator.wakeLock?.request("screen").then((x) => (l = x), () => {}) }
    get(); document.addEventListener("visibilitychange", get)
    return () => { document.removeEventListener("visibilitychange", get); void l?.release() }
  }, [E.paused, E.err])

  /* ---------- Picture-in-picture (desktop/Android Chrome; not on webOS) ---------- */
  const canPip = !isTv && typeof document !== "undefined" && document.pictureInPictureEnabled
  const togglePip = () => {
    const v = vref.current
    if (!v) return
    void (document.pictureInPictureElement ? document.exitPictureInPicture() : v.requestPictureInPicture()).catch(() => {})
  }
  useEffect(() => {
    const v = vref.current
    if (!v || !canPip) return
    const on = () => setPip(true), off = () => setPip(false)
    v.addEventListener("enterpictureinpicture", on)
    v.addEventListener("leavepictureinpicture", off)
    try { navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, togglePip) } catch { /* not supported */ }
    return () => {
      v.removeEventListener("enterpictureinpicture", on)
      v.removeEventListener("leavepictureinpicture", off)
      if (document.pictureInPictureElement === v) void document.exitPictureInPicture().catch(() => {})
      try { navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, null) } catch { /* ignore */ }
    }
  }, [canPip]) // eslint-disable-line react-hooks/exhaustive-deps

  /* remembered volume / mute (per device) applied once */
  useEffect(() => { const v = vref.current!, p = prefs(); v.volume = p.vol; v.muted = p.muted }, [])

  /* ---------- mini player (host) ---------- */
  const stop = () => { if (!mini) back(); closePlayer() } // for good: no mini player
  const stopRef = useRef(stop)
  stopRef.current = stop
  useEffect(() => { usePlayerHost.setState({ cur: { queue, index: idx } }) }, [queue, idx])
  useEffect(() => { usePlayerHost.setState({ canMini: E.started && !E.err }) }, [E.started, E.err])
  useEffect(() => { usePlayerHost.setState({ pip }) }, [pip]) // native PiP window open: the mini box hides
  useEffect(() => { if (mini && E.err) closePlayer() }, [mini, E.err]) // a dead stream does not linger in the corner
  const wasMini = useRef(mini)
  useEffect(() => {
    if (wasMini.current === mini) return
    wasMini.current = mini
    if (mini) {
      setMenu(null); setHelp(false); setShow(false); clearTimeout(hideT.current)
      if (moreRef.current !== "closed") setMore("closed")
      if (ovRef.current !== "none") setOv("none")
      if (fsEl()) void Promise.resolve((document.exitFullscreen || (document as unknown as { webkitExitFullscreen?: () => void }).webkitExitFullscreen)?.call(document)).catch(() => {})
    } else poke()
  }, [mini]) // eslint-disable-line react-hooks/exhaustive-deps
  const expand = () => useRoute.getState().go("player", { queue, index: idx })

  useKeys({
    off: mini, stop,
    live, show, menu, err: E.err, help, more, nextShow: nextOn, canPip, overlay: ov,
    back, hide, closeMenu: () => { const up = menuBack(); if (up) up(); else setMenu(null) }, closeHelp: () => setHelp(false), toggleHelp: () => setHelp((h) => !h),
    closeMore, openMore, cancelNext: nu.cancel, skipSeg: skipOn ? sg.skip : undefined, closeOverlay, openStrip: () => openOverlay("strip"),
    play, pause, toggle, seek, zap, toggleFav: () => toggleFav(item.id), openMenu, cycleFit, poke,
    toggleFs, togglePip, toggleMute, setVolume: bumpVolume, digit,
  })

  /* ---------- pointer / touch ---------- */
  const onVideoClick = (e: React.MouseEvent) => {
    if (isTv) return
    if (ptr.current === "mouse") return toggle()
    const tp = tap.current, now = Date.now(), x = e.clientX / window.innerWidth
    if (!live && now - tp.t < 300 && (x < 1 / 3 || x > 2 / 3)) { clearTimeout(tp.w); tp.t = 0; seek(x < 0.5 ? -10 : 10); return poke() }
    tp.t = now
    clearTimeout(tp.w)
    tp.w = window.setTimeout(() => (show ? (setShow(false), setMenu(null)) : poke()), live ? 0 : 300)
  }

  const isFav = favs.includes(item.id)

  return (
    <div
      ref={root}
      className={`dark pl-root ${mini ? "absolute" : "fixed"} inset-0 bg-black text-white${!mini && !show && more === "closed" && !isTv ? " cursor-none" : ""}`}
      onMouseMove={(e) => { if (mini) return; hover.current = !!(e.target as HTMLElement).closest(".pl-layer"); poke() }}
      onMouseLeave={() => { hover.current = false; if (ptr.current === "mouse") { clearTimeout(hideT.current); idle() } }} // mouse left the window: hide now
      // desktop: wheel down pulls the More panel up; touch: swipe up (not from the seek bar or inside the panel)
      onWheel={(e) => { if (!mini && moreRef.current === "closed" && ovRef.current === "none" && !menu && !help && !E.err && e.deltaY > 30) openMore() }}
      onTouchStart={(e) => { swipe.current = (e.target as HTMLElement).closest("[data-seek],[data-more-panel]") ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
      onTouchEnd={(e) => {
        const s = swipe.current
        swipe.current = null
        if (!s || mini || moreRef.current !== "closed" || ovRef.current !== "none" || menu || E.err) return
        const dy = e.changedTouches[0].clientY - s.y, dx = e.changedTouches[0].clientX - s.x
        if (dy < -70 && Math.abs(dx) < Math.abs(dy) * 0.6) openMore()
      }}
    >
      <video
        ref={vref}
        playsInline
        className="size-full"
        style={{ objectFit: FITS[fit] }}
        onPointerUp={(e) => (ptr.current = e.pointerType)}
        onClick={onVideoClick}
        onDoubleClick={() => !isTv && ptr.current === "mouse" && toggleFs()}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget
          if (resume.current) v.currentTime = resume.current
          v.defaultPlaybackRate = v.playbackRate = live ? 1 : speed
        }}
        onVolumeChange={(e) => { const v = e.currentTarget; setVol(v.volume); setMuted(v.muted); setPrefs({ vol: v.volume, muted: v.muted }) }}
        onEnded={() => {
          if (idx < queue.length - 1) { if (!hasNext || (autoNext && !nu.blocked.current)) advance(); else poke() } // Cancel on the next-episode card also stops the auto-advance
          else stop()
        }}
        {...E.handlers}
      />
      {mini ? (
        // mini player: the whole video expands it; play/pause + close in the corner
        <div className="absolute inset-0">
          <button data-nav aria-label={t("player.mini.expand")} onClick={expand} className="absolute inset-0 size-full rounded-[inherit]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6 text-sm" dir="auto">{item.name}</div>
          <div className="absolute inset-x-0 top-2 mx-auto flex w-fit gap-1.5">
            <button data-nav aria-label={E.paused ? t("player.play") : t("player.pause")} onClick={toggle} className="grid size-9 place-items-center rounded-full bg-black/60">{E.paused ? <PlayIcon className="size-4 fill-current" /> : <PauseIcon className="size-4 fill-current" />}</button>
            {canPip && <button data-nav aria-label={t("player.pip")} onClick={togglePip} className="grid size-9 place-items-center rounded-full bg-black/60"><PictureInPicture2 className="size-4" /></button>}
            <button data-nav aria-label={t("player.mini.close")} onClick={closePlayer} className="grid size-9 place-items-center rounded-full bg-black/60"><X className="size-5" /></button>
          </div>
          {E.buf && <div aria-hidden className="pointer-events-none absolute inset-0 m-auto size-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
        </div>
      ) : <>
      <Subtitles vref={vref} lift={show} />
      {E.buf && !E.err && <Spinner title={item.name} started={E.started} label={t("player.loading")} />}
      <Flash f={flash} />
      {num && <NumberEntry n={num} />}

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
        <TopBar item={item} on={(show || banner) && more !== "open" && ov === "none"} hints={isTv && live} showBack={show && !isTv} favBtn={touch && !isTv} isFav={isFav} onFav={() => toggleFav(item.id)} onBack={back} />
        <Controls
          on={show && more === "closed" && ov === "none"} live={live} tv={isTv} touch={touch && !isTv} vref={vref}
          paused={E.paused} queueLen={queue.length}
          sleepAt={sleepAt} fs={fs} vol={vol} muted={muted}
          onPrev={prev_} onNext={next_} onToggle={toggle} onSeek={(d) => { seek(d); poke() }} onSeekFrac={seekFrac}
          onMute={toggleMute} onVolume={(x) => setVolume(x, false)} onMenu={openMenu}
          onFs={toggleFs} onMore={openMore} onChannels={() => openOverlay("strip")}
        />
      </div>

      {skipOn && <SkipButton seg={sg.seg!} onSkip={sg.skip} />}
      {nextOn && nextItem && <NextCard item={nextItem} secs={nu.secs} auto={autoNext} autoAll={autoAll} showOff={!autoNext && autoAll} tv={isTv} onSkip={nu.skip} onCancel={nu.cancel} onToggleShow={toggleShowAuto} />}
      {more !== "closed" && <MorePanel item={item} closing={more === "closing"} act={act} />}
      {ov === "strip" && <ChannelStrip item={item} tune={tune} close={closeOv} />}
      {help && <KeysHelp live={live} onClose={() => setHelp(false)} />}
      {menu && (
        <PlayerMenu
          menu={menu} audio={srvAudio ? S.tracks.audio : E.audio} audioSel={audioSel} onAudio={pickAudio} subs={srvSubs ? S.tracks.subs : E.subs} subSel={subSel} onSub={pickSub}
          subSize={subSize} onSubSize={stepSubSize} subOffset={extNow || S.sidecar !== null ? subOffset : null} onSubOffset={stepSubOffset}
          item={item} ext={extNow?.label ?? null} onExt={pickExt}
          sq={sq} onQuality={pickQ} stats={E.stats} speed={speed} onSpeed={pickSpeed} fit={fit} onFit={pickFit} sleepMin={sleepMin} onSleep={setSleep}
          live={live} mediaServer={S.mediaServer} isFav={isFav} onFav={() => toggleFav(item.id)} variants={variants} onVariant={(v) => { setMenu(null); tune(v, queue.map((x, i) => (i === idx ? v : x))) }} canPip={canPip} pip={pip} onPip={togglePip} onMenu={openMenu} onBack={menuBack()} onClose={() => setMenu(null)}
        />
      )}
      {E.err && <ErrorScreen name={item.name} msg={E.err} canNext={queue.length > 1} onRetry={E.retry} onNext={() => zap(1)} onBack={back} />}
      </>}
    </div>
  )
}
