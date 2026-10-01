import { t } from "../i18n"
// Optional end-to-end encryption of the cloud blob: PBKDF2-SHA256 (150k) -> AES-GCM-256 via WebCrypto (needs https/localhost).
export type Blob = { v: 1; enc: false; data: string } | { v: 1; enc: true; salt: string; iv: string; ct: string }
export type Key = { salt: string; key: CryptoKey }

export const canEncrypt = () => typeof crypto !== "undefined" && !!crypto.subtle
export const needsHttps = () => t("sync.err.needsHttps")

const b64 = (u: Uint8Array) => { let s = ""; u.forEach((c) => (s += String.fromCharCode(c))); return btoa(s) }
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n))

export const newSalt = () => b64(rnd(16))

export async function deriveKey(pass: string, salt: string): Promise<Key> {
  if (!canEncrypt()) throw new Error(needsHttps())
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"])
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: unb64(salt), iterations: 150000 }, base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])
  return { salt, key }
}

export async function exportKey(k: Key) { return { salt: k.salt, jwk: await crypto.subtle.exportKey("jwk", k.key) } }
export async function importKey(o: { salt: string; jwk: JsonWebKey }): Promise<Key> {
  return { salt: o.salt, key: await crypto.subtle.importKey("jwk", o.jwk, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]) }
}

export async function seal(text: string, k: Key | null): Promise<string> {
  if (!k) return JSON.stringify({ v: 1, enc: false, data: text } satisfies Blob)
  const iv = rnd(12)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k.key, new TextEncoder().encode(text)))
  return JSON.stringify({ v: 1, enc: true, salt: k.salt, iv: b64(iv), ct: b64(ct) } satisfies Blob)
}

export const parseBlob = (raw: string): Blob => {
  const b = JSON.parse(raw) as Blob
  if (!b || b.v !== 1 || (b.enc ? !b.ct || !b.iv || !b.salt : typeof b.data !== "string")) throw new Error(t("sync.err.unknownFormat"))
  return b
}

export class WrongPassphrase extends Error {
  constructor(msg = t("sync.err.wrongPass")) { super(msg) }
}

export async function open(b: Blob, k: Key | null): Promise<string> {
  if (!b.enc) return b.data
  if (!k && !canEncrypt()) throw new WrongPassphrase(t("sync.err.needsHttpsRead"))
  if (!k) throw new WrongPassphrase(t("sync.err.needPass"))
  if (k.salt !== b.salt) throw new WrongPassphrase(t("sync.err.passChanged"))
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(b.iv) }, k.key, unb64(b.ct)))
  } catch {
    throw new WrongPassphrase()
  }
}
