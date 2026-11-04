import { captureSupported, countInputs, openStream } from "./devices"

export const micSupported = captureSupported

/** Number of microphones the browser lists (no permission prompt). */
export const micCount = () => countInputs("audioinput")

/** Opens the microphone for a voice session. The caller owns the stream and stops its tracks. */
export const openMic = () =>
  openStream({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }, "voice.noMic", "voice.micDenied")
