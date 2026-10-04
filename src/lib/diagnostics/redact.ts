// Pure (no alias imports, no DOM): strips secrets from any text before it is shown, copied or downloaded.
// Hostnames stay (useful when diagnosing); credentials, tokens, keys, session ids, emails and URL userinfo never do.
const R = "[redacted]"
const dec = (s: string) => { try { return decodeURIComponent(s) } catch { return s } }
// query/JSON/header names whose value is secret or identifies the install
const NAMES = "password|passwd|pass|pwd|username|user|token|x-plex-token|x-plex-client-identifier|x-plex-session-identifier|api_key|apikey|api-key|access_token|refresh_token|authtoken|auth|secret|session|sessionid|session_id|playsessionid|deviceid|anonkey|key|sig|signature"

export function redact(input: string): string {
  let s = String(input)
  // /p?url=<encoded target>: decode so the rules below see the real path and query
  s = s.replace(/([?&]url=)(https?%3A%2F%2F[^&\s"'<>]*)/gi, (_m, a: string, b: string) => a + dec(b))
  // headers: Authorization / X-Emby-Authorization / Proxy-Authorization / apikey (whole value, incl. Bearer xxx)
  s = s.replace(/\b((?:x-emby-|proxy-)?authorization|apikey|x-plex-token)(\s*[:=]\s*)[^\r\n]*/gi, `$1$2${R}`)
  s = s.replace(/\bBearer\s+[\w.~+/=-]+/gi, `Bearer ${R}`)
  // JSON style "token":"..."
  s = s.replace(new RegExp(`("(?:${NAMES})"\\s*:\\s*")[^"]*`, "gi"), `$1${R}`)
  // key=value (query strings, plain text)
  s = s.replace(new RegExp(`\\b(${NAMES})(=|%3D)[^&\\s"'<>#]*`, "gi"), `$1$2${R}`)
  // Xtream path credentials /live/user/pass/id (also movie, series, timeshift)
  s = s.replace(/\/(live|movie|series|timeshift)\/[^/\s?#"'<>]+\/[^/\s?#"'<>]+\/(?=[^/\s?#"'<>]*\d)/gi, `/$1/${R}/${R}/`)
  s = s.replace(/(live|movie|series)%2F[^%\s&]+%2F[^%\s&]+%2F(?=\d)/gi, `$1%2F${R}%2F${R}%2F`)
  // user:pass@host
  s = s.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+(?::[^/\s@]*)?@/gi, `$1${R}@`)
  // JWTs (anon keys, TMDB v4 tokens, GoTrue sessions) and new-style sb_ keys
  s = s.replace(/\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]*/g, "[jwt]")
  s = s.replace(/\bsb_(?:publishable|secret)_[\w-]+/g, R)
  // emails
  s = s.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]")
  return s
}
