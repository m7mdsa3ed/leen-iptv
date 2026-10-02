// node scripts/diagnostics.check.ts : the diagnostics report must never carry credentials
import assert from "node:assert/strict"
import { redact } from "../src/lib/diagnostics/redact.ts"

const gone = (input: string, ...secrets: string[]) => {
  const out = redact(input)
  for (const x of secrets) assert.ok(!out.includes(x), `leaked "${x}" in: ${out}`)
  return out
}

gone("http://h.tv:8080/player_api.php?username=bob&password=hunter2&action=get_vod_info", "bob", "hunter2")
gone("GET /get.php?user=bob&pass=hunter2&type=m3u", "bob", "hunter2")
gone("https://pms.example:32400/identity?X-Plex-Token=abcDEF123456&X-Plex-Product=Leen", "abcDEF123456")
gone("https://x/y?x-plex-token=abc123", "abc123")
gone("https://api.example/3/configuration?api_key=0123456789abcdef&language=en", "0123456789abcdef")
gone("https://www.omdbapi.com/?apikey=deadbeef&i=tt0111161", "deadbeef")
gone("Authorization: Bearer abc.def.ghi\nAccept: */*", "abc.def.ghi")
gone('X-Emby-Authorization: MediaBrowser Client="Leen", Token="zzz999"', "zzz999")
const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJlX3BhcnQ"
gone(`apikey ${jwt} and ${jwt}`, jwt)
assert.equal(redact(`k ${jwt}`), "k [jwt]")
gone("write to me@example.com or yunus@mawaredhr.com", "me@example.com", "mawaredhr.com")
gone("http://h.tv:8080/live/bob/hunter2/1234.m3u8", "bob", "hunter2")
gone("http://h.tv/movie/bob/hunter2/55.mkv and /series/bob/hunter2/9.mp4", "bob", "hunter2")
assert.equal(redact("http://h.tv:8080/live/bob/hunter2/1234.m3u8"), "http://h.tv:8080/live/[redacted]/[redacted]/1234.m3u8")
gone("/p?url=http%3A%2F%2Fh.tv%3A8080%2Flive%2Fbob%2Fhunter2%2F1234.m3u8", "bob", "hunter2")
gone("/p?url=http%3A%2F%2Fh.tv%2Fplayer_api.php%3Fusername%3Dbob%26password%3Dhunter2", "bob", "hunter2")
gone("http://bob:hunter2@h.tv/list.m3u", "bob", "hunter2")
gone('{"token":"tok123","user":"bob","password":"pw"}', "tok123", "bob", '"pw"')
gone("PlaySessionId=abc123def&DeviceId=dev99&X-Plex-Session-Identifier=sess7", "abc123def", "dev99", "sess7")
gone("sb_publishable_AbCdEf123", "AbCdEf123")
// hostnames and plain facts stay readable
assert.equal(redact("Plex 192.168.1.20:32400 reachable in 12 ms (HTTP 200)"), "Plex 192.168.1.20:32400 reachable in 12 ms (HTTP 200)")
assert.equal(redact("https://pms.example:32400/identity"), "https://pms.example:32400/identity")
console.log("diagnostics.check ok")
