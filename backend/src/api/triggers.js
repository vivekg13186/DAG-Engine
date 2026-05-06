import { Router } from "express";
import { v4 as uuid } from "uuid";
import { pool } from "../db/pool.js";
import { triggerRegistry } from "../triggers/registry.js";
import { syncTrigger, activeCount } from "../triggers/manager.js";
import { ValidationError, NotFoundError } from "../utils/errors.js";

const router = Router();

router.get("/types", (_req, res) => {
  res.json({ active: activeCount(), types: triggerRegistry.list() });
});

router.get("/", async (req, res, next) => {
  try {
    const params = [];
    let where = "";
    if (req.query.graphId) { params.push(req.query.graphId); where = "WHERE graph_id=$1"; }
    const { rows } = await pool.query(
      `SELECT id, name, graph_id, type, config, enabled, last_fired_at, last_error, fire_count, created_at, updated_at
       FROM triggers ${where}
       ORDER BY created_at DESC`,
      params,
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM triggers WHERE id=$1", [req.params.id]);
    if (rows.length === 0) throw new NotFoundError("trigger");
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const { name, graphId, type, config = {}, enabled = true } = req.body || {};
    if (!name || !graphId || !type) {
      throw new ValidationError("name, graphId, and type are required");
    }
    triggerRegistry.validateConfig(type, config);
    // Verify graph exists.
    const { rows: gs } = await pool.query("SELECT id FROM graphs WHERE id=$1", [graphId]);
    if (gs.length === 0) throw new ValidationError(`graph ${graphId} not found`);

    const id = uuid();
    await pool.query(
      `INSERT INTO triggers (id, name, graph_id, type, config, enabled)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, name, graphId, type, JSON.stringify(config), Boolean(enabled)],
    );
    if (enabled) await syncTrigger(id);
    res.status(201).json({ id });
  } catch (e) { next(e); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const { name, config, enabled } = req.body || {};
    const { rows: existing } = await pool.query("SELECT type FROM triggers WHERE id=$1", [req.params.id]);
    if (existing.length === 0) throw new NotFoundError("trigger");
    if (config !== undefined) triggerRegistry.validateConfig(existing[0].type, config);

    const sets = [], params = [];
    if (name      !== undefined) { params.push(name);                      sets.push(`name = $${params.length}`); }
    if (config    !== undefined) { params.push(JSON.stringify(config));    sets.push(`config = $${params.length}::jsonb`); }
    if (enabled   !== undefined) { params.push(Boolean(enabled));          sets.push(`enabled = $${params.length}`); }
    if (sets.length === 0) return res.json({ id: req.params.id, updated: false });
    params.push(req.params.id);
    sets.push("updated_at = NOW()");
    await pool.query(`UPDATE triggers SET ${sets.join(", ")} WHERE id = $${params.length}`, params);

    await syncTrigger(req.params.id);
    res.json({ id: req.params.id, updated: true });
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM triggers WHERE id=$1", [req.params.id]);
    if (rowCount === 0) throw new NotFoundError("trigger");
    await syncTrigger(req.params.id);   // will stop the live subscription
    res.status(200).json({ ok: true, id: req.params.id, deleted: "trigger" });
  } catch (e) { next(e); }
});

export default router;
