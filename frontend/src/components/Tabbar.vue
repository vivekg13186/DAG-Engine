<template>
    <q-btn v-if="store.tabs.length" color="primary" :label="tabLabel(store.activeId)" flat dense no-caps>
        <q-menu>
            <q-list style="min-width: 100px">
                <q-item clickable v-close-popup v-for="t in source.tabs">
                    <q-item-section>{{ tabLabel(t.label) }}</q-item-section>
                </q-item>
            </q-list>
        </q-menu>
    </q-btn>
    <div v-else>no fiels</div>
</template>
<script setup>
import { useGraphsStore } from '../stores/graphs';
const store = useGraphsStore();
function tabLabel(t) {
    if (t.kind === "graph") return `${t.name}${t.dirty ? " ●" : ""}`;
    return `▶ ${t.execId.slice(0, 6)}`;
}
</script>