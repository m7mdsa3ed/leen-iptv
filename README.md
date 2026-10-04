# Leen TV

Leen: React 19 + Tailwind v4 + shadcn (Base UI) client for LG webOS 23+ (Chromium 94+), desktop and Android (PWA). Google TV-inspired default UI, light and dark themes.
M3U, Xtream, Plex and Jellyfin sources, live TV + EPG guide, movies, series, favorites, resume, profiles with PIN and category locks.

Features: English + Egyptian Arabic (ar-EG) with full RTL (Settings > Display > Language, live switch); Plex source (plex.tv sign-in, server discovery, optional remote address, resume sync); Jellyfin source (local + remote address with automatic switching between home and away, password or Quick Connect sign-in, resume sync, live TV + guide when the server has it); three switchable layouts (Google TV, Apple TV, Netflix) that each reshape the shell, Home and the Movies/Shows/Live/Library/Search/Detail/Category/Genre screens,  and a Motion option (full / reduced / off) under Settings > Display; consistent switches/toggles and improved D-pad navigation on TV.

## Run
    pnpm dev          # browser preview (use arrow keys / Enter / Esc as the remote)
    pnpm build        # dist/ (Chrome 94 CSS + classic script, loads from file://)
    pnpm proxy        # optional CORS proxy + static host on :8787

## Install on a TV
Enable Developer Mode on the TV, then:

    npm i -g @webos-tools/cli
    ares-setup-device            # add the TV as "tv"
    pnpm package && pnpm install:tv

## Remote
Arrows/OK navigate, Back goes up. Player: Up/Down or CH+/- zap, Left/Right seek (VOD), OK shows controls,
digits jump to a channel, Red favorite, Green audio, Yellow aspect, Blue subtitles. Yellow in a category list locks it (needs a profile PIN).

## CORS
Most Xtream/M3U servers do not send CORS headers. If a source fails to load, run `pnpm proxy` somewhere on your LAN and set its URL under Settings > Network
(turn on "Proxy streams too" only if playback itself is blocked).

## Platforms
One codebase, three modes (`html[data-mode]`: `tv`, `desktop`, `mobile`). TV mode is picked from the webOS user agent, `?tv=1`, or `localStorage['iptv-mode']='tv'`.

### TV (LG webOS)
See "Install on a TV" above. `pnpm package` builds a classic script + single CSS that loads from `file://`.

### Desktop / PWA
    pnpm dev                     # dev server, http://localhost:5173
    pnpm build && pnpm proxy     # static host + CORS proxy on :8787 (or serve dist/ with pm2 / vite preview)
Open it in Chrome/Edge and use "Install app". The service worker registers only on http(s) (not file://, not webOS) and caches the app shell only, never streams or API calls.
Keyboard: arrows (after focusing an item), Enter, Esc = Back.

### Android
Android uses the PWA (no native wrapper). Open the app in Chrome on the phone and choose "Install app" / "Add to Home screen". Chrome only offers install over HTTPS (or localhost), so put HTTPS in front, e.g. `tailscale serve --bg 4010` and open the `https://<machine>.<tailnet>.ts.net` address.
`http://` IPTV servers are fetched through the built-in `/p` proxy (Vite dev/preview or `pnpm proxy`), which also handles CORS and mixed content. The hardware Back button pops the in-app stack.

## Supabase setup (optional cloud sync)
1. Create a project at supabase.com (Authentication > Sign In / Providers: Email enabled and **"Confirm email" turned OFF** - the app does not send or require confirmation emails).
2. Create the tables: run `pnpm db:push` (applies `supabase/schema.sql`), or paste that file into the SQL Editor and Run - it is safe to re-run. `db:push` reads `DATABASE_URL` from `.env` (Project Settings > Database > Connection string; use the Session pooler URI when the direct `db.<ref>.supabase.co` host has no IPv4 address (newer projects are IPv6-only), and never commit it - only `VITE_`-prefixed vars reach the client). Creates `public.user_data` with row-level security.
3. Project Settings > API: copy the Project URL and the **anon** public key into `.env` (copy `.env.example`) as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then restart the dev server / rebuild. The project is set at build time for the whole app; users never enter it. Without these, the app hides sync and runs without accounts.
4. On first launch users choose "Sign in" (sync, backup, restore on a new TV) or "Continue without an account" (private, offline, no sign-up); they can sign in later in Settings > Account & sync. Optionally set an encryption passphrase (needs https or localhost; use the same one on every device). Sources hold IPTV credentials, so encrypt.
5. Authentication > URL Configuration: set **Site URL** to where the web app is hosted (for example your `tailscale serve` https address) and add any other app addresses under **Redirect URLs**. Confirmation and password-reset emails link there, so a TV-only install should still have one hosted copy of the app (the PWA) to open those links on a phone.
6. Accounts: users can create an account (email + password, at least 8 characters), sign in, sign in with an emailed 6-digit code (no password; creates the account automatically), or reset a forgotten password. Confirmation emails are not used: turn **Confirm email** OFF (Authentication > Sign In / Providers > Email) so sign-up signs the user in at once. The built-in email sender allows only a few emails per hour; add a custom SMTP service for real use.
7. Sign in a TV with a phone: re-run `pnpm db:push` (adds a few `link_*` functions, no table access for clients) and set `VITE_PUBLIC_APP_URL` in `.env` to the https address where the web app is hosted. A TV signing in shows a QR code AND a short code; on the phone the QR opens `<VITE_PUBLIC_APP_URL>/#/link/CODE` (or type the code at `<url>/#/link`), the user signs in there and approves, and the session is sent to the TV encrypted with a one-time key (only the TV can read it). Needs https (WebCrypto) on the phone page.
8. Never use the service-role key in this app.
