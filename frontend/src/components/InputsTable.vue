<script setup>
defineProps({
  // Each row: { k: string, v: any }
  rows: { type: Array, default: () => [] },
});

const inputColumns = [
  { name: "k", label: "Key",   field: "k", align: "left", style: "width: 200px;" },
  { name: "v", label: "Value", field: row => preview(row.v), align: "left" },
];

// Compact one-line preview shown in the un-expanded row.
function preview(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 200 ? s.slice(0, 200) + "…" : s;
  } catch {
    return String(v);
  }
}

// Pretty-printed full value shown in the expansion row.
function fmt(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}
</script>

<template>
  <q-table
    dense flat square
    :rows="rows"
    :columns="inputColumns"
    row-key="k"
    :rows-per-page-options="[0]"
    hide-pagination
    hide-bottom
    no-data-label="No inputs were provided."
    class="dense-table"
  >
    <template v-slot:header="props">
      <q-tr :props="props">
        <q-th auto-width />
        <q-th v-for="col in props.cols" :key="col.name" :props="props">
          {{ col.label }}
        </q-th>
      </q-tr>
    </template>

    <template v-slot:body="props">
      <q-tr :props="props">
        <q-td auto-width>
          <q-btn
            size="sm" flat round dense
            :icon="props.expand ? 'expand_less' : 'expand_more'"
            @click="props.expand = !props.expand"
          />
        </q-td>
        <q-td v-for="col in props.cols" :key="col.name" :props="props">
          <div class="ellipsis" style="max-width: 360px;">{{ col.value }}</div>
        </q-td>
      </q-tr>
      <q-tr v-show="props.expand" :props="props" no-hover>
        <q-td colspan="100%">
          <pre class="value-pre">{{ fmt(props.row.v) }}</pre>
        </q-td>
      </q-tr>
    </template>
  </q-table>
</template>

<style scoped>
.value-pre {
  margin: 0;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 11.5px;
  white-space: pre-wrap;
  word-break: break-word;
  max-width: 100%;
}
</style>
