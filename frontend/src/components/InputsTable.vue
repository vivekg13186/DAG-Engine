<template>
    <q-table dense flat square :rows="rows" :columns="inputColumns" row-key="k" :rows-per-page-options="[0]"
        hide-pagination hide-bottom no-data-label="No input context." class="dense-table">


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

                    <div class="ellipsis" style="max-width: 300px;">
                        {{ col.value }}
                    </div>
                </q-td>
            </q-tr>
            <q-tr v-show="props.expand" :props="props">
                <q-td colspan="100%">
                    <pre style="white-space: pre-wrap; margin: 0;">
{{ fmt(props.row.v) }}
            </pre>

                </q-td>
            </q-tr>
        </template>



    </q-table>
</template>
<script setup>
const inputColumns = [
    { name: "k", label: "Key", field: "k", align: "left", style: "width: 200px;" },
    { name: "v", label: "Value", field: "v", align: "left" },
];
const props = defineProps(["props"])
function fmt(v) {
    if (v == null) return "";
    if (typeof v === "string") return v;
    try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}
</script>