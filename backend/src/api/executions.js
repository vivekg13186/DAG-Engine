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
    const { rows: logs } = await pool.query(
      `SELECT id, node_name, status, attempt, input, output, error, started_at, finished_at
       FROM node_logs WHERE execution_id=$1
       ORDER BY COALESCE(started_at, finished_at) ASC, id ASC`,
      [req.params.id],
    );
    res.json({ ...execs[0], nodeLogs: logs });
  } catch (e) { next(e); }
});

export default router;
