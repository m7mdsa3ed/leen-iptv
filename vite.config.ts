import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import cascadeLayers from "@csstools/postcss-cascade-layers";
import postcss from "postcss";
// @ts-expect-error plain .mjs without types
import { proxyHandler } from "./server/proxy-core.mjs";
import type { Plugin } from "vite";
import path from "path";

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

// webOS 23 ships Chromium 94: no @layer (99), no oklch/color-mix (111), no nesting (112).
// Tailwind v4 emits all of those, so downlevel CSS for chrome94 (webOS 23+ and up).
export default defineConfig({
  base: "./", // packaged webOS apps load from file://
  plugins: [react(), tailwindcss(), webosCompat(), streamProxy()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  css: {
    transformer: "lightningcss",
    lightningcss: { targets: { chrome: 94 << 16 } },
  },
  build: { target: "chrome94", cssTarget: "chrome94", cssCodeSplit: false, rollupOptions: { output: { format: "iife", inlineDynamicImports: true } } },
  server: { host: true, allowedHosts: true }, // reachable via Tailscale / MagicDNS names
});
