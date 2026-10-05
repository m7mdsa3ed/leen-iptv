import { useEffect, type MutableRefObject, type RefObject } from "react"
import { useApp } from "@/lib/store"
import { useHistory } from "@/lib/history"
import { plexScrobble, plexStopTranscode, plexTimeline } from "@/lib/plex"
import { jellyfinMarkPlayed, jellyfinReport, jellyfinStopTranscode } from "@/lib/jellyfin"
import type { Item } from "@/lib/types"
import type { SourceMeta } from "@/lib/sources"
import type { Stats } from "./stats"
import { isEpisode } from "./util"
import { publishPlaybackPresence } from "@/lib/sync"

type Meas = { stallTotal: number; errTotal: number; startupMs: number | undefined }

/** Everything that records what was watched: resume point, recents, saved progress, watch history, Plex timeline + scrobble, Jellyfin reports. */
export function useTracking(o: {
  vref: RefObject<HTMLVideoElement | null>; item: Item; live: boolean; src?: SourceMeta; plex: SourceMeta | null; jf: SourceMeta | null
  resume: MutableRefObject<number>; startId: MutableRefObject<string>; meas: MutableRefObject<Meas>; statsRef: MutableRefObject<Stats | null>
}) {
  const { vref, item, live, src, plex, jf, resume, startId, meas, statsRef } = o
  const trackHistory = useApp((s) => s.settings.trackHistory)
  const pushRecent = useApp((s) => s.pushRecent)
  const setProgress = useApp((s) => s.setProgress)

  /* cross-device now playing; presence is independent from durable watch progress */
  useEffect(() => {
    const v = vref.current
    const profile = useApp.getState().profiles.find((p) => p.id === useApp.getState().profileId)
    if (!v || !profile) return
    const publish = (status: "playing" | "paused" | "stopped") => {
      void publishPlaybackPresence(item, status, profile.name, v.currentTime, Number.isFinite(v.duration) ? v.duration : 0)
    }
    const onPlay = () => publish("playing")
    const onPause = () => publish("paused")
    const onEnded = () => publish("stopped")
    v.addEventListener("play", onPlay)
    v.addEventListener("pause", onPause)
    v.addEventListener("ended", onEnded)
    if (!v.paused) onPlay()
    return () => {
      v.removeEventListener("play", onPlay)
      v.removeEventListener("pause", onPause)
      v.removeEventListener("ended", onEnded)
      publish("stopped")
    }
  }, [item.id, live]) // eslint-disable-line react-hooks/exhaustive-deps

  /* resume point + recents */
  useEffect(() => {
    const p = useApp.getState().data[useApp.getState().profileId ?? ""]?.progress[item.id]
    if (startId.current === item.id) { startId.current = ""; resume.current = 0; pushRecent(item.id); return } // "Play from beginning"
    resume.current = !live && p && p.pos > 30 && p.pos < p.dur * 0.95 ? p.pos : !live && !p && item.resume && item.resume > 30 ? item.resume : 0
    pushRecent(item.id)
  }, [item.id, live, pushRecent]) // eslint-disable-line react-hooks/exhaustive-deps

  /* save progress */
  useEffect(() => {
    if (live) return
    const t = setInterval(() => { const v = vref.current; if (v && v.duration > 0) setProgress(item.id, v.currentTime, v.duration, item.series) }, 10000)
    return () => { clearInterval(t); const v = vref.current; if (v && v.duration > 0) setProgress(item.id, v.currentTime, v.duration, item.series) }
  }, [item.id, live, setProgress]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Watch history: one session per playback, +5s while actually playing (paused/buffering time is not counted).
     Stats and the History page read this; Settings > History turns it off. */
  useEffect(() => {
    const pid = useApp.getState().profileId
    if (!trackHistory || !pid) return
    const H = useHistory.getState()
    let sid = ""
    let alive = true
    meas.current.stallTotal = 0; meas.current.errTotal = 0
    let speedSum = 0, speedN = 0
    const kind = live ? "live" : isEpisode(item.id) ? "episode" : "movie"
    void H.load(pid).then(() => { if (alive) sid = useHistory.getState().start({ item: item.id, kind, name: item.name, group: item.group, logo: item.logo, src: src?.id ?? "" }) })
    const snap = () => {
      const v = vref.current
      const st = statsRef.current
      if (st?.bw) { speedSum += st.bw / 1e6; speedN++ }
      return { pos: v?.currentTime, dur: v && isFinite(v.duration) ? v.duration : undefined, stalls: meas.current.stallTotal, errors: meas.current.errTotal, startupMs: meas.current.startupMs, q: st?.q, mbps: speedN ? speedSum / speedN : undefined }
    }
    const iv = setInterval(() => {
      const v = vref.current
      if (sid && v && !v.paused && v.readyState >= 3) useHistory.getState().tick(sid, 5, snap())
    }, 5000)
    return () => {
      alive = false
      clearInterval(iv)
      if (sid) useHistory.getState().patch(sid, snap())
    }
  }, [item.id, trackHistory]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Plex: timeline every 10s + on pause/play, stopped (and scrobble when >90%) on leave */
  useEffect(() => {
    const v = vref.current
    if (!plex || live || !v) return
    let pos = 0, d = 0
    const rep = (state: "playing" | "paused" | "stopped") => d > 0 && plexTimeline(plex, item, state, pos, d)
    const tick = () => { if (v.duration > 0) { pos = v.currentTime; d = v.duration } }
    const on = (state: "playing" | "paused") => () => { tick(); rep(state) }
    const t = setInterval(() => { tick(); rep(v.paused ? "paused" : "playing") }, 10000)
    const onPause = on("paused"), onPlay = on("playing")
    v.addEventListener("pause", onPause); v.addEventListener("play", onPlay); v.addEventListener("timeupdate", tick)
    return () => {
      clearInterval(t)
      v.removeEventListener("pause", onPause); v.removeEventListener("play", onPlay); v.removeEventListener("timeupdate", tick)
      rep("stopped")
      plexStopTranscode(plex, item)
      if (d > 0 && pos / d > 0.9) plexScrobble(plex, item)
    }
  }, [item.id, live, plex?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Jellyfin: start on first play, progress every 10s + on pause/play, stopped (and mark played when >90%) on leave; transcode always stopped */
  useEffect(() => {
    const v = vref.current
    if (!jf || !v) return
    if (live) return () => jellyfinStopTranscode(jf, item)
    let pos = 0, d = 0, started = false
    const tick = () => { if (v.duration > 0) { pos = v.currentTime; d = v.duration } }
    const rep = () => { tick(); if (started) jellyfinReport(jf, item, "progress", pos, v.paused) }
    const onPlay = () => { tick(); if (!started) { started = true; jellyfinReport(jf, item, "start", pos) } else rep() }
    const t = setInterval(rep, 10000)
    v.addEventListener("pause", rep); v.addEventListener("play", onPlay); v.addEventListener("timeupdate", tick)
    return () => {
      clearInterval(t)
      v.removeEventListener("pause", rep); v.removeEventListener("play", onPlay); v.removeEventListener("timeupdate", tick)
      if (started) jellyfinReport(jf, item, "stopped", pos)
      jellyfinStopTranscode(jf, item)
      if (d > 0 && pos / d > 0.9) jellyfinMarkPlayed(jf, item)
    }
    // deps on the id, not the object: a store update (sync pull, source edit) must not stop the transcode mid-play
  }, [item.id, live, jf?.id]) // eslint-disable-line react-hooks/exhaustive-deps
}
