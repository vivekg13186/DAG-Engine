import { Router } from "express";
import { v4 as uuid } from "uuid";
import { pool } from "../db/pool.js";
import { ValidationError, NotFoundError } from "../utils/errors.js";

const router = Router();

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

router.get("/", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, key, value, description, secret, created_at, updated_at FROM configs ORDER BY key"
    );
    // Mask secret values in the list response (full value still available via /:id).
    res.json(rows.map(r => r.secret ? { ...r, value: "***" } : r));
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM configs WHERE id=$1", [req.params.id]);
    if (rows.length === 0) throw new NotFoundError("config");
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const { key, value = null, description = "", secret = false } = req.body || {};
    if (!key) throw new ValidationError("key required");
    if (!KEY_RE.test(key)) throw new ValidationError(`invalid key: ${key}`);
    const id = uuid();
    try {
      await pool.query(
        "INSERT INTO configs (id, key, value, description, secret) VALUES ($1,$2,$3,$4,$5)",
        [id, key, JSON.stringify(value), description, !!secret],
      );
    } catch (e) {
      if (e.code === "23505") throw new ValidationError(`config key "${key}" already exists`);
      throw e;
    }
    res.status(201).json({ id, key });
  } catch (e) { next(e); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const { value, description, secret } = req.body || {};
    const sets = [], params = [];
    if (value       !== undefined) { params.push(JSON.stringify(value));    sets.push(`value = $${params.length}::jsonb`); }
    if (description !== undefined) { params.push(description);              sets.push(`description = $${params.length}`); }
    if (secret      !== undefined) { params.push(!!secret);                 sets.push(`secret = $${params.length}`); }
    if (sets.length === 0) return res.json({ id: req.params.id, updated: false });
    params.push(req.params.id);
    sets.push("updated_at = NOW()");
    const { rowCount } = await pool.query(
      `UPDATE configs SET ${sets.join(", ")} WHERE id = $${params.length}`, params,
    );
    if (rowCount === 0) throw new NotFoundError("config");
    res.json({ id: req.params.id, updated: true });
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM configs WHERE id=$1", [req.params.id]);
    if (rowCount === 0) throw new NotFoundError("config");
    res.status(200).json({ ok: true, id: req.params.id, deleted: "config" });
  } catch (e) { next(e); }
});

/** Helper for the worker: load all configs as a flat { key: value } map. */
export async function loadAllConfigs() {
  const { rows } = await pool.query("SELECT key, value FROM configs");
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export default router;
