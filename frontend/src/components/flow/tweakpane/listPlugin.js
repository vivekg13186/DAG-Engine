// Tweakpane v4 plugin: editable list of strings.
//
// Registered via `pane.registerPlugin(ListPlugin)` and consumed as:
//
//     pane.addBinding(obj, "to", { view: "list", label: "to" });
//
// `view: "list"` selects this plugin via accept(). The plugin only matches
// when the bound value is an Array (any other type falls through to the
// built-in input plugins). Items are rendered one row per string with
// per-row remove buttons and a single add button below. Editing any field
// writes a fresh array back to the bound object so Tweakpane's normal
// change events fire.
//
// We deliberately avoid importing `@tweakpane/core` so this plugin only
// depends on the public `tweakpane` package surface. The plugin shape
// mirrors what TpPluginBundle expects for an "input" plugin — a small
// reader/writer/equals pair plus a controller factory.

const VIEW_ID = "list";

/** Compare two arrays for shallow string equality (Tweakpane equality fn). */
function listsEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Build the DOM for one row of the list. */
function makeRow(doc, value, onChange, onRemove) {
  const row = doc.createElement("div");
  row.className = "tp-list-row";

  const input = doc.createElement("input");
  input.type = "text";
  input.value = value;
  input.className = "tp-list-input";
  input.addEventListener("input", () => onChange(input.value));

  const del = doc.createElement("button");
  del.type = "button";
  del.className = "tp-list-remove";
  del.title = "Remove";
  del.textContent = "×";
  del.addEventListener("click", onRemove);

  row.appendChild(input);
  row.appendChild(del);
  return row;
}

/**
 * View — owns the DOM for a single list binding. Tweakpane controllers are
 * "render the value, listen for changes" objects; we keep the bound array
 * in `value` and rebuild rows whenever the value changes externally
 * (e.g. when a different node is selected and the panel is reused).
 */
class ListView {
  constructor(doc, opts) {
    this.doc = doc;
    this.value = opts.value;            // Tweakpane Value<string[]>
    this.label = opts.label || "list";

    const root = doc.createElement("div");
    root.className = "tp-list";

    // Tweakpane labels its built-in inputs with a left-side caption. To
    // match, we render the same two-column layout: caption on the left,
    // the editor on the right.
    const labelEl = doc.createElement("div");
    labelEl.className = "tp-list-label";
    labelEl.textContent = this.label;

    const editor = doc.createElement("div");
    editor.className = "tp-list-editor";

    this.rowsEl = doc.createElement("div");
    this.rowsEl.className = "tp-list-rows";

    const addBtn = doc.createElement("button");
    addBtn.type = "button";
    addBtn.className = "tp-list-add";
    addBtn.textContent = "+ add";
    addBtn.addEventListener("click", () => {
      const next = [...(this.value.rawValue || []), ""];
      this.value.setRawValue(next);
    });

    editor.appendChild(this.rowsEl);
    editor.appendChild(addBtn);

    root.appendChild(labelEl);
    root.appendChild(editor);

    this.element = root;
    this.refresh();

    // Listen for external value updates (e.g. another node was selected).
    // Hold the bound function so we can detach later if Tweakpane disposes us.
    this._onValueChange = () => this.refresh();
    this.value.emitter.on("change", this._onValueChange);
  }

  dispose() {
    if (this._onValueChange) {
      try { this.value.emitter.off("change", this._onValueChange); }
      catch { /* older Tweakpane builds expose only on() */ }
      this._onValueChange = null;
    }
  }

  refresh() {
    const list = Array.isArray(this.value.rawValue) ? this.value.rawValue : [];
    this.rowsEl.replaceChildren();
    list.forEach((item, idx) => {
      const row = makeRow(
        this.doc,
        item ?? "",
        (next) => {
          const arr = [...(this.value.rawValue || [])];
          arr[idx] = next;
          this.value.setRawValue(arr);
        },
        () => {
          const arr = [...(this.value.rawValue || [])];
          arr.splice(idx, 1);
          this.value.setRawValue(arr);
        },
      );
      this.rowsEl.appendChild(row);
    });
  }
}

/**
 * Controller — Tweakpane's bridge between the bound Value and the View.
 * For a custom plugin the only required surface is `view` (DOM access)
 * and `viewProps` (theming hooks). We pass `value` straight through so the
 * pane's reader/writer can read/write through it.
 */
class ListController {
  constructor(doc, args) {
    this.value     = args.value;
    this.viewProps = args.viewProps;
    this.view = new ListView(doc, {
      value: args.value,
      label: args.label,
    });
    // Tweakpane's binding controllers expose viewProps.handleDispose so any
    // Disposable can hook in. If it's available, detach our value-change
    // listener so it doesn't leak when the pane is rebuilt.
    if (typeof args.viewProps?.handleDispose === "function") {
      args.viewProps.handleDispose(() => this.view.dispose?.());
    }
  }
}

/**
 * The individual InputBindingPlugin descriptor.
 *
 * `accept` is called for every addBinding(). We return null when the
 * binding is not for us, otherwise an object describing the matched
 * params. `binding.{reader,writer,equals}` define how the bound value
 * round-trips between the host object and Tweakpane's internal Value.
 */
// `core` declares the @tweakpane/core API version this plugin targets.
// Tweakpane runs Semver.isCompatible(core, embeddedCore) before registering;
// for 1.x+ majors the check passes when majors match. tweakpane@4.x bundles
// @tweakpane/core@2.x, so "2.0.0" is the right value here.
const TP_CORE_VERSION = "2.0.0";

const ListInputPlugin = {
  id: "input-string-list",
  type: "input",
  core: TP_CORE_VERSION,

  accept(value, params) {
    if (!Array.isArray(value)) return null;
    if (params?.view !== VIEW_ID) return null;
    return {
      initialValue: value.map(v => String(v ?? "")),
      params: { view: VIEW_ID, label: params.label },
    };
  },

  binding: {
    reader: () => (v) => Array.isArray(v) ? v.map(x => String(x ?? "")) : [],
    writer: () => (target, v) => target.write(Array.isArray(v) ? v : []),
    equals: listsEqual,
  },

  controller: (args) => new ListController(args.document, {
    value:     args.value,
    viewProps: args.viewProps,
    label:     args.params.label,
  }),
};

/**
 * Tweakpane v4's `pane.registerPlugin()` expects a *plugin bundle*, not a
 * raw plugin descriptor. A bundle is just an object with a stable `id` and
 * a `plugins` array of one-or-more descriptors. We export the bundle as
 * the default + a named export named `ListPlugin` (matching the existing
 * call site in PluginPropertyPanel.vue).
 */
export const ListPlugin = {
  id: "@dag-engine/list-plugin",
  plugins: [ListInputPlugin],
};
