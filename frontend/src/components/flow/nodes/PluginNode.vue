<!--
  Generic VueFlow custom node used for every action plugin. Rendered when
  the parent's <VueFlow> sees node.type === "plugin". Reads node.data
  (set up by NodeRegistry.makeDefaultNode) to draw the card.
-->
<template>
  <div class="plugin-node" :class="{ selected }">
    <Handle type="target" :position="Position.Left" />
    <div class="row items-center no-wrap">
      <q-icon :name="iconForAction(data.action)" size="14px" class="q-mr-xs" />
      <div class="col">
        <div class="node-name ellipsis">{{ data.name || "(unnamed)" }}</div>
        <div class="node-action ellipsis">{{ data.action }}</div>
      </div>
    </div>
    <Handle type="source" :position="Position.Right" />
  </div>
</template>

<script setup>
import { Handle, Position } from "@vue-flow/core";

defineProps({
  id:       { type: String, required: true },
  data:     { type: Object, required: true },
  selected: { type: Boolean, default: false },
});

// Pick a vaguely appropriate Material icon for each action prefix.
const ICONS = {
  http:    "language",
  web:     "public",
  sql:     "storage",
  email:   "mail_outline",
  file:    "description",
  csv:     "table_view",
  excel:   "grid_on",
  log:     "terminal",
  delay:   "timer",
  transform: "transform",
  condition: "rule",
  default: "extension",
};
function iconForAction(action) {
  if (!action) return ICONS.default;
  const prefix = action.split(".")[0];
  return ICONS[prefix] || ICONS[action] || ICONS.default;
}
</script>

<style scoped>
/* Card-style node — clean light surface, soft shadow.
   Selected state uses our primary accent. */
.plugin-node {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px 10px;
  font-size: 11.5px;
  width: 184px;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 120ms ease, border-color 120ms ease;
}
.plugin-node:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow);
}
.plugin-node.selected {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(47, 109, 243, 0.20);
}
.node-name   { font-weight: 600; color: var(--text); }
.node-action { font-size: 10.5px; color: var(--text-muted); }
</style>
