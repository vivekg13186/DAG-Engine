// Tweakpane v4 plugin: editable list of objects.
//
// Registered via `pane.registerPlugin(ObjectListPlugin)` and consumed as:
//
//   pane.addBinding(obj, "queries", {
//     view: "objectList",
//     label: "queries",
//     itemSchema: <JSON Schema for one item>,
//   });
//
// `view: "objectList"` selects this plugin via accept(). The `itemSchema`
// param is a JSON Schema object (the same shape we already have on plugin
// `inputSchema.properties.<key>.items`) — its `properties`/`required`/
// `enum`/`default` drive the per-row editor.
//
// Each array item is rendered as its own collapsible card:
//
//     ┌─ Item 1 ───────────────────  × ┐
//     │ name     [____________________]│
//     │ type     [css ▾]               │
//     │ selector [____________________]│
//     │ extract  [text ▾]              │
//     │ attr     [____________________]│
//     │ all      [□]                   │
//     └────────────────────────────────┘
//     [+ add item]
//
// Editing any sub-field writes a fresh array back through the bound
// Value, so Tweakpane's normal change events fire on the host pane.
//
// We deliberately avoid importing `@tweakpane/core` so this plugin only
// depends on the public `tweakpane` package surface.

const VIEW_ID = "objectList";

// ──────────────────────────────────────────────────────────────────────────
// Equality + cloning helpers
// ──────────────────────────────────────────────────────────────────────────
function deepClone(v) {
  if (v == null) return v;
  if (Array.isArray(v))    return v.map(deepClone);
  if (typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v)) out[k] = deepClone(v[k]);
    return out;
  }
  return v;
}
function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a === "object") {
    const ak = Object.keys(a), bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every(k => deepEqual(a[k], b[k]));
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────────────
// Field renderers (one per JSON Schema field type)
//
// Each renderer returns an HTMLElement and accepts:
//   doc       — document for createElement
//   def       — JSON Schema for this field (from itemSchema.properties[k])
//   value     — current value
//   onChange  — (next) => void; writes the new value back
// ──────────────────────────────────────────────────────────────────────────

function renderText(doc, def, value, onChange) {
  const input = doc.createElement("input");
  input.type = "text";
  input.className = "tp-ol-input";
  input.value = value ?? "";
  input.placeholder = def.description || "";
  input.addEventListener("input", () => onChange(input.value));
  return input;
}

function renderNumber(doc, def, value, onChange) {
  const input = doc.createElement("input");
  input.type = "number";
  input.className = "tp-ol-input";
  if (def.minimum !== undefined) input.min = String(def.minimum);
  if (def.maximum !== undefined) input.max = String(def.maximum);
  if (def.type === "integer") input.step = "1";
  input.value = value ?? "";
  input.addEventListener("input", () => {
    const n = input.value === "" ? null : Number(input.value);
    onChange(Number.isNaN(n) ? null : n);
  });
  return input;
}

function renderBoolean(doc, _def, value, onChange) {
  // A real-looking checkbox to match the rest of the row visually.
  const wrap = doc.createElement("label");
  wrap.className = "tp-ol-checkwrap";
  const cb = doc.createElement("input");
  cb.type = "checkbox";
  cb.className = "tp-ol-checkbox";
  cb.checked = !!value;
  cb.addEventListener("change", () => onChange(cb.checked));
  wrap.appendChild(cb);
  return wrap;
}

function renderEnum(doc, def, value, onChange) {
  const sel = doc.createElement("select");
  sel.className = "tp-ol-select";
  // Allow "no choice" for non-required enums.
  if (!def.__required) {
    const empty = doc.createElement("option");
    empty.value = "";
    empty.textContent = "—";
    sel.appendChild(empty);
  }
  for (const opt of def.enum) {
    const o = doc.createElement("option");
    o.value = String(opt);
    o.textContent = String(opt);
    if (value === opt) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener("change", () => {
    onChange(sel.value === "" ? undefined : sel.value);
  });
  return sel;
}

/** Pick the right renderer based on the schema definition. */
function renderField(doc, def, value, onChange) {
  if (Array.isArray(def.enum)) return renderEnum(doc, def, value, onChange);
  if (def.type === "boolean")  return renderBoolean(doc, def, value, onChange);
  if (def.type === "integer" || def.type === "number") {
    return renderNumber(doc, def, value, onChange);
  }
  return renderText(doc, def, value, onChange);
}

/** Default value for a freshly-added item field. */
function defaultFor(def) {
  if (def.default !== undefined) return def.default;
  if (Array.isArray(def.enum))   return undefined;       // no preselect
  if (def.type === "boolean")    return false;
  if (def.type === "integer" || def.type === "number") return 0;
  return "";
}

// ──────────────────────────────────────────────────────────────────────────
// View — owns the DOM. Rebuilds on any external value update so we never
// leak rows between successive bindings (e.g. selecting a different node).
// ──────────────────────────────────────────────────────────────────────────
class ObjectListView {
  constructor(doc, opts) {
    this.doc = doc;
    this.value = opts.value;
    this.label = opts.label || "list";
    this.itemSchema = opts.itemSchema || { type: "object", properties: {} };

    const root = doc.createElement("div");
    root.className = "tp-ol";

    const labelEl = doc.createElement("div");
    labelEl.className = "tp-ol-label";
    labelEl.textContent = this.label;

    this.body = doc.createElement("div");
    this.body.className = "tp-ol-body";

    this.itemsEl = doc.createElement("div");
    this.itemsEl.className = "tp-ol-items";

    const addBtn = doc.createElement("button");
    addBtn.type = "button";
    addBtn.className = "tp-ol-add";
    addBtn.textContent = "+ add item";
    addBtn.addEventListener("click", () => {
      const item = this.makeDefaultItem();
      const next = [...(this.value.rawValue || []), item];
      this.value.setRawValue(next);
    });

    this.body.appendChild(this.itemsEl);
    this.body.appendChild(addBtn);

    root.appendChild(labelEl);
    root.appendChild(this.body);

    this.element = root;
    this.refresh();

    // Re-render whenever the host pushes a new value (different node
    // selected, JSON edit elsewhere, etc.).
    this._onValueChange = () => this.refresh();
    this.value.emitter.on("change", this._onValueChange);
  }

  dispose() {
    if (this._onValueChange) {
      try { this.value.emitter.off("change", this._onValueChange); }
      catch { /* older Tweakpane builds */ }
      this._onValueChange = null;
    }
  }

  makeDefaultItem() {
    const props = this.itemSchema.properties || {};
    const required = new Set(this.itemSchema.required || []);
    const item = {};
    for (const [k, def] of Object.entries(props)) {
      if (required.has(k) || def.default !== undefined) {
        item[k] = defaultFor(def);
      }
    }
    return item;
  }

  refresh() {
    const list = Array.isArray(this.value.rawValue) ? this.value.rawValue : [];
    this.itemsEl.replaceChildren();
    list.forEach((item, idx) => {
      this.itemsEl.appendChild(this.renderItem(item ?? {}, idx));
    });
  }

  /** One card per array item. */
  renderItem(item, idx) {
    const doc = this.doc;
    const props = this.itemSchema.properties || {};
    const required = new Set(this.itemSchema.required || []);

    const card = doc.createElement("div");
    card.className = "tp-ol-card";

    // Header with item title + remove button.
    const head = doc.createElement("div");
    head.className = "tp-ol-card-head";

    const title = doc.createElement("div");
    title.className = "tp-ol-card-title";
    // Use the first present "name-ish" field as the item label, falling back
    // to "Item N". This keeps the header informative when the user has filled
    // in a meaningful name.
    title.textContent = pickItemTitle(item, props, idx);

    const del = doc.createElement("button");
    del.type = "button";
    del.className = "tp-ol-remove";
    del.title = "Remove item";
    del.textContent = "×";
    del.addEventListener("click", () => {
      const arr = [...(this.value.rawValue || [])];
      arr.splice(idx, 1);
      this.value.setRawValue(arr);
    });

    head.appendChild(title);
    head.appendChild(del);
    card.appendChild(head);

    // Fields grid — one row per schema property.
    const grid = doc.createElement("div");
    grid.className = "tp-ol-fields";

    for (const [key, defRaw] of Object.entries(props)) {
      // Smuggle the required flag through to the renderer (used to suppress
      // the "—" empty option on enum selects).
      const def = { ...defRaw, __required: required.has(key) };

      const row = doc.createElement("div");
      row.className = "tp-ol-row";

      const lab = doc.createElement("div");
      lab.className = "tp-ol-row-label";
      lab.textContent = required.has(key) ? `${key} *` : key;

      const ctrl = renderField(doc, def, item[key], (next) => {
        const arr = [...(this.value.rawValue || [])];
        const obj = { ...(arr[idx] || {}) };
        if (next === undefined || next === "" || next === null) {
          delete obj[key];
        } else {
          obj[key] = next;
        }
        arr[idx] = obj;
        this.value.setRawValue(arr);
      });

      row.appendChild(lab);
      row.appendChild(ctrl);
      grid.appendChild(row);
    }

    card.appendChild(grid);
    return card;
  }
}

function pickItemTitle(item, props, idx) {
  // Prefer fields that look like identifiers, in this order.
  for (const k of ["name", "title", "id", "key"]) {
    if (props[k] && item[k]) return String(item[k]);
  }
  return `Item ${idx + 1}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Controller — Tweakpane's bridge between Value and View.
// ──────────────────────────────────────────────────────────────────────────
class ObjectListController {
  constructor(doc, args) {
    this.value     = args.value;
    this.viewProps = args.viewProps;
    this.view = new ObjectListView(doc, {
      value: args.value,
      label: args.label,
      itemSchema: args.itemSchema,
    });
    if (typeof args.viewProps?.handleDispose === "function") {
      args.viewProps.handleDispose(() => this.view.dispose?.());
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Individual InputBindingPlugin descriptor.
// ──────────────────────────────────────────────────────────────────────────
// `core` declares the @tweakpane/core API version this plugin targets.
// Tweakpane runs Semver.isCompatible(core, embeddedCore) before registering;
// for 1.x+ majors the check passes when majors match. tweakpane@4.x bundles
// @tweakpane/core@2.x, so "2.0.0" is the right value here.
const TP_CORE_VERSION = "2.0.0";

const ObjectListInputPlugin = {
  id: "input-object-list",
  type: "input",
  core: TP_CORE_VERSION,

  accept(value, params) {
    if (!Array.isArray(value)) return null;
    if (params?.view !== VIEW_ID) return null;
    // The itemSchema is required — without it we can't render rows.
    if (!params.itemSchema || typeof params.itemSchema !== "object") return null;
    return {
      initialValue: value.map(deepClone),
      params: {
        view: VIEW_ID,
        label: params.label,
        itemSchema: params.itemSchema,
      },
    };
  },

  binding: {
    reader: () => (v) => Array.isArray(v) ? v.map(deepClone) : [],
    writer: () => (target, v) => target.write(Array.isArray(v) ? v.map(deepClone) : []),
    equals: deepEqual,
  },

  controller: (args) => new ObjectListController(args.document, {
    value:      args.value,
    viewProps:  args.viewProps,
    label:      args.params.label,
    itemSchema: args.params.itemSchema,
  }),
};

/**
 * Tweakpane v4 expects `pane.registerPlugin()` to receive a plugin bundle
 * (an object with `id` + a `plugins` array). We wrap the descriptor so it
 * registers correctly.
 */
export const ObjectListPlugin = {
  id: "@dag-engine/object-list-plugin",
  plugins: [ObjectListInputPlugin],
};
