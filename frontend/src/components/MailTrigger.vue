<!--
  Form editor for the `email` trigger config (IMAP inbox watcher). Used by
  TriggerDesigner via `<component :is="typeEditor" v-model="configForm" />`.

  Server settings (host / port / tls / username / password / folder) live
  on a stored mail.imap configuration on the Home page → Configurations.
  The trigger only references it by name, plus a handful of behavioural
  knobs.

  Config shape (matches backend/src/triggers/builtin/email.js):
    config:         "<name>"                (required, mail.imap config)
    mailbox:        "INBOX"                 (override the config's `folder`)
    markAsSeen:     true                    (default true; used for dedup)
    onlyUnseen:     true                    (default true)
    pollIntervalMs: 60000                   (used when IDLE isn't available)
    useIdle:        true                    (default true; set false to force polling)
-->
<template>
  <div class="column q-gutter-sm">
    <q-input
      :model-value="cfg.config || ''"
      @update:model-value="set('config', $event)"
      dense outlined
      label="Config *"
      placeholder="mailpit"
      :error="!cfg.config"
      error-message="Required — name of a stored mail.imap configuration."
      hint="Manage IMAP server credentials on Home page → Configurations (type: mail.imap)."
    >
      <template v-slot:append>
        <q-icon name="settings" />
      </template>
    </q-input>

    <q-input
      :model-value="cfg.mailbox || ''"
      @update:model-value="set('mailbox', $event)"
      dense outlined
      label="Mailbox"
      placeholder="INBOX"
      hint="Optional. Overrides the config's `folder` field. Defaults to INBOX."
    />

    <div class="row q-col-gutter-sm items-center q-pl-md">
      <div class="col-6">
        <q-toggle
          :model-value="cfg.markAsSeen !== false"
          @update:model-value="set('markAsSeen', $event)"
          dense
          label="Mark fetched messages as seen"
        />
      </div>
      <div class="col-6">
        <q-toggle
          :model-value="cfg.onlyUnseen !== false"
          @update:model-value="set('onlyUnseen', $event)"
          dense
          label="Only process unseen messages"
        />
      </div>
    </div>

    <q-toggle class="q-pl-sm"
      :model-value="cfg.useIdle !== false"
      @update:model-value="set('useIdle', $event)"
      dense
      label="Use IMAP IDLE when supported"
    />

    <q-input
      :model-value="cfg.pollIntervalMs ?? 60000"
      @update:model-value="setNumber('pollIntervalMs', $event)"
      dense outlined
      type="number"
      label="Poll interval (ms)"
      hint="Used when IDLE isn't available or is disabled. Minimum 5000."
      :rules="[v => v >= 5000 || 'Minimum is 5000 ms']"
    />

    <q-banner dense rounded class="info-banner">
      <template v-slot:avatar><q-icon name="info" /></template>
      <div class="text-caption">
        Each new message fires the workflow with payload
        <code>{ uid, messageId, from, to, cc, subject, date, text, html, attachments[] }</code>.
        Reference fields in the JSON via <code>${subject}</code>, <code>${from[0]}</code>,
        <code>${text}</code>, etc.
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

const cfg = computed(() => props.modelValue || {});

function emitNext(patch) {
  emit("update:modelValue", { ...cfg.value, ...patch });
}
function set(key, value) {
  emitNext({ [key]: value });
}
function setNumber(key, value) {
  // q-input type=number gives a string; coerce to integer (NaN → undefined).
  const n = parseInt(value, 10);
  emitNext({ [key]: Number.isFinite(n) ? n : undefined });
}
</script>

<style scoped>
.info-banner { background: var(--surface-2); color: var(--text); }
</style>
