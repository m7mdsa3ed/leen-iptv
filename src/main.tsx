import "@fontsource/kaushan-script/latin-400.css" // brand wordmark font, bundled (TVs load from file://)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { probeProxy } from './lib/net'
import { initSync } from './lib/sync'
import { registerPwa } from './lib/pwa'
import { isTv } from './lib/device'

declare global {
  /** the persisted `iptv-app` store, parsed once by the pre-paint script in index.html (null when absent or unreadable) */
  interface Window { __leenBoot?: { state?: { settings?: { motion?: string } } } | null }
}

// Animated boot splash (markup + CSS live in index.html). Cold start plays the intro for ~2.6s (0.9s with reduced motion, the TV default); a refresh in the same session skips it.
const splash = document.getElementById('splash')
const t0 = performance.now()
let motion: string | undefined
try {
  const boot = window.__leenBoot !== undefined ? window.__leenBoot : JSON.parse(localStorage.getItem('iptv-app') || '{}')
  motion = boot?.state?.settings?.motion
} catch { /* default */ }
motion ??= isTv ? 'reduced' : 'full' // the store default (src/lib/store.ts)
const motionOff = motion === 'off'
const reduced = motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches
const seen = sessionStorage.getItem('leen-splash') === '1'
if (motionOff) splash?.classList.add('static')
sessionStorage.setItem('leen-splash', '1')
const hold = seen ? 0 : motionOff ? 400 : reduced ? 900 : 2600

// know whether a same-origin /p proxy exists before the first fetch
void probeProxy().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  initSync()
  registerPwa()
  window.setTimeout(() => {
    splash?.classList.add('hide')
    window.setTimeout(() => splash?.remove(), 400)
  }, Math.max(0, hold - (performance.now() - t0)))
})
