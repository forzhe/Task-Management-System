<script setup lang="ts">
import { MessageSquare, Minus, Send, X } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useNexusStore } from "../store";

const store = useNexusStore();

const open = ref(localStorage.getItem("nexus-chat-open") !== "false");
const minimized = ref(false);
const message = ref("");

// 位置：默认左下角（避开右下的系统核心浮窗），拖动后持久化
const pos = ref({ x: 24, y: 0 });
function loadPos() {
  const saved = localStorage.getItem("nexus-chat-pos");
  if (saved) {
    try {
      pos.value = JSON.parse(saved);
      return;
    } catch {
      /* fall through */
    }
  }
  pos.value = { x: 24, y: Math.max(24, window.innerHeight - 520) };
}

const style = computed(() => ({ left: `${pos.value.x}px`, top: `${pos.value.y}px` }));

// 拖动
let dragging = false;
let offsetX = 0;
let offsetY = 0;
function onPointerDown(e: PointerEvent) {
  dragging = true;
  offsetX = e.clientX - pos.value.x;
  offsetY = e.clientY - pos.value.y;
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
}
function onPointerMove(e: PointerEvent) {
  if (!dragging) return;
  const maxX = window.innerWidth - 80;
  const maxY = window.innerHeight - 60;
  pos.value = {
    x: Math.min(Math.max(0, e.clientX - offsetX), maxX),
    y: Math.min(Math.max(0, e.clientY - offsetY), maxY),
  };
}
function onPointerUp() {
  if (!dragging) return;
  dragging = false;
  localStorage.setItem("nexus-chat-pos", JSON.stringify(pos.value));
}

function toggleOpen() {
  open.value = !open.value;
  localStorage.setItem("nexus-chat-open", String(open.value));
}

async function submitMessage() {
  const value = message.value.trim();
  if (!value) return;
  message.value = "";
  await store.send(value);
}

function onResize() {
  pos.value = {
    x: Math.min(pos.value.x, window.innerWidth - 80),
    y: Math.min(pos.value.y, window.innerHeight - 60),
  };
}

onMounted(() => {
  loadPos();
  window.addEventListener("resize", onResize);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
});
</script>

<template>
  <!-- 收起后的唤起按钮 -->
  <button v-if="!open" class="chat-reopen" type="button" title="唤出神经链接" @click="toggleOpen">
    <MessageSquare :size="20" />
  </button>

  <div v-else :class="['chat-window', { minimized }]" :style="style">
    <div class="cw-bar" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp">
      <MessageSquare :size="13" />
      <span class="cw-title">神经链接 <span class="cw-sub">·实时通信</span></span>
      <button class="cw-btn" type="button" title="最小化" @click.stop="minimized = !minimized">
        <Minus :size="13" />
      </button>
      <button class="cw-btn" type="button" title="收起" @click.stop="toggleOpen">
        <X :size="13" />
      </button>
    </div>

    <template v-if="!minimized">
      <div class="chat-log">
        <p v-if="store.chat.length === 0" class="empty">神经链接已建立，等待宿主输入第一条指令。</p>
        <article v-for="line in store.chat" :key="`${line.at}-${line.text}`" :class="['chat-line', line.role]">
          <span>{{ line.role === "host" ? "宿主" : "NEXUS" }}</span>
          <p>{{ line.text }}</p>
        </article>
      </div>
      <form class="composer" @submit.prevent="submitMessage">
        <input v-model="message" placeholder="向系统核心发送指令或陈述行为..." />
        <button class="icon-button primary" title="发送" type="submit" :disabled="store.loading">
          <Send :size="18" />
        </button>
      </form>
    </template>
  </div>
</template>

<style scoped>
.chat-window {
  position: fixed;
  z-index: 900;
  width: min(380px, 92vw);
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.42);
  overflow: hidden;
  user-select: none;
}
.chat-window.minimized {
  width: auto;
}

.cw-bar {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 8px 8px 12px;
  cursor: grab;
  background: var(--bg-panel-dim);
  border-bottom: 1px solid var(--border-row);
  color: var(--text-accent);
  touch-action: none;
}
.cw-bar:active {
  cursor: grabbing;
}
.cw-title {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-base);
  white-space: nowrap;
}
.cw-sub {
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}
.cw-btn {
  display: grid;
  place-items: center;
  width: 22px;
  min-height: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.cw-btn:hover {
  background: var(--bg-btn-hover);
  color: var(--text-base);
}

/* 内容区内边距（chat-log / composer 复用全局样式） */
.chat-window .chat-log {
  height: 300px;
  margin: 0;
  padding: 14px 14px 0;
}
.chat-window .composer {
  padding: 12px 14px 14px;
}

.chat-reopen {
  position: fixed;
  right: 86px;
  bottom: 22px;
  z-index: 900;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-panel);
  color: var(--text-accent);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
  cursor: pointer;
  display: grid;
  place-items: center;
}
.chat-reopen:hover {
  border-color: var(--border-btn-hover);
  color: var(--text-base);
}
</style>
