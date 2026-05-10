// Memory REST endpoint — inspect / write / delete entries from any UI
// or external integration. Mirrors the helpers in engine/memoryStore.js
// for one-off use; workflows should use the memory.* plugins instead.
//
//   GET    /memory?scope=workflow&id=<uuid>&namespace=kv&prefix=user
//   GET    /memory/:id
//   POST   /memory                     body: { scope, scopeId, namespace, key, value }
//   DELETE /memory/:id
//   DELETE /memory                     body: { scope, scopeId, namespace, key } (clear KV row)
//   POST   /memory/history/load        body: { scope, scopeId, conversationId, limit }
//   POST   /memory/history/clear       body: { scope, scopeId, conversationId }

import { Router } from "express";
import { pool } from "../db/pool.js";
import { ValidationError, NotFoundError } from "../utils/errors.js";
import {
  setKv, deleteKv, listMemories,
  loadHistory, clearHistory,
} from "../engine/memoryStore.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const rows = await listMemories({
      scope:     req.query.scope,
      scopeId:   req.query.id || req.query.scopeId,
      namespace: req.query.namespace,
      prefix:    req.query.prefix,
      limit:     req.query.limit,
    });
    res.json(rows);
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM memories WHERE id=$1", [req.params.id]);
    if (rows.length === 0) throw new NotFoundError("memory");
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const { scope = "workflow", scopeId, namespace = "kv", key, value } = req.body || {};
    if (!key || value === undefined) {
      throw new ValidationError("key and value are required");
    }
    await setKv({ scope, scopeId, namespace, key, value });
    res.status(201).json({ ok: true, scope, scopeId: scopeId || null, namespace, key });
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM memories WHERE id=$1", [req.params.id]);
    if (rowCount === 0) throw new NotFoundError("memory");
    res.status(200).json({ ok: true, id: req.params.id });
  } catch (e) { next(e); }
});

router.delete("/", async (req, res, next) => {
  try {
    const { scope = "workflow", scopeId, namespace = "kv", key } = req.body || {};
    if (!key) throw new ValidationError("body.key is required");
    const removed = await deleteKv({ scope, scopeId, namespace, key });
    res.status(200).json({ ok: true, removed });
  } catch (e) { next(e); }
});

router.post("/history/load", async (req, res, next) => {
  try {
    const { scope = "workflow", scopeId, conversationId, limit = 20 } = req.body || {};
    if (!conversationId) throw new ValidationError("body.conversationId is required");
    const turns = await loadHistory({ scope, scopeId, conversationId, limit });
    res.json({ turns });
  } catch (e) { next(e); }
});

router.post("/history/clear", async (req, res, next) => {
  try {
    const { scope = "workflow", scopeId, conversationId } = req.body || {};
    if (!conversationId) throw new ValidationError("body.conversationId is required");
    const removed = await clearHistory({ scope, scopeId, conversationId });
    res.status(200).json({ ok: true, removed });
  } catch (e) { next(e); }
});

export default router;
