<script setup>
import { computed, ref, watch, nextTick, onBeforeUnmount } from "vue";
import { VueFlow, useVueFlow } from "@vue-flow/core";
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { useGraphsStore } from "../stores/graphs.js";
import { useLayout } from "./useLayout.js";

const props = defineProps({
  // "edit" — drawing the DAG while authoring (no status overlay).
  // "exec" — drawing the DAG inside an execution viewer (statuses + path).
  mode: { type: String, default: "edit" },
  parsed: { type: Object, default: null },
  nodeStatus: { type: Object, default: null },
});

// Each <GraphView> instance gets its own VueFlow scope. Without a unique id,
// multiple <VueFlow>s mounted in the DOM at the same time (e.g. the editor's
// hidden Graph tab + the execution viewer's graph) end up sharing internal
// state, which is what was preventing layout from working in the exec view.
const flowId = `vf-${Math.random().toString(36).slice(2, 9)}`;
const { fitView } = useVueFlow(flowId);
const { layout } = useLayout();

const store = useGraphsStore();
const parsed = computed(() => props.parsed || store.activeGraphTab?.parsed || null);
const nodeStatus = computed(() => props.nodeStatus || (store.activeExecTab?.nodeStatus || {}));
const isExec = computed(() => props.mode === "exec");

// VueFlow renders these. They're refs (not computeds) so dagre can mutate them
// in place after measurement.
const nodes = ref([]);
const edges = ref([]);

function rebuild() {
  const p = parsed.value;
  if (!p) { nodes.value = []; edges.value = []; return; }

  nodes.value = p.nodes.map(n => {
    const rawStatus = nodeStatus.value[n.name] || (isExec.value ? "pending" : null);
    const showStatus = isExec.value && rawStatus;
    const label = showStatus
      ? `${n.name}\n(${n.action})\n${rawStatus}`
      : `${n.name}\n(${n.action})`;
    return {
      id: n.name,
      type: "default",
      data: { label },
      position: { x: 0, y: 0 },                 // dagre overwrites on layout
      style: nodeStyle(isExec.value ? rawStatus : null),
    };
  });

  edges.value = (p.edges || []).map((e, i) => {
    const fromS = nodeStatus.value[e.from];
    const toS   = nodeStatus.value[e.to];
    const traced = isExec.value && fromS && toS && fromS !== "pending" && toS !== "pending";
    return {
      id: `e${i}`,
      source: e.from,
      target: e.to,
      animated: isExec.value && (toS === "running" || toS === "retrying"),
      style: traced
        ? { stroke: "#4f8cff", strokeWidth: 2 }
        : { stroke: "#888", strokeWidth: 1 },
    };
  });
}

// Debounced layout — gets called from BOTH:
//   (a) the watcher below, after rebuild() replaces nodes/edges
//   (b) VueFlow's @nodes-initialized event after first measurement
// Either path alone is unreliable across the editor/exec lifecycle.
let layoutTimer = null;
function scheduleLayout() {
  if (layoutTimer) clearTimeout(layoutTimer);
  layoutTimer = setTimeout(async () => {
    layoutTimer = null;
    if (!nodes.value.length) return;
    nodes.value = layout(nodes.value, edges.value, "TB");
    await nextTick();
    try { fitView({ padding: 0.15 }); } catch { /* viewport not ready yet */ }
  }, 30);
}
onBeforeUnmount(() => { if (layoutTimer) clearTimeout(layoutTimer); });

// Re-derive whenever the source DAG or its status overlay changes.
watch(
  [parsed, nodeStatus, isExec],
  () => { rebuild(); scheduleLayout(); },
  { immediate: true, deep: true },
);

function nodeStyle(status) {
  // Edit mode (status = null): neutral border so nothing implies "pending".
  if (!status) {
    return {
      
      border: "1px solid #2a3142",
      borderRadius: "6px",
      padding: "8px",
      fontSize: "11px",
      whiteSpace: "pre-line",
      width: 170,
    };
  }
  const colors = {
    success:  "#2ecc71",
    failed:   "#ff5a5f",
    skipped:  "#666",
    running:  "#f5a623",
    retrying: "#f5a623",
    pending:  "#2a3142",
  };
  return {
    
    border: `2px solid ${colors[status] || "#2a3142"}`,
    borderRadius: "6px",
    padding: "8px",
    fontSize: "11px",
    whiteSpace: "pre-line",
    width: 170,
  };
}
</script>

<template>
  <div style="height: 100%; min-height: 320px;">
    <div v-if="!parsed" class="flex flex-center text-grey" style="height: 100%;">
      <div>Validate the YAML to render the graph.</div>
    </div>
    <VueFlow
      v-else
      :id="flowId"
      :nodes="nodes"
      :edges="edges"
      fit-view-on-init
      :nodes-draggable="false"
      :nodes-connectable="false"
      :edges-updatable="false"
      :elements-selectable="false"
      :select-nodes-on-drag="false"
      :zoom-on-double-click="false"
      :prevent-scrolling="false"
      @nodes-initialized="scheduleLayout"
    >
      <Background />
      <Controls :show-interactive="false" />
    </VueFlow>
  </div>
</template>
