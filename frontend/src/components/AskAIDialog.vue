<script setup>
import { ref, nextTick, watch, computed } from "vue";
import { useQuasar } from "quasar";
import { AI } from "../api/client.js";
import { useGraphsStore } from "../stores/graphs.js";

const props = defineProps({ modelValue: { type: Boolean, default: false } });
const emit = defineEmits(["update:modelValue"]);

const $q = useQuasar();
const store = useGraphsStore();

const messages = ref([]);   // [{ role, content }]
const input = ref("");
const loading = ref(false);
const error = ref("");
const scrollEl = ref(null);

const SUGGESTIONS = [
  "How does the DSL work? Show me a tiny example.",
  "Generate a flow that fetches a JSON API and logs the result.",
  "How do I retry a node on failure?",
  "Run the same flow once per item in an input array.",
  "Which SQL plugins are available and how do I use them?",
];

watch(() => props.modelValue, (open) => {
  if (open) {
    messages.value = [];
    input.value = "";
    error.value = "";
  }
});

async function send(text) {
  const content = (text ?? input.value).trim();
  if (!content || loading.value) return;
  messages.value.push({ role: "user", content });
  input.value = "";
  loading.value = true;
  error.value = "";
  await scrollDown();
  try {
    const { message } = await AI.chat(messages.value);
    messages.value.push(message);
  } catch (e) {
    error.value = e?.response?.data?.message || e.message || "AI request failed";
  } finally {
    loading.value = false;
    await scrollDown();
  }
}

async function scrollDown() {
  await nextTick();
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
}

function reset() {
  messages.value = [];
  input.value = "";
  error.value = "";
}

function close() { emit("update:modelValue", false); }

function onKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

// Split assistant content into alternating text + code-block pieces.
function parseBlocks(content) {
  const out = [];
  const re = /```(\w+)?\n([\s\S]*?)```/g;
  let last = 0, m;
  while ((m = re.exec(content))) {
    if (m.index > last) out.push({ type: "text", text: content.slice(last, m.index) });
    out.push({ type: "code", lang: (m[1] || "").toLowerCase(), text: m[2] });
    last = m.index + m[0].length;
  }
  if (last < content.length) out.push({ type: "text", text: content.slice(last) });
  return out;
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(
    () => $q.notify({ type: "positive", message: "Copied", timeout: 1200, position: "bottom" }),
    () => $q.notify({ type: "negative", message: "Copy failed", timeout: 1500, position: "bottom" }),
  );
}

function useYaml(text) {
  store.openNewGraph();
  // The newly created tab becomes active immediately.
  if (store.activeGraphTab) {
    store.setYaml(store.activeGraphTab.id, text);
  }
  close();
  $q.notify({ type: "positive", message: "Loaded into a new flow tab", timeout: 1500, position: "bottom" });
}

const empty = computed(() => messages.value.length === 0);
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    persistent
  >
    <q-card class="ai-card column">
      <q-toolbar dense>
        <q-icon name="auto_awesome" class="q-mr-sm" />
        <div class="text-subtitle1">Ask AI</div>
        <q-space />
        <q-btn dense flat round icon="restart_alt" @click="reset">
          <q-tooltip>New conversation</q-tooltip>
        </q-btn>
        <q-btn dense flat round icon="close" @click="close" />
      </q-toolbar>

      <!-- Conversation -->
      <div ref="scrollEl" class="ai-scroll col">
        <div v-if="empty" class="q-pa-md">
          <div class="text-caption text-grey q-mb-sm">Ask anything about the DSL, plugins, or workflows. Try:</div>
          <div class="q-gutter-xs">
            <q-chip
              v-for="s in SUGGESTIONS" :key="s"
              dense clickable size="sm" outline
              @click="send(s)"
            >{{ s }}</q-chip>
          </div>
        </div>

        <div
          v-for="(m, i) in messages" :key="i"
          class="ai-msg"
          :class="m.role"
        >
          <q-icon
            :name="m.role === 'user' ? 'person' : 'auto_awesome'"
            size="14px" class="q-mr-xs"
          />
          <div class="ai-msg-body">
            <template v-if="m.role === 'user'">
              <pre class="ai-text">{{ m.content }}</pre>
            </template>
            <template v-else>
              <div v-for="(block, bi) in parseBlocks(m.content)" :key="bi">
                <pre v-if="block.type === 'text'" class="ai-text">{{ block.text }}</pre>
                <div v-else class="ai-code-wrap">
                  <div class="ai-code-bar">
                    <span class="text-caption text-grey">{{ block.lang || "code" }}</span>
                    <q-space />
                    <q-btn
                      v-if="block.lang === 'yaml' || block.lang === 'yml'"
                      dense flat no-caps size="xs" color="primary"
                      icon="add_box" label="Use as new flow"
                      @click="useYaml(block.text)"
                    />
                    <q-btn
                      dense flat no-caps size="xs" icon="content_copy" label="Copy"
                      @click="copyText(block.text)"
                    />
                  </div>
                  <pre class="ai-code">{{ block.text }}</pre>
                </div>
              </div>
            </template>
          </div>
        </div>

        <div v-if="loading" class="ai-msg assistant">
          <q-spinner-dots size="18px" color="primary" />
          <span class="text-caption text-grey q-ml-sm">thinking…</span>
        </div>

        <div v-if="error" class="ai-error q-pa-sm">
          <q-icon name="error_outline" class="q-mr-xs" />{{ error }}
        </div>
      </div>

      <!-- Composer -->
      <div class="ai-composer">
        <q-input
          v-model="input"
          dense
          filled
        
          autofocus
          style="width: 100%;"
          placeholder="Ask about the DSL, plugins, or paste an error…"
          input-style="font-size: 13px; min-height: 22px; max-height: 160px;"
          @keydown="onKeydown"
        />
        <q-btn
          dense unelevated no-caps color="primary" class="q-ml-sm"
          icon-right="send"  
          :loading="loading"
          :disable="!input.trim()"
          @click="send()"
        />
      </div>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.ai-card {
  width: min(720px, 92vw);
  height: min(640px, 80vh);
  display: flex;
  flex-direction: column;
}
.ai-scroll {
  overflow-y: auto;
  padding: 8px 12px;
}
.ai-msg {
  display: flex;
  align-items: flex-start;
  margin: 8px 0;
  font-size: 13px;
  line-height: 1.5;
}
.ai-msg.user .ai-msg-body { background: rgba(79,140,255,0.08); }
.ai-msg.assistant .ai-msg-body { background: rgba(255,255,255,0.03); }
.ai-msg-body {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 10px;
  flex: 1;
  min-width: 0;
}
.ai-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 13px;
}
.ai-code-wrap {
  margin: 6px 0;
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
}
.ai-code-bar {
  display: flex;
  align-items: center;
  padding: 2px 6px;
  background: var(--panel-2);
  border-bottom: 1px solid var(--border);
}
.ai-code {
  margin: 0;
  padding: 8px 10px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  white-space: pre;
  overflow-x: auto;
  background: rgba(0,0,0,0.25);
}
.ai-error {
  background: #2a1414;
  color: #ff9999;
  font-size: 12px;
  border-radius: 4px;
  margin: 8px 0;
}
.ai-composer {
  display: flex;
  align-items: flex-end;
  border-top: 1px solid var(--border);
  padding: 8px 10px;
  gap: 6px;
}
</style>
