<template>
    <q-table  dense flat square :rows="rows" :columns="batchColumns" row-key="index"
        :rows-per-page-options="[0]" hide-pagination hide-bottom class="dense-table">
        <template v-slot:header="props">
            <q-tr :props="props">
                <q-th auto-width></q-th>
                <q-th v-for="col in props.cols" :key="col.name" :props="props">
                    {{ col.label }}
                </q-th>
            </q-tr>
        </template>
        <template v-slot:body="props">
            <q-tr :props="props">
                <q-td auto-width>
                    <q-btn size="sm" flat round dense :icon="props.expand ? 'expand_less' : 'expand_more'"
                        @click="props.expand = !props.expand" />
                </q-td>
                <q-td v-for="col in props.cols" :key="col.name" :props="props">

                    <div v-if="col.name === 'status'" class="ellipsis" style="max-width: 300px;">
                        <span class="status-pill" :class="`status-${props.row.status}`">
                            {{ col.value }}
                        </span>
                    </div>
                    <div v-else class="ellipsis" style="max-width: 300px;">
                        {{ col.value }}
                    </div>
                </q-td>
            </q-tr>
            <q-tr v-show="props.expand" :props="props">
                <q-td colspan="100%">

                    <pre style="white-space: pre-wrap; margin: 0;">
{{ fmt(props.row.error || props.row.ctx) }}
            </pre>

                </q-td>
            </q-tr>
        </template>

        <template v-slot:body-cell-status="props">
            <q-td :props="props"><span class="status-pill" :class="`status-${props.row.status}`">{{ props.row.status
                    }}</span></q-td>
        </template>
        <template v-slot:body-cell-result="props">
            <q-td :props="props">
                <pre class="cell-pre">{{ fmt(props.row.error || props.row.ctx) }}</pre>
            </q-td>
        </template>
    </q-table>
</template>
<script setup>
const batchColumns = [
  { name: "i", label: "#", field: "index", align: "right", style: "width: 50px;" },
  { name: "status", label: "Status", field: "status", align: "left", style: "width: 90px;" },
  {
    name: "result", label: "Result / Error",
    field: r => r.error || r.ctx, align: "left"
  },
];
const props = defineProps(["rows"]);

function fmt(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}
</script>