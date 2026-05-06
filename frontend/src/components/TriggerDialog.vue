<script setup>
import { ref, computed, watch } from "vue";
import { useQuasar } from "quasar";
import { useGraphsStore } from "../stores/graphs.js";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // When provided, the dialog opens in edit mode for this trigger row.
  trigger:    { type: Object, default: null },
});
const emit = defineEmits(["update:modelValue", "saved"]);

const $q = useQuasar();
const store = useGraphsStore();

// Per-type starter config snippets. Used as the initial value when the user
// picks a type for a brand new trigger.
const TYPE_TEMPLATES = {
  schedule: {
    label: "Schedule (cron / interval)",
    config: {
      cron: "0 */5 * * * *"          // every 5 minutes
      // intervalMs: 30000           // alternative: every 30s
    },
    hint: "Use `cron` (croner format) OR `intervalMs`. Optional `timezone` for cron.",
  },
  mqtt: {
    label: "MQTT (subscribe to topic)",
    config: {
      url: "mqtt://broker.example.com:1883",
      topic: "sensors/+/temp",
      qos: 0,
      parseJson: true,
    },
    hint: "URL: mqtt:// mqtts:// ws:// wss://. `topic` may be a string or array. Add `username`/`password` if needed.",
  },
  email: {
    label: "Email (IMAP inbox)",
    config: {
      host: "imap.example.com",
      port: 993,
      secure: true,
      user: "you@example.com",
      pass: "...",
      mailbox: "INBOX",
      markAsSeen: true,
      pollIntervalMs: 60000,
    },
    hint: "Watches an IMAP mailbox; uses IDLE if the server supports it. Marks messages as seen for dedup.",
  },
};

const isEdit = computed(() => Boolean(props.trigger));

// Form fields
const name = ref("");
const graphId = ref("");
const type = ref("schedule");
const configText = ref("");
const enabled = ref(true);
const saving = ref(false);
const error = ref("");

const configParsed = computed(() => {
  try { return { ok: true, value: JSON.parse(configText.value || "{}") }; }
  catch (e) { return { ok: false, error: e.message }; }
});

const typeOptions = computed(() => {
  // Use the live type list from the backend, falling back to the bundled templates.
  const live = (store.triggerTypes || []).map(t => ({
    label: TYPE_TEMPLATES[t.type]?.label || t.type,
    value: t.type,
  }));
  if (live.length) return live;
  return Object.entries(TYPE_TEMPLATES).map(([v, t]) => ({ label: t.label, value: v }));
});

const graphOptions = computed(() => store.graphs.map(g => ({ label: `${g.name} (v${g.version})`, value: g.id })));
const currentHint = computed(() => TYPE_TEMPLATES[type.value]?.hint || "");

// Reset form whenever the dialog opens or the target trigger changes.
watch(() => props.modelValue, (open) => {
  if (!open) return;
  store.loadTriggerTypes();
  if (store.graphs.length === 0) store.loadGraphs();
  error.value = "";
  if (props.trigger) {
    name.value = props.trigger.name;
    graphId.value = props.trigger.graph_id;
    type.value = props.trigger.type;
    configText.value = JSON.stringify(props.trigger.config || {}, null, 2);
    enabled.value = !!props.trigger.enabled;
  } else {
    name.value = "";
    graphId.value = store.graphs[0]?.id || "";
    type.value = "schedule";
    configText.value = JSON.stringify(TYPE_TEMPLATES.schedule.config, null, 2);
    enabled.value = true;
  }
});

// When user changes type for a NEW trigger, swap in the matching template.
watch(type, (newType) => {
  if (isEdit.value) return;
  const tpl = TYPE_TEMPLATES[newType];
  if (tpl) configText.value = JSON.stringify(tpl.config, null, 2);
});

function close() { emit("update:modelValue", false); }

async function save() {
  if (!name.value.trim()) { error.value = "name is required"; return; }
  if (!graphId.value)     { error.value = "select a graph"; return; }
  if (!configParsed.value.ok) { error.value = `config: ${configParsed.value.error}`; return; }

  saving.value = true;
  error.value = "";
  let res;
  if (isEdit.value) {
    res = await store.updateTrigger(props.trigger.id, {
      name: name.value.trim(),
      config: configParsed.value.value,
      enabled: enabled.value,
    });
  } else {
    res = await store.createTrigger({
      name: name.value.trim(),
      graphId: graphId.value,
      type: type.value,
      config: configParsed.value.value,
      enabled: enabled.value,
    });
  }
  saving.value = false;

  if (res.ok) {
    $q.notify({ type: "positive", message: isEdit.value ? "Trigger updated" : "Trigger created", timeout: 1500, position: "bottom" });
    emit("saved");
    close();
  } else {
    error.value = res.error || "Save failed";
  }
}
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    persistent
  >
    <q-card class="trigger-card">
      <q-toolbar dense>
        <q-icon name="bolt" class="q-mr-sm" />
        <div class="text-subtitle1">{{ isEdit ? "Edit trigger" : "New trigger" }}</div>
        <q-space />
        <q-btn dense flat round icon="close" @click="close" />
      </q-toolbar>

      <q-card-section class="q-pt-sm column q-gutter-sm">
        <q-input
          v-model="name"
          dense filled label="Name" autofocus
          :error="!!error && !name.trim()"
        />

        <q-select
          v-model="graphId"
          dense filled label="Flow"
          :options="graphOptions"
          emit-value map-options
          :disable="isEdit"
          :hint="isEdit ? 'Flow cannot be changed once a trigger is saved.' : ''"
        />

        <q-select
          v-model="type"
          dense filled label="Type"
          :options="typeOptions"
          emit-value map-options
          :disable="isEdit"
          :hint="isEdit ? 'Type cannot be changed once a trigger is saved.' : ''"
        />

        <div>
          <div class="text-caption text-grey q-mb-xs">Config (JSON) — {{ currentHint }}</div>
          <q-input
            v-model="configText"
            type="textarea"
            dense filled autogrow
            input-style="font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px; min-height: 180px;"
            :error="!configParsed.ok"
            :error-message="configParsed.ok ? '' : configParsed.error"
          />
        </div>

        <q-toggle v-model="enabled" label="Enabled (subscribe immediately)" dense />

        <q-banner v-if="error" dense class="bg-red-10 text-red-2">
          <template v-slot:avatar><q-icon name="error_outline" /></template>
          {{ error }}
        </q-banner>
      </q-card-section>

      <q-card-actions align="right" class="q-pa-sm">
        <q-btn dense flat no-caps label="Cancel" @click="close" />
        <q-btn
          dense unelevated no-caps
          color="primary" icon-right="save"
          :label="isEdit ? 'Save' : 'Create'"
          :loading="saving"
          :disable="!configParsed.ok"
          @click="save"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.trigger-card {
  width: min(560px, 92vw);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}
</style>
