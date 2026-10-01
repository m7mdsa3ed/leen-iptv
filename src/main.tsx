import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { probeProxy } from './lib/net'

// Animated boot splash (markup + CSS live in index.html). Cold start plays the intro for ~1.6s; a refresh in the same session skips it.
const splash = document.getElementById('splash')
const t0 = performance.now()
let motionOff = false
try { motionOff = JSON.parse(localStorage.getItem('iptv-app') || '{}').state?.settings?.motion === 'off' } catch { /* default */ }
const seen = sessionStorage.getItem('leen-splash') === '1'
if (motionOff) splash?.classList.add('static')
sessionStorage.setItem('leen-splash', '1')
const hold = seen ? 0 : motionOff ? 400 : 1600

// know whether a same-origin /p proxy exists before the first fetch
void probeProxy().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  window.setTimeout(() => {
    splash?.classList.add('hide')
    window.setTimeout(() => splash?.remove(), 400)
  }, Math.max(0, hold - (performance.now() - t0)))
})
