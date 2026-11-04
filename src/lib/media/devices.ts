import { t } from "@/lib/i18n"

export type InputKind = "audioinput" | "videoinput"

/** The browser has the capture API at all (needs https or localhost). */
export const captureSupported = () => !!navigator.mediaDevices?.getUserMedia

/** Inputs of one kind the browser lists. Listing asks for no permission, so it never raises the system overlay. */
export async function countInputs(kind: InputKind): Promise<number> {
  const md = navigator.mediaDevices
  const list = md?.enumerateDevices ? await md.enumerateDevices() : []
  return list.filter((x) => x.kind === kind).length
}

/** Opens a stream. Fails with a plain, translated message: `none` when the device is missing, `denied` for everything else. */
export async function openStream(constraints: MediaStreamConstraints, none: string, denied: string): Promise<MediaStream> {
  if (!captureSupported()) throw new Error(t(none))
  return navigator.mediaDevices.getUserMedia(constraints).catch((e: unknown) => {
    throw new Error(t((e as DOMException)?.name === "NotFoundError" ? none : denied))
  })
}
