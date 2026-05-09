<!--
  Read-only JSON view of the current flow model. Re-rendered every time the
  model changes — handy for sanity-checking what will be saved.
-->
<template>
  <div class="column full-height json-tab">
    <q-toolbar dense class="json-toolbar">
      <q-icon name="code" class="q-mr-sm" style="color: var(--text-muted);" />
      <div class="text-subtitle2" style="color: var(--text);">Generated JSON (read-only)</div>
      <q-space />
      <q-btn dense size="sm" flat no-caps icon="content_copy" label="Copy" class="btn-secondary" @click="copy" />
    </q-toolbar>
    <pre class="json-pre col scroll">{{ json }}</pre>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useQuasar } from "quasar";
import { serializeModelToDsl } from "./flowModel.js";

const props = defineProps({
  modelValue: { type: Object, required: true },
});

const $q = useQuasar();

const json = computed(() => {
  try { return serializeModelToDsl(props.modelValue); }
  catch (e) { return `// Failed to serialize: ${e.message}`; }
});

function copy() {
  navigator.clipboard.writeText(json.value).then(
    () => $q.notify({ type: "positive", message: "Copied", timeout: 1200, position: "bottom" }),
  );
}
</script>

<style scoped>
.json-tab     { background: var(--bg); }
.json-toolbar {
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
}
.json-pre {
  margin: 0;
  padding: 12px 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  white-space: pre;
  overflow: auto;
  background: var(--surface);
  color: var(--text);
}
</style>
