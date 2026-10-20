import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import cascadeLayers from "@csstools/postcss-cascade-layers";
import postcss from "postcss";
// @ts-expect-error plain .mjs without types
import { proxyHandler } from "./server/proxy-core.mjs";
import type { Plugin } from "vite";
import path from "path";
import fs from "fs";
import { createHash } from "crypto";

// Same-origin /p proxy in dev and preview: browsers can't read most IPTV hosts (no CORS on the redirect target).
const streamProxy = (): Plugin => {
  const mw = (req: unknown, res: unknown, next: () => void) => { if (!proxyHandler(req, res)) next() }
  return { name: "stream-proxy", configureServer: (s) => void s.middlewares.use(mw), configurePreviewServer: (s) => void s.middlewares.use(mw) }
}

// Post-build: Vite's postcss hook doesn't run the polyfill after Tailwind, and file:// can't load type=module scripts.
const webosCompat = (): Plugin => ({
  name: "webos-compat",
  enforce: "post",
  async generateBundle(_, bundle) {
    for (const f of Object.values(bundle)) {
      if (f.type === "asset" && f.fileName.endsWith(".css")) {
        f.source = (await postcss([cascadeLayers()]).process(String(f.source), { from: undefined })).css
      }
    }
  },
  transformIndexHtml: { order: "post", handler: (h) => h.replace(/<script type="module" crossorigin/g, "<script defer").replace(/ crossorigin/g, "") },
})

// Post-build: write this build's hashed /assets into dist/sw.js (public/sw.js). The version is a hash of the names, so sw.js
// only changes (= browsers see an update and the toast offers it) when the files do.
const precacheList = (): Plugin => ({
  name: "precache-list",
  apply: "build",
  writeBundle(o, bundle) {
    const assets = Object.keys(bundle).filter((f) => f.startsWith("assets/")).sort()
    const v = createHash("sha1").update(assets.join()).digest("hex").slice(0, 10)
    const f = path.join(o.dir!, "sw.js"), src = fs.readFileSync(f, "utf8"), from = '{ v: "dev", assets: [] }'
    if (!src.includes(from)) throw new Error("sw.js: precache placeholder missing")
    fs.writeFileSync(f, src.replace(from, JSON.stringify({ v, assets })))
  },
})

// webOS 23 ships Chromium 94: no @layer (99), no oklch/color-mix (111), no nesting (112).
// Tailwind v4 emits all of those, so downlevel CSS for chrome94 (webOS 23+ and up).
export default defineConfig({
  base: "./", // packaged webOS apps load from file://
  plugins: [react(), tailwindcss(), webosCompat(), streamProxy(), precacheList()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  css: {
    transformer: "lightningcss",
    lightningcss: { targets: { chrome: 94 << 16 } },
  },
  build: { target: "chrome94", cssTarget: "chrome94", cssCodeSplit: false, rollupOptions: { output: { format: "iife", inlineDynamicImports: true } } },
  server: { host: true, allowedHosts: true }, // reachable via Tailscale / MagicDNS names
});
