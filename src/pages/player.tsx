import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { nowNext, useCatalog } from "@/lib/catalog"
import { isTv, useTouch } from "@/lib/device"
import { navState, useRoute } from "@/lib/nav"
import { useApp } from "@/lib/store"
import type { Item } from "@/lib/types"
import { STREAM_QS, type StreamQ } from "@/lib/quality"
import { plexStopTranscode } from "@/lib/plex"
import { jellyfinStopTranscode } from "@/lib/jellyfin"
import { fmt, useT } from "@/lib/i18n"
import { openTrailer } from "@/components/TrailerModal"
import { Controls } from "@/player/controls"
import { ErrorScreen } from "@/player/error-screen"
import { Flash, NumberEntry, Spinner, useFlash } from "@/player/indicators"
import { KeysHelp } from "@/player/keys-help"
import { PlayerMenu, type MenuKind } from "@/player/menus"
import { NextCard } from "@/player/next-card"
import { MorePanel } from "@/player/more/panel"
import { useGuard } from "@/player/more/hooks"
import { ChannelStrip } from "@/player/overlays/channel-strip"
import { GuideOverlay } from "@/player/overlays/guide-overlay"
import type { MoreActions } from "@/player/more/actions"
import { FITS, prefs, setPrefs, SUB_SIZES } from "@/player/prefs"
import { TopBar } from "@/player/top-bar"
import { useEngine } from "@/player/use-engine"
import { useKeys } from "@/player/use-keys"
import { useNextUp } from "@/player/use-next-up"
import { useSidecar } from "@/player/use-sidecar"
import { useStream, type Picked } from "@/player/use-stream"
import { useTracking } from "@/player/use-tracking"
import { BANNER_MS, fsEl, HIDE_MS, isEpisode } from "@/player/util"
import "./player.css"

const NONE: string[] = []
type MoreState = "closed" | "open" | "closing"
type Overlay = "none" | "guide" | "strip" // live only: full-screen guide / bottom channel strip (one at a time)

// ponytail: module-level so the picked quality carries to the next episode; resets to Original on reload
let lastQ: StreamQ = STREAM_QS[0]

export default function Player({ queue: q0, index }: { queue: Item[]; index: number }) {
  const t = useT()
  const touch = useTouch()
  const back = useRoute((s) => s.back)
  const toggleFav = useApp((s) => s.toggleFav)
  const epg = useCatalog((s) => s.epg)
  const favs = useApp((s) => (s.profileId && s.data[s.profileId]?.favs) || NONE)
  const vref = useRef<HTMLVideoElement>(null)
  const root = useRef<HTMLDivElement>(null)
  // queue + position are local state: the More panel can switch to another title / channel list without leaving the route
  const [queue, setQueue] = useState(q0)
  const [idx, setIdx] = useState(index)
  const qref = useRef(queue)
  qref.current = queue
  const item = queue[idx]
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
  const [subSize, setSubSize] = useState(() => prefs().subSize)
  const [off, setOff] = useState({ id: "", sec: 0 }) // subtitle delay is per title, so it resets on the next one
  const subOffset = off.id === item.id ? off.sec : 0
  const [num, setNum] = useState("")
  const [vol, setVol] = useState(() => prefs().vol)
  const [muted, setMuted] = useState(() => prefs().muted)
  const [fs, setFs] = useState(false)
  const [pip, setPip] = useState(false)
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

  const S = useStream(item, sq, tr)
  const { live } = S
  useSidecar(vref, S.sidecar, subOffset)
  const E = useEngine({ vref, item, live, raw: S.raw, url: S.url, direct: S.direct, setProxied: S.setProxied })
  useTracking({ vref, item, live, src: S.src, plex: S.plex, jf: S.jf, resume, meas: E.meas, statsRef: E.statsRef })
  const hasNext = !live && isEpisode(item.id) && idx < queue.length - 1
  const showNext = useApp((s) => s.settings.nextBanner ?? true), autoNext = useApp((s) => s.settings.autoNext ?? true)

  /* ---------- controls visibility ---------- */
  const poke = useCallback(() => {
    if (moreRef.current === "open" || ovRef.current !== "none") return // the panel / overlays hold the UI: no auto-hide, no controls behind them
    setShow(true)
    clearTimeout(hideT.current)
    hideT.current = window.setTimeout(() => {
      if (moreRef.current === "open" || ovRef.current !== "none") return
      setShow(false); setMenu(null)
      const a = document.activeElement as HTMLElement | null
      if (!a?.closest("[data-next]")) a?.blur()
    }, HIDE_MS)
  }, [])
  const hide = () => { setShow(false); (document.activeElement as HTMLElement)?.blur() }
  const showBanner = useCallback(() => { setBanner(true); clearTimeout(bannerT.current); bannerT.current = window.setTimeout(() => setBanner(false), BANNER_MS) }, [])
  useEffect(() => { showBanner() }, [item.id, showBanner])

  /* ---------- transport ---------- */
  const zap = useCallback((d: number) => { setIdx((i) => (i + d + queue.length) % queue.length); showBanner() }, [queue.length, showBanner])
  const advance = () => { setIdx((i) => Math.min(i + 1, qref.current.length - 1)); showBanner() }
  const nu = useNextUp({ vref, enabled: hasNext && showNext, itemId: item.id, onNext: advance, auto: autoNext })
  const nextOn = hasNext && nu.show
  const nextItem = queue[idx + 1]
  const next_ = () => (live ? zap(1) : idx < queue.length - 1 && setIdx(idx + 1))
  const prev_ = () => (live ? zap(-1) : idx > 0 && setIdx(idx - 1))
  const seek = (d: number) => {
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
  const toggleFs = () => {
    const el = root.current as unknown as Record<string, (() => void) | undefined>, d = document as unknown as Record<string, (() => void) | undefined>
    if (fsEl()) (d.exitFullscreen || d.webkitExitFullscreen)?.call(document)
    else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(root.current)
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
      if (j >= 0 && j < q.length) { setIdx(j); showBanner() }
    }, 1500)
  }

  /* ---------- menus ---------- */
  const srvAudio = S.mediaServer && S.tracks.audio.length > 0
  const srvSubs = S.mediaServer && S.tracks.subs.length > 0
  const openMenu = (m: MenuKind) => {
    const v = vref.current!, h = E.hls.current
    const a = document.activeElement as HTMLElement | null
    opener.current = a?.closest("[data-controls]") ? a : null
    if (m === "audio") setAudioSel(srvAudio ? tr.audio ?? S.tracks.audio.find((x) => x.def)?.id ?? S.tracks.audio[0].id : Math.max(0, h?.audioTrack ?? 0))
    if (m === "subs" && srvSubs) setSubSel(tr.sub ?? -1)
    else if (m === "subs") {
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
  const pickSub = (i: number) => {
    if (srvSubs) {
      if (i !== subSel) { apply({ sub: i }); setPrefs({ subLang: i < 0 ? "off" : S.tracks.subs.find((x) => x.id === i)?.lang ?? "" }) }
      setSubSel(i); setMenu(null); return
    }
    const h = E.hls.current
    if (h) { h.subtitleTrack = i; h.subtitleDisplay = i >= 0 }
    else Array.from(vref.current!.textTracks).forEach((x, j) => (x.mode = j === i ? "showing" : "disabled"))
    setSubSel(i); setMenu(null)
  }
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
  // the player must not keep playing under the next page: replace the route (unmounts the player = strict teardown)
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
  const openOverlay = (o: "guide" | "strip") => {
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
  navState.lock = !show && !menu && !E.err && more === "closed" && !nextOn && ov === "none"
  useEffect(() => () => { navState.lock = false }, [])
  // focus enters the menu / error buttons (both are [data-modal], so the D-pad stays inside them); the last modal in the DOM is the top one
  useEffect(() => {
    if (!menu && !E.err) return
    requestAnimationFrame(() => {
      const all = root.current?.querySelectorAll<HTMLElement>("[data-modal]")
      const m = all?.[all.length - 1]
      ;(m?.querySelector<HTMLElement>("[data-autofocus]") ?? m?.querySelector<HTMLElement>("[data-nav]"))?.focus()
    })
  }, [menu, E.err])
  // controls up: focus goes back to what opened the menu / the More button, else Play
  useEffect(() => {
    if (!show || menu || E.err || more !== "closed" || ov !== "none") return
    requestAnimationFrame(() => {
      const q = (s: string) => root.current?.querySelector<HTMLElement>(s)
      const el = returnMore.current ? q("[data-more]") : opener.current?.isConnected ? opener.current : q("[data-play]")
      returnMore.current = false; opener.current = null
      el?.focus()
    })
  }, [show, menu, E.err, more, ov])

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

  useKeys({
    live, show, menu, err: E.err, help, more, nextShow: nextOn, canPip, overlay: ov,
    back, hide, closeMenu: () => setMenu(null), closeHelp: () => setHelp(false), toggleHelp: () => setHelp((h) => !h),
    closeMore, openMore, cancelNext: nu.cancel, closeOverlay, openGuide: () => openOverlay("guide"), openStrip: () => openOverlay("strip"),
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

  const { now, next } = live ? nowNext(epg, item.epgId) : ({} as ReturnType<typeof nowNext>)
  const isFav = favs.includes(item.id)

  return (
    <div
      ref={root}
      style={{ "--sub-size": subSize } as React.CSSProperties}
      className={`dark pl-root fixed inset-0 bg-black text-white${!show && more === "closed" && !isTv ? " cursor-none" : ""}`}
      onMouseMove={poke}
      // desktop: wheel down pulls the More panel up; touch: swipe up (not from the seek bar or inside the panel)
      onWheel={(e) => { if (moreRef.current === "closed" && ovRef.current === "none" && !menu && !help && !E.err && e.deltaY > 30) openMore() }}
      onTouchStart={(e) => { swipe.current = (e.target as HTMLElement).closest("[data-seek],[data-more-panel]") ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
      onTouchEnd={(e) => {
        const s = swipe.current
        swipe.current = null
        if (!s || moreRef.current !== "closed" || ovRef.current !== "none" || menu || E.err) return
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
          else back()
        }}
        {...E.handlers}
      />
      {E.buf && !E.err && <Spinner title={item.name} started={E.started} label={t("player.loading")} />}
      <Flash f={flash} />
      {num && <NumberEntry n={num} />}

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
        <TopBar item={item} on={(show || banner) && more !== "open" && ov === "none"} hints={isTv && live} showBack={show && !isTv} favBtn={touch && !isTv} isFav={isFav} onFav={() => toggleFav(item.id)} onBack={back} now={now} next={next} />
        <Controls
          on={show && more === "closed" && ov === "none"} live={live} tv={isTv} touch={touch && !isTv} vref={vref}
          paused={E.paused} queueLen={queue.length} mediaServer={S.mediaServer} sq={sq} fitName={t(`player.fit.${FITS[fit]}`)} speed={speed}
          canPip={canPip} pip={pip} fs={fs} isFav={isFav} stats={E.stats} vol={vol} muted={muted}
          onPrev={prev_} onNext={next_} onToggle={toggle} onSeek={(d) => { seek(d); poke() }} onSeekFrac={seekFrac}
          onMute={toggleMute} onVolume={(x) => setVolume(x, false)} onFav={() => toggleFav(item.id)} onMenu={openMenu}
          onPip={togglePip} onFs={toggleFs} onMore={openMore} onGuide={() => openOverlay("guide")} onChannels={() => openOverlay("strip")}
        />
      </div>

      {nextOn && nextItem && <NextCard item={nextItem} secs={nu.secs} auto={autoNext} tv={isTv} onSkip={nu.skip} onCancel={nu.cancel} />}
      {more !== "closed" && <MorePanel item={item} closing={more === "closing"} act={act} />}
      {ov === "guide" && <GuideOverlay item={item} tune={tune} close={closeOv} />}
      {ov === "strip" && <ChannelStrip item={item} tune={tune} close={closeOv} />}
      {help && <KeysHelp live={live} onClose={() => setHelp(false)} />}
      {menu && (
        <PlayerMenu
          menu={menu} audio={srvAudio ? S.tracks.audio : E.audio} audioSel={audioSel} onAudio={pickAudio} subs={srvSubs ? S.tracks.subs : E.subs} subSel={subSel} onSub={pickSub}
          subSize={subSize} onSubSize={stepSubSize} subOffset={S.sidecar !== null ? subOffset : null} onSubOffset={stepSubOffset}
          sq={sq} onQuality={pickQ} speed={speed} onSpeed={pickSpeed} fit={fit} onFit={pickFit} onClose={() => setMenu(null)}
        />
      )}
      {E.err && <ErrorScreen name={item.name} msg={E.err} canNext={queue.length > 1} onRetry={E.retry} onNext={() => zap(1)} onBack={back} />}
    </div>
  )
}
