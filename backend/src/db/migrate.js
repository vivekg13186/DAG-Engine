import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";
import { log } from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations");

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function applied() {
  const { rows } = await pool.query("SELECT id FROM schema_migrations ORDER BY id");
  return new Set(rows.map(r => r.id));
}

async function run() {
  await ensureTable();
  const done = await applied();
  const files = (await readdir(MIGRATIONS_DIR)).filter(f => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (done.has(f)) {
      log.debug("migration already applied", { file: f });
      continue;
    }
    const sql = await readFile(path.join(MIGRATIONS_DIR, f), "utf8");
    log.info("applying migration", { file: f });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(id) VALUES ($1)", [f]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      log.error("migration failed", { file: f, error: e.message });
      throw e;
    } finally {
      client.release();
    }
  }
  log.info("migrations complete", { count: files.length });
  await pool.end();
}

run().catch(e => {
  log.error("migrate failed", { error: e.message });
  process.exit(1);
});
