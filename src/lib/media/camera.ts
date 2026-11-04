import { captureSupported, countInputs, openStream } from "./devices"

export const cameraSupported = captureSupported

/** Number of cameras the browser lists (no permission prompt). */
export const cameraCount = () => countInputs("videoinput")

/** Opens a camera, front-facing when there is a choice. The caller owns the stream and stops its tracks. */
export const openCamera = () =>
  openStream({ video: { facingMode: "user" } }, "camera.none", "camera.denied")
