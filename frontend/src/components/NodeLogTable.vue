<template>
    <q-table dense flat square :rows="rows" :columns="logColumns" row-key="id" :rows-per-page-options="[0]"
        hide-pagination hide-bottom no-data-label="No node events recorded." class="dense-table">

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
{{ fmt(props.row.error || props.row.output) }}
            </pre>

                </q-td>
            </q-tr>
        </template>




    </q-table>
</template>
<script setup>
const props = defineProps(['rows'])
const logColumns = [
    { name: "node", label: "Node", field: "node_name", align: "left", sortable: true },
    { name: "status", label: "Status", field: "status", align: "left" },
    { name: "attempt", label: "Attempt", field: "attempt", align: "right", style: "width: 60px;" },
    {
        name: "started", label: "Started", field: "started_at", align: "left",
        format: v => v ? new Date(v).toLocaleTimeString() : ""
    },
    {
        name: "finished", label: "Finished", field: "finished_at", align: "left",
        format: v => v ? new Date(v).toLocaleTimeString() : ""
    },
    { name: "outerr", label: "Output / Error", field: r => r.error || r.output, align: "left" },
];
function fmt(v) {
    if (v == null) return "";
    if (typeof v === "string") return v;
    try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}
</script>