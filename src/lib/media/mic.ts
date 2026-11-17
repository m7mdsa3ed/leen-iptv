import { captureSupported, countInputs } from "./devices"

export const micSupported = captureSupported

/** Number of microphones the browser lists (no permission prompt). */
export const micCount = () => countInputs("audioinput")

