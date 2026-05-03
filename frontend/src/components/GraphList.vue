<script setup>
import { onMounted, onBeforeUnmount, computed } from "vue";
import { useGraphsStore } from "../stores/graphs.js";

const store = useGraphsStore();

let pollHandle = null;

onMounted(() => {
  store.loadGraphs();
  // Poll the active graph's executions every 5s.
  pollHandle = setInterval(() => store.refreshActiveGraphExecutions(), 5000);
});
onBeforeUnmount(() => { if (pollHandle) clearInterval(pollHandle); });

// ----- Flows table -----
const flowsColumns = [
  { name: "name", label: "Name", field: "name", align: "left", sortable: true },
  { name: "version", label: "Version", field: "version", align: "right", sortable: true, style: "width: 50px;" },
  {
    name: "updated", label: "Updated", field: "updated_at", align: "left", sortable: true,
    format: v => new Date(v).toLocaleString()
  },
];

// ----- Executions table -----
const historyGraphId = computed(() => {
  const t = store.activeTab;
  if (!t) return null;
  if (t.kind === "graph") return t.graphId;
  if (t.kind === "execution") return t.graphId;
  return null;
});
const historyTab = computed(() => {
  const id = historyGraphId.value;
  if (!id) return null;
  return store.tabs.find(t => t.kind === "graph" && t.graphId === id) || null;
});
const executions = computed(() => historyTab.value?.executions || []);

const execColumns = [
  {
    name: "status", label: "Status", field: "status", align: "left", sortable: true,
    style: "width: 90px;"
  },
  {
    name: "created", label: "Started", field: "created_at", align: "left", sortable: true,
    format: v => new Date(v).toLocaleString()
  },
];

function onFlowRow(_evt, row) {
  // single-click selects row; double-click opens. Quasar's row-click fires once
  // on click — we rely on row-dblclick below.
}
function onFlowDblClick(_evt, row) {
  store.openGraph(row.id);
}
function onExecRow(_evt, row) {
  store.openExecution(row.id, historyGraphId.value);
}

const activeGraphRowKey = computed(() => store.activeGraphTab?.graphId || null);
const activeExecRowKey = computed(() => store.activeExecTab?.execId || null);
</script>

<template>
  <div class="left-pane column no-wrap full-height">
    <q-list bordered separator dense class="col-grow scroll" style="border: 0;">

      <q-expansion-item dense dense-toggle default-opened label="Flows" header-class="bg-grey-11">
        <div class="q-pa-xs text-center">
          <q-btn   outline color="primary" icon="add" lable="New" size="sm" @click.stop="store.openNewGraph()">
            <q-tooltip>New flow</q-tooltip>New
          </q-btn>
        </div>


        <q-table dense flat square :rows="store.graphs" :columns="flowsColumns" row-key="id"
          :rows-per-page-options="[0]" hide-pagination hide-bottom
          :selected="activeGraphRowKey ? store.graphs.filter(g => g.id === activeGraphRowKey) : []"
          @row-click="onFlowRow" @row-dblclick="onFlowDblClick" class="dense-table"
          no-data-label="No flows yet — click + to start.">
          <template v-slot:body-cell-name="props">
            <q-td :props="props" class="cursor-pointer">
              <span :class="{ 'text-primary': props.row.id === activeGraphRowKey }">
                {{ props.row.name }}
              </span>
            </q-td>
          </template>
        </q-table>

      </q-expansion-item>

      <!-- EXECUTIONS expansion -->
      <q-expansion-item dense dense-toggle default-opened label="Executions" header-class="bg-grey-11">
        <q-table v-if="historyGraphId" dense flat square :rows="executions" :columns="execColumns" row-key="id"
          :rows-per-page-options="[0]" hide-pagination hide-bottom
          :selected="activeExecRowKey ? executions.filter(e => e.id === activeExecRowKey) : []" @row-click="onExecRow"
          class="dense-table" no-data-label="No executions yet.">
          <template v-slot:body-cell-status="props">
            <q-td :props="props" class="cursor-pointer">
              <span class="status-pill" :class="`status-${props.row.status}`">
                {{ props.row.status }}
              </span>
            </q-td>
          </template>
        </q-table>
        <div v-else class="q-pa-sm text-caption text-grey">
          Open a flow on the right to see its executions.
        </div>
      </q-expansion-item>
    </q-list>
  </div>
</template>

<style scoped>
.left-pane {
  height: 100%;
}

.dense-table :deep(thead th) {
  font-size: 11px;
  color: var(--muted);
}

.dense-table :deep(tbody td) {
  font-size: 12px;
}
 

.dense-table :deep(tr) {
  cursor: pointer;
}
 
</style>
