import { Router } from "express";
import { pool } from "../db/pool.js";
import { NotFoundError } from "../utils/errors.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const { graphId, limit = 50 } = req.query;
    const params = [];
    let where = "";
    if (graphId) { params.push(graphId); where = "WHERE graph_id=$1"; }
    params.push(Math.min(parseInt(limit, 10) || 50, 200));
    const { rows } = await pool.query(
      `SELECT id, graph_id, status, started_at, finished_at, created_at, error
       FROM executions ${where}
       ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { rows: execs } = await pool.query(
      "SELECT * FROM executions WHERE id=$1", [req.params.id],
    );
    if (execs.length === 0) throw new NotFoundError("execution");

    // The worker writes one row per status event (running, retrying,
    // success/failed/skipped). For the UI we only want the LATEST state per
    // node — so a node currently running shows as "running", and a finished
    // node shows as "success" (not both). Inner DISTINCT ON picks the latest
    // row per node_name; outer ORDER BY puts them back in execution order.
    const { rows: logs } = await pool.query(
      `SELECT * FROM (
         SELECT DISTINCT ON (node_name)
           id, node_name, status, attempt, input, output, error, started_at, finished_at
         FROM node_logs
         WHERE execution_id = $1
         ORDER BY node_name,
                  COALESCE(finished_at, started_at) DESC NULLS LAST,
                  attempt DESC,
                  id DESC
       ) latest
       ORDER BY COALESCE(latest.started_at, latest.finished_at) ASC NULLS LAST,
                latest.id ASC`,
      [req.params.id],
    );
    res.json({ ...execs[0], nodeLogs: logs });
  } catch (e) { next(e); }
});

/** DELETE /executions/:id — remove an execution and its node_logs (cascade). */
router.delete("/:id", async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM executions WHERE id=$1", [req.params.id],
    );
    if (rowCount === 0) throw new NotFoundError("execution");
    res.status(200).json({ ok: true, id: req.params.id, deleted: "execution" });
  } catch (e) { next(e); }
});

export default router;
