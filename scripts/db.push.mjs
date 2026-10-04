// node scripts/db.push.mjs [file.sql] : apply a SQL file (default supabase/schema.sql) to a Postgres
// database, so `pnpm db:push` replaces pasting it into the Supabase SQL Editor. Safe to re-run.
// Needs DATABASE_URL (Supabase > Project Settings > Database > Connection string). Never commit it.
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const file = resolve(root, process.argv[2] || "supabase/schema.sql")

// DATABASE_URL from the environment, else the app's own (gitignored) env files
const fromEnvFile = (name) => {
  for (const f of [".env.local", ".env"]) {
    let line
    try { line = readFileSync(resolve(root, f), "utf8").split("\n").find((l) => l.trim().startsWith(`${name}=`)) } catch { continue }
    if (line) return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")
  }
}
const url = process.env.DATABASE_URL || fromEnvFile("DATABASE_URL")
if (!url) {
  console.error("DATABASE_URL is not set.")
  console.error("Supabase > Project Settings > Database > Connection string: copy the direct or session-pooler URI")
  console.error("(not the transaction one on :6543 - it does not run multi-statement scripts).")
  console.error("Put it in .env (gitignored) as DATABASE_URL=... and re-run `pnpm db:push`.")
  process.exit(1)
}

let sql
try { sql = readFileSync(file, "utf8") } catch { console.error(`Cannot read ${file}`); process.exit(1) }

const ssl = /sslmode=disable/.test(url) ? false : { rejectUnauthorized: false }
const client = new pg.Client({ connectionString: url, ssl })

console.log(`Applying ${file.slice(root.length + 1)} to ${url.replace(/:\/\/[^@]*@/, "://***@")}`)
try {
  await client.connect()
  await client.query(sql) // one multi-statement simple query: the file's $$ bodies are parsed server-side
  const { rows } = await client.query("select table_name from information_schema.tables where table_schema = 'public' order by 1")
  console.log(`Done. public tables: ${rows.map((r) => r.table_name).join(", ") || "(none)"}`)
} catch (e) {
  console.error(`Failed: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
