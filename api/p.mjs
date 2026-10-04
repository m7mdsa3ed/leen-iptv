// Vercel serverless entry for the same /p proxy (vercel.json rewrites /p here).
import { proxyHandler } from "../server/proxy-core.mjs"

export default (req, res) => {
  req.url = req.url.replace(/^\/api\/p/, "/p") // ponytail: whichever path Vercel reports, proxyHandler matches /p
  if (!proxyHandler(req, res)) res.statusCode = 404, res.end()
}
