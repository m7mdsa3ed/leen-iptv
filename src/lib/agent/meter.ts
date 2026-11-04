import { loud, SLICE, sliceLevels } from "./pure"

/** How loud the call is right now (0..1), and whether that is the assistant talking (else the microphone). */
export type Level = { level: number; agent: boolean }

/**
 * The call's level source. The assistant's voice arrives as PCM chunks: each 50 ms slice is queued back to back like the player queues them,
 * so it lights the meter when it is heard, not when it arrives. The microphone is read through an analyser. Read it from a rAF loop;
 * nothing here touches React.
 */
export function createMeter() {
  const said: { at: number; level: number }[] = []
  let playhead = 0
  let mic: { ctx: AudioContext; analyser: AnalyserNode; buf: Float32Array<ArrayBuffer> } | null = null
  return {
    chunk(b64: string) {
      const now = performance.now() / 1000
      let at = Math.max(now, playhead)
      for (const level of sliceLevels(b64)) { said.push({ at, level }); at += SLICE / 24000 }
      playhead = at
    },
    /** Playback stopped (finished, or the user cut in): nothing queued is going to be heard. */
    reset() { said.length = 0; playhead = 0 },
    attach(stream: MediaStream) {
      try {
        const ctx = new AudioContext()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        ctx.createMediaStreamSource(stream).connect(analyser)
        mic = { ctx, analyser, buf: new Float32Array(analyser.fftSize) }
      } catch { mic = null } // no meter from the microphone; the assistant's own voice still moves it
    },
    read(): Level {
      const now = performance.now() / 1000
      while (said.length > 1 && said[1].at <= now) said.shift()
      if (said[0] && said[0].at <= now && now < said[0].at + SLICE / 24000) return { level: said[0].level, agent: true }
      if (!mic) return { level: 0, agent: false }
      mic.analyser.getFloatTimeDomainData(mic.buf)
      let sum = 0
      for (const v of mic.buf) sum += v * v
      return { level: loud(Math.sqrt(sum / mic.buf.length)), agent: false }
    },
    dispose() { said.length = 0; void mic?.ctx.close().catch(() => {}); mic = null },
  }
}
export type Meter = ReturnType<typeof createMeter>
