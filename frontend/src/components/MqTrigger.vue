<!--
  Form editor for the `mqtt` trigger config. Used by TriggerDesigner via
  `<component :is="typeEditor" v-model="configForm" />`.

  Broker server settings (url, credentials, clientId) live on a stored
  mqtt configuration. The trigger only references it by name + the
  per-trigger topic / qos / parseJson knobs.

  Config shape (matches backend/src/triggers/builtin/mqtt.js):
    config:    "<name>"           required (mqtt config from Configurations)
    topic:     "sensors/+/temp"   OR ["a/b", "c/d"]   (required)
    qos:       0 | 1 | 2          default 0
    parseJson: boolean            default true
-->
<template>
  <div class="column q-gutter-sm">
    <q-input
      :model-value="cfg.config || ''"
      @update:model-value="set('config', $event)"
      dense outlined
      label="Config *"
      placeholder="mqttBroker"
      :error="!cfg.config"
      error-message="Required — name of a stored mqtt configuration."
      hint="Manage broker URL + credentials on Home page → Configurations (type: mqtt)."
    >
      <template v-slot:append>
        <q-icon name="settings" />
      </template>
    </q-input>

    <!-- Multi-topic input: comma- or newline-separated. We store as a string
         when there's one entry, or an array when there are several. -->
    <q-input
      :model-value="topicText"
      @update:model-value="setTopic"
      dense outlined
      type="textarea"
      autogrow
      label="Topic(s) *"
      placeholder="sensors/+/temp&#10;devices/#"
      input-style="min-height: 56px;"
      :error="topicEmpty"
      error-message="At least one topic is required"
      hint="One per line. MQTT wildcards (+, #) supported."
    />

    <q-select
      :model-value="cfg.qos ?? 0"
      @update:model-value="set('qos', $event)"
      dense outlined
      label="QoS"
      :options="qosOptions"
      emit-value map-options
      hint="0 = at most once, 1 = at least once, 2 = exactly once"
    />

    <q-toggle
      :model-value="cfg.parseJson !== false"
      @update:model-value="set('parseJson', $event)"
      dense
      label="Parse JSON payloads"
    />

    <q-banner dense rounded class="info-banner">
      <template v-slot:avatar><q-icon name="info" /></template>
      <div class="text-caption">
        Each message fires the workflow with payload
        <code>{ topic, message, qos, retain, receivedAt }</code>.
        Reference fields in the JSON via <code>${topic}</code>,
        <code>${message}</code>, etc. — when JSON parsing is on,
        <code>${message.someField}</code> drills into the parsed body.
      </div>
    </q-banner>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
});
const emit = defineEmits(["update:modelValue"]);

const qosOptions = [
  { label: "0 — at most once",  value: 0 },
  { label: "1 — at least once", value: 1 },
  { label: "2 — exactly once",  value: 2 },
];

// Local view onto the parent's config (always read fresh through props.modelValue).
const cfg = computed(() => props.modelValue || {});

const topicText = computed(() => {
  const t = cfg.value.topic;
  if (Array.isArray(t)) return t.join("\n");
  return t || "";
});
const topicEmpty = computed(() => {
  const t = cfg.value.topic;
  if (Array.isArray(t)) return t.length === 0;
  return !t;
});

// Emit a new object — never mutate props.modelValue in place.
function emitNext(patch) {
  emit("update:modelValue", { ...cfg.value, ...patch });
}
function set(key, value) {
  emitNext({ [key]: value });
}
function setTopic(text) {
  const lines = (text || "").split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  if (lines.length === 0)      emitNext({ topic: "" });
  else if (lines.length === 1) emitNext({ topic: lines[0] });
  else                         emitNext({ topic: lines });
}
</script>

<style scoped>
.info-banner { background: var(--surface-2); color: var(--text); }
</style>
