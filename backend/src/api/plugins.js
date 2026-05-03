import { Router } from "express";
import { registry } from "../plugins/registry.js";

const router = Router();
router.get("/", (_req, res) => res.json(registry.list()));
export default router;
