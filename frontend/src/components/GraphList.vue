<script setup>
import { onMounted, onBeforeUnmount, computed, ref } from "vue";
import { useQuasar } from "quasar";
import { useGraphsStore } from "../stores/graphs.js";
import { AI } from "../api/client.js";
import AskAIDialog from "./AskAIDialog.vue";
import TriggerDialog from "./TriggerDialog.vue";

const store = useGraphsStore();
const $q = useQuasar();

let pollHandle = null;
const aiOpen = ref(false);
const aiConfigured = ref(false);

const triggerDialogOpen = ref(false);
const editingTrigger = ref(null);

onMounted(async () => {
  store.loadGraphs();
  store.loadPlugins();         // cached for the YAML editor autocomplete
  store.loadTriggers();
  store.loadTriggerTypes();
  // Poll active graph's executions + the trigger list every 5s.
  pollHandle = setInterval(() => {
    store.refreshActiveGraphExecutions();
    store.loadTriggers();
  }, 5000);
  // Probe whether AI is configured (hides the button if not).
  try { aiConfigured.value = (await AI.status()).configured; }
  catch { aiConfigured.value = false; }
});
onBeforeUnmount(() => { if (pollHandle) clearInterval(pollHandle); });

// ----- Flows table -----
const flowsColumns = [
  {
    name: "action", label: ""
  },
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
    name: "action", label: ""
  },
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

function confirm(message) {
  return new Promise((resolve) => {
    $q.dialog({
      title: "Confirm delete",
      message,
      persistent: true,
      ok:     { label: "Delete", color: "negative", unelevated: true, "no-caps": true },
      cancel: { label: "Cancel", flat: true, "no-caps": true },
    })
      .onOk(() => resolve(true))
      .onDismiss(() => resolve(false));
  });
}

async function onDeleteFlow(row) {
  const ok = await confirm(`Delete flow "${row.name}" (v${row.version})? This can't be undone.`);
  if (!ok) return;
  const success = await store.deleteGraph(row.id);
  $q.notify({
    type: success ? "positive" : "negative",
    message: success ? `Deleted "${row.name}"` : `Failed to delete "${row.name}"`,
    timeout: 2000,
    position: "bottom",
  });
}

async function onDeleteExecution(row) {
  const when = new Date(row.created_at).toLocaleString();
  const ok = await confirm(`Delete execution from ${when}? This will also remove its node logs.`);
  if (!ok) return;
  const success = await store.deleteExecution(row.id);
  $q.notify({
    type: success ? "positive" : "negative",
    message: success ? "Execution deleted" : "Failed to delete execution",
    timeout: 2000,
    position: "bottom",
  });
}

// ----- Triggers -----
const triggerColumns = [
  { name: "action",   label: "" },
  { name: "status",   label: "", style: "width: 70px;" },
  { name: "name",     label: "Name", field: "name", align: "left", sortable: true },
  { name: "type",     label: "Type", field: "type", align: "left", sortable: true, style: "width: 70px;" },
  { name: "graph",    label: "Flow", field: row => graphName(row.graph_id), align: "left" },
  { name: "fires",    label: "Fires", field: "fire_count", align: "right", style: "width: 60px;" },
  { name: "lastFired", label: "Last", field: "last_fired_at", align: "left",
    format: v => v ? new Date(v).toLocaleString() : "—" },
];

function graphName(graphId) {
  const g = store.graphs.find(x => x.id === graphId);
  return g ? g.name : graphId.slice(0, 8) + "…";
}

function triggerStatus(row) {
  if (!row.enabled)      return "skipped";   // grey pill = disabled
  if (row.last_error)    return "failed";    // red = subscription errored
  return "success";                          // green = running
}
function triggerStatusLabel(row) {
  if (!row.enabled)   return "off";
  if (row.last_error) return "error";
  return "running";
}

function openNewTrigger() {
  editingTrigger.value = null;
  triggerDialogOpen.value = true;
}
function openEditTrigger(row) {
  editingTrigger.value = row;
  triggerDialogOpen.value = true;
}

async function onToggleTrigger(row) {
  const res = await store.toggleTrigger(row.id, !row.enabled);
  $q.notify({
    type: res.ok ? "positive" : "negative",
    message: res.ok
      ? (row.enabled ? `Stopped "${row.name}"` : `Started "${row.name}"`)
      : (res.error || "Toggle failed"),
    timeout: 1800, position: "bottom",
  });
}

async function onDeleteTrigger(row) {
  const ok = await confirm(`Delete trigger "${row.name}"? It will be unsubscribed and removed.`);
  if (!ok) return;
  const res = await store.deleteTrigger(row.id);
  $q.notify({
    type: res.ok ? "positive" : "negative",
    message: res.ok ? "Trigger deleted" : (res.error || "Delete failed"),
    timeout: 1800, position: "bottom",
  });
}

const runningCount = computed(() =>
  store.triggers.filter(t => t.enabled && !t.last_error).length
);
</script>

<template>
  <div class="left-pane column no-wrap full-height">
    <div class="q-pa-xs text-center">
      <q-img src="/dag_logo copy.png"  style="width: 55px;"></q-img>
    <b>DAISY DAG</b>
    </div>
    <q-list bordered separator dense class="col-grow scroll" style="border: 0;">

      <q-expansion-item dense dense-toggle default-opened label="Flows" header-class="bg-grey-11">
        <div class="q-pa-xs text-center q-gutter-xs">
          <q-btn outline color="primary" icon="add" lable="New" size="sm" @click.stop="store.openNewGraph()">
            <q-tooltip>New flow</q-tooltip>New
          </q-btn>
          <q-btn
            v-if="aiConfigured"
            outline color="purple-5" icon="auto_awesome" size="sm" no-caps
            @click.stop="aiOpen = true"
          >
            Ask AI
            <q-tooltip>Get help, generate workflows</q-tooltip>
          </q-btn>
        </div>


        <q-table dense flat square :rows="store.graphs" :columns="flowsColumns" row-key="id"
          :rows-per-page-options="[0]" hide-pagination hide-bottom
          :selected="activeGraphRowKey ? store.graphs.filter(g => g.id === activeGraphRowKey) : []"
          @row-click="onFlowRow" @row-dblclick="onFlowDblClick" class="dense-table"
          no-data-label="No flows yet — click + to start.">
          <template v-slot:body-cell-action="props">
            <q-td :props="props" @click.stop>
              <q-btn flat size="xs" dense icon="more_vert" @click.stop>
                <q-menu>
                  <q-list style="min-width: 100px" dense>
                    <q-item clickable v-close-popup @click="onDeleteFlow(props.row)">
                      <q-item-section avatar>
                        <q-icon name="delete" color="negative" size="xs" />
                      </q-item-section>
                      <q-item-section>Delete</q-item-section>
                    </q-item>
                  </q-list>
                </q-menu>
              </q-btn>
            </q-td>
          </template>
          <template v-slot:body-cell-name="props">
            <q-td :props="props" class="cursor-pointer">
              <span :class="{ 'text-primary': props.row.id === activeGraphRowKey }">
                {{ props.row.name }}
              </span>
            </q-td>
          </template>
        </q-table>

      </q-expansion-item>

      <!-- TRIGGERS expansion -->
      <q-expansion-item
        dense dense-toggle default-opened
        :label="`Triggers (${runningCount} running / ${store.triggers.length})`"
        header-class="bg-grey-11"
      >
        <div class="q-pa-xs text-center">
          <q-btn
            outline color="primary" icon="add" size="sm" no-caps
            label="New trigger"
            :disable="store.graphs.length === 0"
            @click.stop="openNewTrigger"
          >
            <q-tooltip>{{ store.graphs.length === 0 ? "Save a flow first" : "Create a trigger" }}</q-tooltip>
          </q-btn>
        </div>

        <q-table
          dense flat square
          :rows="store.triggers"
          :columns="triggerColumns"
          row-key="id"
          :rows-per-page-options="[0]"
          hide-pagination hide-bottom
          class="dense-table"
          no-data-label="No triggers yet — click + to add one."
        >
          <template v-slot:body-cell-action="props">
            <q-td :props="props" @click.stop>
              <q-btn flat size="xs" dense icon="more_vert" @click.stop>
                <q-menu>
                  <q-list style="min-width: 140px" dense>
                    <q-item clickable v-close-popup @click="onToggleTrigger(props.row)">
                      <q-item-section avatar>
                        <q-icon
                          :name="props.row.enabled ? 'pause_circle' : 'play_circle'"
                          :color="props.row.enabled ? 'orange' : 'positive'"
                          size="xs"
                        />
                      </q-item-section>
                      <q-item-section>{{ props.row.enabled ? "Stop" : "Start" }}</q-item-section>
                    </q-item>
                    <q-item clickable v-close-popup @click="openEditTrigger(props.row)">
                      <q-item-section avatar><q-icon name="edit" size="xs" /></q-item-section>
                      <q-item-section>Edit</q-item-section>
                    </q-item>
                    <q-separator />
                    <q-item clickable v-close-popup @click="onDeleteTrigger(props.row)">
                      <q-item-section avatar><q-icon name="delete" color="negative" size="xs" /></q-item-section>
                      <q-item-section>Delete</q-item-section>
                    </q-item>
                  </q-list>
                </q-menu>
              </q-btn>
            </q-td>
          </template>

          <template v-slot:body-cell-status="props">
            <q-td :props="props">
              <span class="status-pill" :class="`status-${triggerStatus(props.row)}`">
                {{ triggerStatusLabel(props.row) }}
              </span>
              <q-tooltip v-if="props.row.last_error" anchor="top middle" self="bottom middle">
                {{ props.row.last_error }}
              </q-tooltip>
            </q-td>
          </template>

          <template v-slot:body-cell-name="props">
            <q-td :props="props" class="cursor-pointer" @click="openEditTrigger(props.row)">
              <span>{{ props.row.name }}</span>
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
          <template v-slot:body-cell-action="props">
            <q-td :props="props" @click.stop>
              <q-btn flat size="xs" dense icon="more_vert" @click.stop>
                <q-menu>
                  <q-list style="min-width: 100px" dense>
                    <q-item clickable v-close-popup @click="onDeleteExecution(props.row)">
                      <q-item-section avatar>
                        <q-icon name="delete" color="negative" size="xs" />
                      </q-item-section>
                      <q-item-section>Delete</q-item-section>
                    </q-item>
                  </q-list>
                </q-menu>
              </q-btn>
            </q-td>
          </template>
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

    <AskAIDialog v-model="aiOpen" />
    <TriggerDialog v-model="triggerDialogOpen" :trigger="editingTrigger" />
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
