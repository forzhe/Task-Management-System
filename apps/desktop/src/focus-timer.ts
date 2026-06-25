import { computed, ref } from "vue";
import { useNexusStore } from "./store";

// 番茄钟「深度协议」：模块级单例状态，跨页面常驻。绑定任务，完成后记专注分钟 + 专注力 XP。

type Phase = "idle" | "focus" | "break";

const FOCUS_KEY = "nexus-focus-len";
const BREAK_KEY = "nexus-break-len";

function loadNum(key: string, fallback: number): number {
  const v = Number(localStorage.getItem(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const focusLen = ref(loadNum(FOCUS_KEY, 25)); // 专注时长（分钟）
const breakLen = ref(loadNum(BREAK_KEY, 5)); // 缓冲时长（分钟）
const phase = ref<Phase>("idle");
const taskId = ref<string | null>(null);
const taskTitle = ref("");
const remainingSec = ref(0);
const running = ref(false);

const active = computed(() => phase.value !== "idle");
const totalSec = computed(() => (phase.value === "break" ? breakLen.value : focusLen.value) * 60);
const progress = computed(() =>
  totalSec.value > 0 ? 1 - Math.max(0, remainingSec.value) / totalSec.value : 0,
);
const mmss = computed(() => {
  const s = Math.max(0, remainingSec.value);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
});

let ticker: ReturnType<typeof setInterval> | null = null;

function clearTicker(): void {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

function startTicker(): void {
  clearTicker();
  ticker = setInterval(() => {
    if (!running.value) return;
    remainingSec.value -= 1;
    if (remainingSec.value <= 0) onPhaseEnd();
  }, 1000);
}

function notify(title: string, body: string): void {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch {
    /* 通知不可用时静默 */
  }
}

function reset(keepTask = false): void {
  clearTicker();
  running.value = false;
  phase.value = "idle";
  remainingSec.value = 0;
  if (!keepTask) {
    taskId.value = null;
    taskTitle.value = "";
  }
}

function onPhaseEnd(): void {
  if (phase.value === "focus") {
    if (taskId.value) void useNexusStore().recordFocusSession(taskId.value, focusLen.value);
    phase.value = "break";
    remainingSec.value = breakLen.value * 60;
    notify("深度协议完成", `专注力已记入。缓冲 ${breakLen.value} 分钟。`);
  } else {
    notify("缓冲结束", "准备好再来一个深度协议了吗？");
    reset(true);
  }
}

function start(id: string, title: string): void {
  taskId.value = id;
  taskTitle.value = title;
  phase.value = "focus";
  remainingSec.value = focusLen.value * 60;
  running.value = true;
  startTicker();
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  } catch {
    /* 忽略 */
  }
}

function pause(): void {
  running.value = false;
}

function resume(): void {
  if (phase.value === "idle") return;
  running.value = true;
  if (!ticker) startTicker();
}

/** 提前结束当前专注：记录已专注的整分钟（≥1 才记），回到 idle */
function stop(): void {
  if (phase.value === "focus") {
    const mins = Math.floor((focusLen.value * 60 - Math.max(0, remainingSec.value)) / 60);
    if (mins >= 1 && taskId.value) void useNexusStore().recordFocusSession(taskId.value, mins);
  }
  reset();
}

/** 跳过缓冲，直接再来一个（同一任务）*/
function again(): void {
  if (taskId.value) start(taskId.value, taskTitle.value);
}

function setDurations(focus: number, brk: number): void {
  focusLen.value = Math.max(1, Math.min(120, Math.round(focus)));
  breakLen.value = Math.max(1, Math.min(60, Math.round(brk)));
  localStorage.setItem(FOCUS_KEY, String(focusLen.value));
  localStorage.setItem(BREAK_KEY, String(breakLen.value));
}

export function useFocusTimer() {
  return {
    phase,
    taskId,
    taskTitle,
    remainingSec,
    running,
    focusLen,
    breakLen,
    active,
    progress,
    mmss,
    start,
    pause,
    resume,
    stop,
    again,
    setDurations,
  };
}
