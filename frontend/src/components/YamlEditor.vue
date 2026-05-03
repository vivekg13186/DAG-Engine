<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { EditorView, basicSetup } from "codemirror";
import { yaml } from "@codemirror/lang-yaml";
import {
  autocompletion,
  startCompletion,
  completionKeymap,
} from "@codemirror/autocomplete";
import { keymap } from "@codemirror/view";

import { makeYamlCompletions } from "./yamlCompletions.js";
import { useGraphsStore } from "../stores/graphs.js";

const store = useGraphsStore();
const container = ref(null);
let view;

function currentYaml() { return store.activeGraphTab?.yaml || ""; }

// Re-reads the plugins each time so the completion picks up the list as soon
// as it loads (loadPlugins is fired from GraphList on mount).
const yamlCompletionSource = makeYamlCompletions(() => ({
  plugins: store.plugins || [],
}));

onMounted(() => {
  view = new EditorView({
    parent: container.value,
    doc: currentYaml(),
    extensions: [
      basicSetup,
      yaml(),
      autocompletion({
        override: [yamlCompletionSource],
        activateOnTyping: true,
        closeOnBlur: true,
        icons: true,
      }),
      // Make sure the completion keymap (Ctrl/Cmd+Space, Tab, Enter, Esc) is bound.
      keymap.of([
        ...completionKeymap,
        { key: "Mod-Space", run: startCompletion },
      ]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged && store.activeGraphTab) {
          store.setYaml(store.activeGraphTab.id, view.state.doc.toString());
        }
      }),
    ],
  });
});

// When the active tab changes, swap doc contents.
watch(() => store.activeId, () => {
  if (!view) return;
  const next = currentYaml();
  if (view.state.doc.toString() !== next) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
  }
});

// External edits (e.g. after Save loads a fresh copy).
watch(() => store.activeGraphTab?.yaml, (val) => {
  if (!view || val == null) return;
  if (view.state.doc.toString() !== val) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: val } });
  }
});

onBeforeUnmount(() => view?.destroy());
</script>

<template>
  <div ref="container" class="editor-area"></div>
</template>
