import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { log } from "../utils/logger.js";

const ajv = new Ajv({ allErrors: true, coerceTypes: true, useDefaults: true, strict: false });
addFormats(ajv);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class PluginRegistry {
  constructor() { this.plugins = new Map(); }

  register(plugin) {
    if (!plugin || typeof plugin !== "object" || !plugin.name) {
      throw new Error("Plugin must export an object with a 'name'.");
    }
    if (typeof plugin.execute !== "function") {
      throw new Error(`Plugin "${plugin.name}" missing async execute(input, ctx).`);
    }
    const validateInput  = plugin.inputSchema  ? ajv.compile(plugin.inputSchema)  : null;
    const validateOutput = plugin.outputSchema ? ajv.compile(plugin.outputSchema) : null;
    this.plugins.set(plugin.name, { ...plugin, validateInput, validateOutput });
    log.info("plugin registered", { name: plugin.name });
  }

  get(name) {
    const p = this.plugins.get(name);
    if (!p) throw new Error(`Unknown action "${name}"`);
    return p;
  }

  list() {
    return [...this.plugins.values()].map(p => ({
      name: p.name,
      description: p.description,
      inputSchema: p.inputSchema,
      outputSchema: p.outputSchema,
    }));
  }

  async invoke(name, input, ctx) {
    const p = this.get(name);
    if (p.validateInput && !p.validateInput(input)) {
      const errs = p.validateInput.errors.map(e => `${e.instancePath} ${e.message}`).join("; ");
      throw new Error(`Plugin "${name}" input invalid: ${errs}`);
    }
    const output = await p.execute(input, ctx);
    if (p.validateOutput && !p.validateOutput(output)) {
      const errs = p.validateOutput.errors.map(e => `${e.instancePath} ${e.message}`).join("; ");
      throw new Error(`Plugin "${name}" output invalid: ${errs}`);
    }
    return output;
  }
}

export const registry = new PluginRegistry();

/** Auto-load every plugin file under src/plugins/builtin/ + plugins-extra/ */
export async function loadBuiltins() {
  const dirs = [
    path.resolve(__dirname, "builtin"),
    path.resolve(__dirname, "../../plugins-extra"),
  ];
  for (const dir of dirs) {
    let files;
    try { files = await readdir(dir); }
    catch { continue; }
    for (const f of files) {
      if (!f.endsWith(".js")) continue;
      const mod = await import(pathToFileURL(path.join(dir, f)).href);
      registry.register(mod.default || mod.plugin);
    }
  }
}
