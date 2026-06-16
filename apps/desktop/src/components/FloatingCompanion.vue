<script setup lang="ts">
import { Minus, X } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useNexusStore } from "../store";
import Live2DStage from "./Live2DStage.vue";

const store = useNexusStore();

const state = computed(() => store.companion?.currentState ?? "idle");
const dialogue = computed(() => store.companion?.currentDialogue ?? "NEXUS-7 待命中。");

const open = ref(localStorage.getItem("nexus-companion-open") !== "false");
const minimized = ref(false);
const popping = ref(false);

// 位置：右下角默认，拖动后持久化
const pos = ref({ x: 0, y: 0 });
function loadPos() {
  const saved = localStorage.getItem("nexus-companion-pos");
  if (saved) {
    try {
      pos.value = JSON.parse(saved);
      return;
    } catch {
      /* fall through */
    }
  }
  pos.value = { x: window.innerWidth - 260, y: window.innerHeight - 300 };
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
  const maxY = window.innerHeight - 80;
  pos.value = {
    x: Math.min(Math.max(0, e.clientX - offsetX), maxX),
    y: Math.min(Math.max(0, e.clientY - offsetY), maxY),
  };
}
function onPointerUp() {
  if (!dragging) return;
  dragging = false;
  localStorage.setItem("nexus-companion-pos", JSON.stringify(pos.value));
}

function toggleOpen() {
  open.value = !open.value;
  localStorage.setItem("nexus-companion-open", String(open.value));
}

// 任务完成或庆祝状态 → 弹跳动画 + 自动展开
watch(
  () => store.completedToday,
  (now, prev) => {
    if (now > (prev ?? 0)) triggerPop();
  },
);
watch(state, (s) => {
  if (s === "celebrating") triggerPop();
});

function triggerPop() {
  if (minimized.value) minimized.value = false;
  popping.value = true;
  setTimeout(() => {
    popping.value = false;
  }, 900);
}

function onResize() {
  // 窗口缩小时把小人拉回可见区域
  pos.value = {
    x: Math.min(pos.value.x, window.innerWidth - 80),
    y: Math.min(pos.value.y, window.innerHeight - 80),
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
  <button v-if="!open" class="companion-reopen" type="button" title="唤出系统核心" @click="toggleOpen">
    <span class="reopen-dot"></span>
  </button>

  <div
    v-else
    :class="['floating-companion', { minimized, popping }]"
    :style="style"
  >
    <div class="fc-bar" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp">
      <span class="fc-title">系统核心</span>
      <button class="fc-btn" type="button" title="最小化" @click.stop="minimized = !minimized">
        <Minus :size="13" />
      </button>
      <button class="fc-btn" type="button" title="收起" @click.stop="toggleOpen">
        <X :size="13" />
      </button>
    </div>

    <template v-if="!minimized">
      <Live2DStage :state="state" :size="140" />
      <p class="fc-dialogue">{{ dialogue }}</p>
    </template>
    <div v-else class="fc-mini-orb" :title="dialogue" @click="minimized = false"></div>
  </div>
</template>

<style scoped>
.floating-companion {
  position: fixed;
  z-index: 900;
  width: 200px;
  background: var(--bg-chat);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  user-select: none;
}
.floating-companion.minimized {
  width: auto;
}
.floating-companion.popping {
  animation: fc-pop 0.9s ease-in-out;
}
@keyframes fc-pop {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  30% {
    transform: translateY(-8px) scale(1.04);
  }
  60% {
    transform: translateY(0) scale(0.99);
  }
}
.fc-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 6px 12px;
  cursor: grab;
  background: var(--bg-panel-dim);
  border-bottom: 1px solid var(--border-row);
  touch-action: none;
}
.fc-bar:active {
  cursor: grabbing;
}
.fc-title {
  flex: 1;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--text-accent);
}
.fc-btn {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.fc-btn:hover {
  background: var(--bg-btn-hover);
  color: var(--text-base);
}
.fc-dialogue {
  margin: 0;
  padding: 4px 14px 14px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-sub);
  text-align: center;
}
.fc-mini-orb {
  width: 44px;
  height: 44px;
  margin: 8px;
  border-radius: 50%;
  cursor: pointer;
  background: radial-gradient(circle at 50% 38%, var(--avatar-glow), transparent 9px), var(--avatar-bg);
  border: 1px solid var(--border-avatar);
}
.companion-reopen {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 900;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-chat);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
  cursor: pointer;
  display: grid;
  place-items: center;
}
.reopen-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 38%, var(--avatar-glow), transparent 6px), var(--avatar-bg);
  animation: pulse 1.8s ease-in-out infinite;
}
</style>
