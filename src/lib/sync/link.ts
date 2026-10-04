import { t } from "../i18n"
import { loadConfig, syncBackend as api, type Config, type Session } from "@/lib/api"

// Sign a TV in with a phone. The TV shows a QR code + short code. The phone page signs in with its OWN session and sends it to the TV
// encrypted (ECDH P-256 -> AES-GCM-256) for the TV's one-time public key, through the user-link functions in the schema file.
// Only the TV holds the private key, so the server (and anyone reading the table) cannot read the session. The phone then forgets it
// WITHOUT calling logout, so the session continues on the TV (refresh tokens are single-use: two devices cannot share one chain).

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789" // no 0/O/1/I/L: easy to read and type
const b64 = (u: ArrayBuffer | Uint8Array) => { const a = new Uint8Array(u); let s = ""; a.forEach((c) => (s += String.fromCharCode(c))); return btoa(s) }
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const ecdh = { name: "ECDH", namedCurve: "P-256" } as const

export const canLink = () => typeof crypto !== "undefined" && !!crypto.subtle && !!loadConfig().url

/** Hosted web address the phone should open: VITE_PUBLIC_APP_URL, else this page when it is served over https. "" = unknown. */
export function linkBase(): string {
  const env = (import.meta.env.VITE_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "")
  if (env) return env
  return location.protocol === "https:" ? location.origin + location.pathname.replace(/\/+$/, "") : ""
}
export const linkUrl = (code: string) => `${linkBase()}/#/link/${code.replace(/-/g, "")}`
export const prettyCode = (c: string) => c.replace(/(.{4})(?=.)/g, "$1-")
export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z2-9]/g, "")

const newCode = () => { const r = crypto.getRandomValues(new Uint8Array(8)); return Array.from(r, (x) => ALPHABET[x % ALPHABET.length]).join("") }
const cfg = (): Config => { const c = loadConfig(); if (!c.url) throw new Error(t("sync.err.noConfig")); return c }

export type TvLink = { id: string; code: string; priv: CryptoKey }

/** TV: create a link (retries the rare code collision). */
export async function createLink(): Promise<TvLink> {
  const kp = await crypto.subtle.generateKey(ecdh, false, ["deriveKey"])
  const pub = b64(await crypto.subtle.exportKey("raw", kp.publicKey))
  for (let i = 0; i < 4; i++) {
    const code = newCode()
    try {
      const id = (await api.rpc(cfg(), "link_create", { p_code: code, p_key: pub })) as string
      return { id, code, priv: kp.privateKey }
    } catch (e) { if (i === 3) throw e }
  }
  throw new Error(t("sync.err.noSession"))
}

/** TV: the session once the phone approved, else null. Reads, decrypts and deletes the link. */
export async function pollLink(l: TvLink): Promise<Session | null> {
  const rows = (await api.rpc(cfg(), "link_poll", { p_id: l.id })) as { phone_key: string; payload: string }[]
  const r = rows?.[0]
  if (!r) return null
  const phonePub = await crypto.subtle.importKey("raw", unb64(r.phone_key), ecdh, false, [])
  const key = await crypto.subtle.deriveKey({ name: "ECDH", public: phonePub }, l.priv, { name: "AES-GCM", length: 256 }, false, ["decrypt"])
  const [iv, ct] = r.payload.split(".")
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(ct))
  void api.rpc(cfg(), "link_finish", { p_id: l.id }).catch(() => {})
  return JSON.parse(new TextDecoder().decode(plain)) as Session
}

/** Phone: send `session` (a fresh sign-in made on the link page) to the TV that shows `code`. */
export async function approveLink(code: string, session: Session): Promise<void> {
  const c = cfg()
  const tvKey = (await api.rpc(c, "link_lookup", { p_code: cleanCode(code) }, session.access)) as string
  const tvPub = await crypto.subtle.importKey("raw", unb64(tvKey), ecdh, false, [])
  const kp = await crypto.subtle.generateKey(ecdh, true, ["deriveKey"])
  const key = await crypto.subtle.deriveKey({ name: "ECDH", public: tvPub }, kp.privateKey, { name: "AES-GCM", length: 256 }, false, ["encrypt"])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(session)))
  const phoneKey = b64(await crypto.subtle.exportKey("raw", kp.publicKey))
  await api.rpc(c, "link_approve", { p_code: cleanCode(code), p_phone_key: phoneKey, p_payload: `${b64(iv)}.${b64(ct)}` }, session.access)
}
