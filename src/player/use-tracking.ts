import { useEffect, type MutableRefObject, type RefObject } from "react"
import { useApp } from "@/lib/store"
import { useHistory } from "@/lib/history"
import { plexScrobble, plexStopTranscode, plexTimeline } from "@/lib/plex"
import { jellyfinMarkPlayed, jellyfinReport, jellyfinStopTranscode } from "@/lib/jellyfin"
import { publishPlaybackPresence } from "@/lib/sync"
import type { Item } from "@/lib/types"
import type { SourceMeta } from "@/lib/sources"
import type { Stats } from "./stats"
import { isEpisode } from "./util"

type Meas = { stallTotal: number; errTotal: number; startupMs: number | undefined }
const WATCHED = 0.9 // past this share a Plex / Jellyfin title is reported as watched on leave

/** Where the player starts an item: unfinished local progress, else the server's own offset; 0 = from the start (also for "Play from beginning"). */
export function resumePoint(item: Item, live: boolean): number {
  if (live) return 0
  const p = useApp.getState().data[useApp.getState().profileId ?? ""]?.progress[item.id]
  if (p) return p.pos > 30 && p.pos < p.dur * 0.95 ? p.pos : 0
  return item.resume && item.resume > 30 ? item.resume : 0
}

/** Playhead + duration while the video plays (for the media-server reports, which run after the element is gone). */
function follow(v: HTMLVideoElement) {
  const at = { pos: 0, dur: 0 }
  const tick = () => { if (v.duration > 0 && isFinite(v.duration)) { at.pos = v.currentTime; at.dur = v.duration } }
  v.addEventListener("timeupdate", tick)
  return { at, tick, off: () => v.removeEventListener("timeupdate", tick) }
}

/**
 * Everything that records what was watched, one effect each: the resume point and recents, saved progress (every 10 s + on leave),
 * the watch-history session, cross-device "now playing", the Plex timeline (+ scrobble) and the Jellyfin reports (+ mark played).
 * Server reports key on the item / source id, so a store update (sync pull, source edit) never stops a transcode mid-play.
 */
export function useTracking(o: {
  vref: RefObject<HTMLVideoElement | null>; item: Item; live: boolean; src?: SourceMeta; plex: SourceMeta | null; jf: SourceMeta | null
  resume: MutableRefObject<number>; fromStart: MutableRefObject<string>; meas: MutableRefObject<Meas>; statsRef: MutableRefObject<Stats | null>
}) {
  const { vref, item, live, src, plex, jf, resume, fromStart, meas, statsRef } = o
  const trackHistory = useApp((s) => s.settings.trackHistory)

  /* resume point + recents */
  useEffect(() => {
    resume.current = fromStart.current === item.id ? 0 : resumePoint(item, live)
    fromStart.current = ""
    useApp.getState().pushRecent(item.id)
  }, [item.id, live]) // eslint-disable-line react-hooks/exhaustive-deps

  /* saved progress */
  useEffect(() => {
    if (live) return
    const save = () => { const v = vref.current; if (v && v.duration > 0) useApp.getState().setProgress(item.id, v.currentTime, v.duration, item.series) }
    const id = setInterval(save, 10000)
    return () => { clearInterval(id); save() }
  }, [item.id, live]) // eslint-disable-line react-hooks/exhaustive-deps

  /* now playing on the other devices (independent of the saved progress) */
  useEffect(() => {
    const v = vref.current
    const st = useApp.getState()
    const profile = st.profiles.find((p) => p.id === st.profileId)
    if (!v || !profile) return
    const send = (status: "playing" | "paused" | "stopped") => void publishPlaybackPresence(item, status, profile.name, v.currentTime, Number.isFinite(v.duration) ? v.duration : 0)
    const onPlay = () => send("playing"), onPause = () => send("paused"), onEnded = () => send("stopped")
    v.addEventListener("play", onPlay); v.addEventListener("pause", onPause); v.addEventListener("ended", onEnded)
    if (!v.paused) onPlay()
    return () => { v.removeEventListener("play", onPlay); v.removeEventListener("pause", onPause); v.removeEventListener("ended", onEnded); send("stopped") }
  }, [item.id, live]) // eslint-disable-line react-hooks/exhaustive-deps

  /* watch history: one session per playback, +5 s while really playing (paused / buffering time does not count); Settings > History turns it off */
  useEffect(() => {
    const pid = useApp.getState().profileId
    if (!trackHistory || !pid) return
    let sid = "", alive = true, mbps = 0, n = 0
    meas.current.stallTotal = 0; meas.current.errTotal = 0
    const kind = live ? "live" : isEpisode(item.id) ? "episode" : "movie"
    void useHistory.getState().load(pid).then(() => { if (alive) sid = useHistory.getState().start({ item: item.id, kind, name: item.name, group: item.group, logo: item.logo, src: src?.id ?? "" }) })
    const snap = () => {
      const v = vref.current, st = statsRef.current
      if (st?.bw) { mbps += st.bw / 1e6; n++ }
      return { pos: v?.currentTime, dur: v && isFinite(v.duration) ? v.duration : undefined, stalls: meas.current.stallTotal, errors: meas.current.errTotal, startupMs: meas.current.startupMs, q: st?.q, mbps: n ? mbps / n : undefined }
    }
    const id = setInterval(() => { const v = vref.current; if (sid && v && !v.paused && v.readyState >= 3) useHistory.getState().tick(sid, 5, snap()) }, 5000)
    return () => { alive = false; clearInterval(id); if (sid) useHistory.getState().patch(sid, snap()) }
  }, [item.id, trackHistory]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Plex: timeline every 10 s and on play / pause; on leave "stopped", the transcode ends, and past 90% it is scrobbled */
  useEffect(() => {
    const v = vref.current
    if (!plex || live || !v) return
    const f = follow(v)
    const report = (state: "playing" | "paused" | "stopped") => { f.tick(); if (f.at.dur > 0) plexTimeline(plex, item, state, f.at.pos, f.at.dur) }
    const onPause = () => report("paused"), onPlay = () => report("playing")
    const id = setInterval(() => report(v.paused ? "paused" : "playing"), 10000)
    v.addEventListener("pause", onPause); v.addEventListener("play", onPlay)
    return () => {
      clearInterval(id); f.off()
      v.removeEventListener("pause", onPause); v.removeEventListener("play", onPlay)
      report("stopped")
      plexStopTranscode(plex, item)
      if (f.at.dur > 0 && f.at.pos / f.at.dur > WATCHED) plexScrobble(plex, item)
    }
  }, [item.id, live, plex?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Jellyfin: "start" on the first play, progress every 10 s and on play / pause, "stopped" on leave (+ played past 90%); the transcode always ends */
  useEffect(() => {
    const v = vref.current
    if (!jf || !v) return
    if (live) return () => jellyfinStopTranscode(jf, item)
    const f = follow(v)
    let started = false
    const progress = () => { f.tick(); if (started) jellyfinReport(jf, item, "progress", f.at.pos, v.paused) }
    const onPlay = () => { f.tick(); if (started) return progress(); started = true; jellyfinReport(jf, item, "start", f.at.pos) }
    const id = setInterval(progress, 10000)
    v.addEventListener("pause", progress); v.addEventListener("play", onPlay)
    return () => {
      clearInterval(id); f.off()
      v.removeEventListener("pause", progress); v.removeEventListener("play", onPlay)
      if (started) jellyfinReport(jf, item, "stopped", f.at.pos)
      jellyfinStopTranscode(jf, item)
      if (f.at.dur > 0 && f.at.pos / f.at.dur > WATCHED) jellyfinMarkPlayed(jf, item)
    }
  }, [item.id, live, jf?.id]) // eslint-disable-line react-hooks/exhaustive-deps
}
