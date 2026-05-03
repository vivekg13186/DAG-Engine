<script setup>
import { ref, computed, watch } from "vue";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  initial: { type: Object, default: () => ({}) },
});
const emit = defineEmits(["update:modelValue", "submit"]);

const text = ref("{}");

const parsed = computed(() => {
  try { return { ok: true, value: JSON.parse(text.value || "{}") }; }
  catch (e) { return { ok: false, error: e.message }; }
});

watch(() => props.modelValue, (open) => {
  if (open) text.value = JSON.stringify(props.initial || {}, null, 2);
});

function close() { emit("update:modelValue", false); }
function submit() {
  if (!parsed.value.ok) return;
  emit("submit", parsed.value.value);
}

function onKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
}
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    persistent
  >
    <q-card style="min-width: 520px; max-width: 92vw;" class="bg-dark text-white">
      <q-card-section class="row items-center q-pb-sm">
        <q-icon name="play_arrow" class="q-mr-sm" />
        <div class="text-subtitle1">Run with input</div>
        <q-space />
        <q-btn dense flat round icon="close" v-close-popup @click="close" />
      </q-card-section>

      <q-card-section class="q-pt-none">
        <div class="text-caption text-grey q-mb-xs">
          JSON input — exposed inside the workflow as
          <code>${var}</code> and <code>${data.var}</code>.
          Pass <code>{ "items": [ ... ] }</code> or a bare array to run the flow once per item.
        </div>
        <q-input
          v-model="text"
          type="textarea"
          dense
          dark
          filled
          autogrow
          input-style="font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px; min-height: 240px;"
          :error="!parsed.ok"
          :error-message="parsed.error"
          @keydown="onKeydown"
        />
        <div v-if="parsed.ok" class="text-caption text-grey q-mt-xs">
          Valid JSON · {{ Array.isArray(parsed.value) ? parsed.value.length + ' item(s)' : Object.keys(parsed.value || {}).length + ' top-level keys' }}
        </div>
      </q-card-section>

      <q-card-actions align="right" class="q-pa-sm">
        <q-btn dense flat no-caps label="Cancel" v-close-popup @click="close" />
        <q-btn
          dense unelevated no-caps
          color="primary"
          icon-right="play_arrow"
          label="Run"
          :disable="!parsed.ok"
          @click="submit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
