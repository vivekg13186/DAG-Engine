import { Router } from "express";
import { v4 as uuid } from "uuid";
import { pool, withTx } from "../db/pool.js";
import { parseDag } from "../dsl/parser.js";
import { enqueueExecution } from "../queue/queue.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";

const router = Router();

/** GET /graphs — list latest version of each non-deleted graph. */
router.get("/", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (name) id, name, version, created_at, updated_at
      FROM graphs
      WHERE deleted_at IS NULL
      ORDER BY name, version DESC
    `);
    res.json(rows);
  } catch (e) { next(e); }
});

/** GET /graphs/:id — full graph row. */
router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM graphs WHERE id=$1", [req.params.id]);
    if (rows.length === 0) throw new NotFoundError("graph");
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/** POST /graphs/validate — parse + validate without saving. */
router.post("/validate", async (req, res, next) => {
  try {
    const { yaml } = req.body || {};
    if (!yaml) throw new ValidationError("yaml field required");
    const parsed = parseDag(yaml);
    res.json({ valid: true, parsed });
  } catch (e) { next(e); }
});

/** POST /graphs — create a new graph (version 1) or new version of an existing name. */
router.post("/", async (req, res, next) => {
  try {
    const { yaml } = req.body || {};
    if (!yaml) throw new ValidationError("yaml field required");
    const parsed = parseDag(yaml);

    const out = await withTx(async (c) => {
      const { rows: existing } = await c.query(
        "SELECT MAX(version) AS v FROM graphs WHERE name=$1",
        [parsed.name],
      );
      const nextVersion = (existing[0].v || 0) + 1;
      const id = uuid();
      await c.query(
        `INSERT INTO graphs (id, name, version, yaml, parsed)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, parsed.name, nextVersion, yaml, JSON.stringify(parsed)],
      );
      return { id, name: parsed.name, version: nextVersion };
    });
    res.status(201).json(out);
  } catch (e) { next(e); }
});

/** PUT /graphs/:id — bumps version (preserves history). */
router.put("/:id", async (req, res, next) => {
  try {
    const { yaml } = req.body || {};
    if (!yaml) throw new ValidationError("yaml field required");
    const parsed = parseDag(yaml);

    const out = await withTx(async (c) => {
      const { rows: existing } = await c.query(
        "SELECT name FROM graphs WHERE id=$1", [req.params.id],
      );
      if (existing.length === 0) throw new NotFoundError("graph");
      const name = existing[0].name;
      if (name !== parsed.name) {
        throw new ValidationError(`graph name mismatch: existing="${name}", yaml="${parsed.name}"`);
      }
      const { rows: maxV } = await c.query(
        "SELECT MAX(version) AS v FROM graphs WHERE name=$1", [name],
      );
      const nextVersion = (maxV[0].v || 0) + 1;
      const id = uuid();
      await c.query(
        `INSERT INTO graphs (id, name, version, yaml, parsed)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, name, nextVersion, yaml, JSON.stringify(parsed)],
      );
      return { id, name, version: nextVersion };
    });
    res.json(out);
  } catch (e) { next(e); }
});

/** DELETE /graphs/:id — soft delete this version. */
router.delete("/:id", async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      "UPDATE graphs SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL",
      [req.params.id],
    );
    if (rowCount === 0) throw new NotFoundError("graph");
    res.status(200).json({ ok: true, id: req.params.id, deleted: "graph" });
  } catch (e) { next(e); }
});

/** POST /graphs/:id/execute — enqueue an execution. */
router.post("/:id/execute", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT id FROM graphs WHERE id=$1", [req.params.id]);
    if (rows.length === 0) throw new NotFoundError("graph");

    const execId = uuid();
    const userInput = req.body?.context || {};
    // Store the user-supplied JSON in `inputs` (preserved for the lifetime of
    // the execution row). `context` will be overwritten with the final engine
    // ctx when the worker finishes.
    await pool.query(
      `INSERT INTO executions (id, graph_id, status, inputs, context)
       VALUES ($1,$2,'queued',$3,'{}'::jsonb)`,
      [execId, req.params.id, JSON.stringify(userInput)],
    );
    await enqueueExecution({ executionId: execId, graphId: req.params.id });
    res.status(202).json({ executionId: execId, status: "queued" });
  } catch (e) { next(e); }
});

export default router;
