<script setup lang="ts">
import type { AttributeKey, FeatureKey, GoalLevel, NexusEvent, ProfileChangeProposal, Review, Task, TaskStatus, TaskStatusUpdateEvidence, UserStreak } from "@nexus/shared";
import { ATTRIBUTE_LABELS, DIVERGENCE_STATUS_LABELS, NET_GROWTH_VERDICT_LABELS, PERIOD_TREND_LABELS, STREAK_LABELS, UNLOCK_LABELS, UNLOCK_LEVELS, isFeatureUnlocked, xpToNextLevel } from "@nexus/shared";
import {
  Activity,
  Bot,
  Brain,
  Check,
  CircleDot,
  Clock,
  Edit3,
  FileText,
  Flag,
  Flame,
  Link as LinkIcon,
  MessageSquare,
  Moon,
  Pause,
  Play,
  BookOpen,
  CalendarRange,
  GraduationCap,
  HeartPulse,
  CalendarClock,
  Dna,
  Gavel,
  LineChart,
  Network,
  Stethoscope,
  Wallet,
  Plus,
  RefreshCw,
  Route,
  Scale,
  ScrollText,
  Send,
  Split,
  TrendingDown,
  Unlock,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  User,
  X,
  Zap,
} from "lucide-vue-next";
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import FloatingCompanion from "./components/FloatingCompanion.vue";
import Live2DStage from "./components/Live2DStage.vue";
import OnboardingRitual from "./components/OnboardingRitual.vue";
import { isTauri } from "./tauri-env";

const native = isTauri();

const isLight = ref(localStorage.getItem("nexus-theme") === "light");
watch(
  isLight,
  (val) => {
    if (val) {
      document.documentElement.classList.add("light-mode");
      localStorage.setItem("nexus-theme", "light");
    } else {
      document.documentElement.classList.remove("light-mode");
      localStorage.setItem("nexus-theme", "dark");
    }
  },
  { immediate: true },
);
function toggleTheme() {
  isLight.value = !isLight.value;
}
import { useNexusStore } from "./store";

interface EvidenceDraft {
  note: string;
  proofLink: string;
  actualMinutes: string;
}

const store = useNexusStore();
const ritualDismissed = ref(false);
const showOnboarding = computed(() => store.needsOnboarding && !ritualDismissed.value);
const message = ref("");
const reviewNote = ref("");
const evidenceDrafts = reactive<Record<string, EvidenceDraft>>({});
const showGoalForm = ref(false);
const newGoalTitle = ref("");
const newGoalLevel = ref<GoalLevel>("weekly");

const goalLevelLabel: Record<GoalLevel, string> = {
  ultimate: "终极",
  long_term: "长期",
  stage: "阶段",
  weekly: "周",
  daily: "日",
};

const showProfileForm = ref(false);
const profileDraft = reactive({
  codename: "",
  focus: "",
  vision: "",
  redLines: "",
});

function openProfileForm() {
  const p = store.profile;
  profileDraft.codename = String(p?.basicInfo?.codename ?? "");
  profileDraft.focus = String(p?.basicInfo?.focus ?? "");
  profileDraft.vision = String(p?.longTermVision?.statement ?? "");
  profileDraft.redLines = Array.isArray(p?.redLines) ? p.redLines.join("\n") : "";
  showProfileForm.value = true;
}

async function saveProfile() {
  const redLines = profileDraft.redLines
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  await store.updateProfile({
    basicInfo: {
      ...(store.profile?.basicInfo ?? {}),
      codename: profileDraft.codename.trim() || "宿主",
      focus: profileDraft.focus.trim(),
    },
    longTermVision: {
      ...(store.profile?.longTermVision ?? {}),
      statement: profileDraft.vision.trim(),
    },
    redLines,
  });
  if (!store.error) showProfileForm.value = false;
}

const taskRows = computed(() =>
  store.tasks.map((task) => ({
    task,
    draft: ensureEvidenceDraft(task.id),
  })),
);

const statusLabel: Record<TaskStatus, string> = {
  not_started: "未开始",
  ready: "就绪",
  in_progress: "进行中",
  paused: "已暂停",
  completed: "已完成",
  reviewed: "已复盘",
  failed: "失败",
};

const energyLabel: Record<Task["energyRequired"], string> = {
  low: "低能量",
  medium: "中能量",
  high: "高能量",
};

watch(
  () => store.tasks.map((task) => task.id),
  (taskIds) => {
    for (const taskId of taskIds) {
      ensureEvidenceDraft(taskId);
    }
    for (const taskId of Object.keys(evidenceDrafts)) {
      if (!taskIds.includes(taskId)) delete evidenceDrafts[taskId];
    }
  },
  { immediate: true },
);

onMounted(() => {
  void store.refresh();
});

async function submitMessage() {
  const value = message.value.trim();
  if (!value) return;
  message.value = "";
  await store.send(value);
}

async function runDailyReview() {
  const note = reviewNote.value.trim() || "今天先做一次快速校准。";
  await store.dailyReview(note);
  reviewNote.value = "";
}

async function createGoal() {
  const title = newGoalTitle.value.trim();
  if (!title) return;
  await store.createGoal({ title, level: newGoalLevel.value });
  if (!store.error) {
    newGoalTitle.value = "";
    showGoalForm.value = false;
  }
}

async function updateTask(task: Task, status: TaskStatus) {
  const evidence = buildEvidence(task.id, status === "completed" || status === "failed");
  if (!evidence) return;
  await store.updateTaskStatus(task.id, status, evidence);
  if (!store.error && (status === "completed" || status === "failed")) {
    evidenceDrafts[task.id] = { note: "", proofLink: "", actualMinutes: "" };
  }
}

function ensureEvidenceDraft(taskId: string): EvidenceDraft {
  evidenceDrafts[taskId] ??= { note: "", proofLink: "", actualMinutes: "" };
  return evidenceDrafts[taskId];
}

function buildEvidence(taskId: string, requireNote: boolean): TaskStatusUpdateEvidence | null {
  const draft = ensureEvidenceDraft(taskId);
  const note = draft.note.trim();
  const proofLink = draft.proofLink.trim();
  const minutesText = draft.actualMinutes.trim();
  const actualMinutes = minutesText ? Number(minutesText) : undefined;

  if (requireNote && !note) {
    store.error = "完成或失败任务前，请先写一条证据备注。";
    return null;
  }
  if (actualMinutes !== undefined && (!Number.isFinite(actualMinutes) || actualMinutes < 0)) {
    store.error = "实际耗时需要是一个不小于 0 的数字。";
    return null;
  }

  store.error = "";
  return {
    source: "desktop",
    ...(note ? { note } : {}),
    ...(proofLink ? { proofLink } : {}),
    ...(actualMinutes !== undefined ? { actualMinutes } : {}),
  };
}

function reviewText(review: Review | null, key: "summary" | "honestDelta" | "tomorrowAdjustment") {
  if (!review) return "";
  if (key === "tomorrowAdjustment") {
    return String(
      review.aiAnalysis.tomorrowAdjustment ?? review.suggestedAdjustments.tomorrow ?? "",
    );
  }
  return String(review.aiAnalysis[key] ?? "");
}

function reviewRisks(review: Review | null): string[] {
  const risks = review?.aiAnalysis.risks;
  return Array.isArray(risks) ? risks.map(String) : [];
}

function formatTime(value?: string | null) {
  if (!value) return "未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function summarizeEvent(event: NexusEvent) {
  const structured = event.structured;
  if (typeof structured.summary === "string") return structured.summary;
  if (typeof structured.taskId === "string") {
    const toStatus = typeof structured.toStatus === "string" ? structured.toStatus : "unknown";
    return `任务 ${structured.taskId} → ${toStatus}`;
  }
  if (typeof structured.reviewId === "string") return `复盘已保存：${structured.reviewId}`;
  if (
    typeof structured.output === "object" &&
    structured.output &&
    "summary" in structured.output
  ) {
    return String((structured.output as { summary?: unknown }).summary ?? "");
  }
  return JSON.stringify(structured).slice(0, 160);
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

const ATTR_KEYS: AttributeKey[] = ["intellect", "stamina", "focus", "willpower", "creativity", "order"];

const levelInfo = computed(() => {
  const u = store.user;
  if (!u) return { level: 1, totalExp: 0, xpNeeded: 100, xpProgress: 0, pct: 0 };
  const level = u.currentLevel;
  const xpNeeded = xpToNextLevel(level);
  // XP earned towards current level = totalExp - XP needed to reach current level
  const xpAtCurrentLevel = level * level * 100;
  const xpProgress = Math.max(0, u.totalExp - xpAtCurrentLevel);
  const xpRange = xpNeeded - xpAtCurrentLevel;
  const pct = xpRange > 0 ? Math.min(100, Math.round((xpProgress / xpRange) * 100)) : 100;
  return { level, totalExp: u.totalExp, xpNeeded, xpProgress, pct };
});

const credibilityColor = computed(() => {
  const score = store.user?.credibilityScore ?? 1;
  if (score >= 1.5) return "var(--badge-active)";
  if (score >= 1.0) return "var(--text-secondary)";
  if (score >= 0.5) return "#f59e0b";
  return "#ef4444";
});

function attrPct(key: AttributeKey): number {
  const val = store.user?.attributes?.[key] ?? 0;
  const cap = Math.max(200, (store.user?.currentLevel ?? 1) * 80);
  return Math.min(100, Math.round((val / cap) * 100));
}

function unlocked(feature: FeatureKey): boolean {
  return isFeatureUnlocked(feature, store.user?.currentLevel ?? 1);
}

function lockMsg(feature: FeatureKey): string {
  const needed = UNLOCK_LEVELS[feature];
  const label = UNLOCK_LABELS[feature];
  return `${label} · Lv.${needed} 解锁`;
}

// ── 习惯链展示（§6.6.1）────────────────────────────────────────────
interface StreakChip {
  key: string;
  label: string;
  current: number;
  longest: number;
  isRecord: boolean;
  lastBreak: string | null;
}

const streakChips = computed<StreakChip[]>(() =>
  store.streaks
    .filter((s) => s.currentStreak > 0 || s.longestStreak > 0)
    .map((s: UserStreak) => {
      const goalTitle = s.goalId
        ? store.goals.find((g) => g.id === s.goalId)?.title?.slice(0, 8)
        : null;
      const label =
        s.category === "goal_progress" && goalTitle ? goalTitle : STREAK_LABELS[s.category];
      const lastBreakRaw = s.brokenAt.at(-1) ?? null;
      return {
        key: `${s.category}:${s.goalId ?? ""}`,
        label,
        current: s.currentStreak,
        longest: s.longestStreak,
        isRecord: s.currentStreak > 0 && s.currentStreak === s.longestStreak && s.longestStreak >= 3,
        lastBreak: lastBreakRaw ? lastBreakRaw.slice(5).replace("-", "/") : null,
      };
    }),
);

// ── 人生路线模拟（§9，Lv.30）──────────────────────────────────────
const pathScenario = ref("");
const pathOptionsText = ref("");

async function submitPathSimulation() {
  const scenario = pathScenario.value.trim();
  const paths = pathOptionsText.value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!scenario || paths.length < 2) {
    store.error = "请描述人生抉择场景，并至少给出两条路线（每行一个）。";
    return;
  }
  store.error = "";
  await store.simulatePath(scenario, paths);
}

// ── 解锁仪式（升级跨越解锁阈值时触发）─────────────────────────────
const ALL_FEATURES = Object.keys(UNLOCK_LEVELS) as FeatureKey[];
const unlockCeremony = ref<{ features: FeatureKey[]; level: number } | null>(null);

watch(
  () => store.user?.currentLevel,
  (level) => {
    if (!level) return;
    const lastSeen = Number(localStorage.getItem("nexus-last-level") ?? "0");
    if (lastSeen === 0) {
      // 首次加载只记录基线，不弹仪式
      localStorage.setItem("nexus-last-level", String(level));
      return;
    }
    if (level > lastSeen) {
      const newly = ALL_FEATURES.filter(
        (f) => UNLOCK_LEVELS[f] > lastSeen && UNLOCK_LEVELS[f] <= level,
      );
      if (newly.length > 0) {
        unlockCeremony.value = { features: newly, level };
      }
      localStorage.setItem("nexus-last-level", String(level));
    }
  },
);

function closeUnlockCeremony() {
  unlockCeremony.value = null;
}

// ── 系统进化引擎（§6.4）────────────────────────────────────────────
const EVO_TARGETS = [
  { key: "review", label: "复盘" },
  { key: "planning", label: "规划" },
  { key: "companion", label: "小人" },
  { key: "insight", label: "洞察" },
  { key: "coach", label: "教练" },
  { key: "reminder", label: "提醒" },
] as const;
const EVO_STATUS_LABEL: Record<string, string> = {
  proposed: "待裁决",
  applied: "已应用",
  rolled_back: "已回滚",
  rejected: "已拒绝",
};
const evoProposed = computed(() => store.evolution.filter((e) => e.status === "proposed"));
const evoResolved = computed(() => store.evolution.filter((e) => e.status !== "proposed"));

// ── 深度长期趋势（§7.3 Lv.50）──────────────────────────────────────
function sparkline(points: { value: number }[], w = 220, h = 36): string {
  if (points.length === 0) return "";
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const step = points.length > 1 ? w / (points.length - 1) : 0;
  return points
    .map((p, i) => {
      const x = Math.round(i * step);
      const y = Math.round(h - ((p.value - min) / range) * (h - 4) - 2);
      return `${x},${y}`;
    })
    .join(" ");
}

// ── 黑箱裁决（§6.7.4）──────────────────────────────────────────────
const openDivergences = computed(() => store.divergences.filter((d) => d.status === "open"));
const resolvedDivergences = computed(() => store.divergences.filter((d) => d.status !== "open"));

function insistAgainstReview() {
  const review = store.latestReview;
  if (!review) return;
  const claim = String(review.subjective?.note ?? reviewText(review, "summary") ?? "我对今日的陈述");
  const evidence = reviewText(review, "honestDelta") || "系统的多源判断";
  store.openDivergence(claim, evidence, "review");
}

// ── 生命体征接入（§6.7 全域感知）──────────────────────────────────
const healthCsv = ref("");

async function importHealth() {
  const csv = healthCsv.value.trim();
  if (!csv) {
    store.error = "请先粘贴健康/运动 CSV（需含日期列 + 步数/运动/睡眠等列）。";
    return;
  }
  store.error = "";
  await store.importHealth(csv);
  if (!store.error) healthCsv.value = "";
}

const healthTrend = computed(() => store.recentHealth.slice(-7));
const healthMaxStep = computed(() =>
  Math.max(1, ...store.recentHealth.map((d) => d.steps ?? 0)),
);

const calendarIcs = ref("");
async function importCalendar() {
  const ics = calendarIcs.value.trim();
  if (!ics) {
    store.error = "请先粘贴 .ics 日历内容。";
    return;
  }
  store.error = "";
  await store.importCalendar(ics);
  if (!store.error) calendarIcs.value = "";
}

function fmtCalTime(e: { start: string; allDay: boolean }): string {
  const d = new Date(e.start);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  if (e.allDay) return `${md} 全天`;
  return `${md} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const financeCsv = ref("");
async function importFinance() {
  const csv = financeCsv.value.trim();
  if (!csv) {
    store.error = "请先粘贴账单 CSV（需含日期列 + 金额列）。";
    return;
  }
  store.error = "";
  await store.importFinance(csv);
  if (!store.error) financeCsv.value = "";
}

// ── 关系图谱（§5.1）──────────────────────────────────────────────
interface LaidNode {
  id: string;
  label: string;
  type: string;
  status?: string;
  x: number;
  y: number;
  r: number;
}
interface LaidEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: string;
}

const GRAPH_W = 600;
const COL_X = { goal: 90, task: 300, attribute: 510 };

const graphLayout = computed(() => {
  const g = store.graph;
  if (!g || g.nodes.length === 0) return null;
  const byType: Record<string, typeof g.nodes> = { goal: [], task: [], attribute: [] };
  for (const n of g.nodes) byType[n.type]?.push(n);

  const rowH = 46;
  const maxRows = Math.max(
    byType.goal?.length ?? 0,
    byType.task?.length ?? 0,
    byType.attribute?.length ?? 0,
    1,
  );
  const height = Math.max(160, maxRows * rowH + 30);

  const pos = new Map<string, LaidNode>();
  for (const type of ["goal", "task", "attribute"] as const) {
    const list = byType[type] ?? [];
    const x = COL_X[type];
    list.forEach((n, i) => {
      const y = (height / (list.length + 1)) * (i + 1);
      pos.set(n.id, {
        id: n.id,
        label: n.label.length > 10 ? `${n.label.slice(0, 10)}…` : n.label,
        type: n.type,
        status: n.status,
        x,
        y,
        r: Math.min(16, 6 + Math.sqrt(n.weight)),
      });
    });
  }

  const edges: LaidEdge[] = [];
  for (const e of g.edges) {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (a && b) edges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, kind: e.kind });
  }

  return { width: GRAPH_W, height, nodes: [...pos.values()], edges };
});

function graphNodeColor(type: string, status?: string): string {
  if (type === "goal") return "var(--text-accent)";
  if (type === "attribute") return "var(--text-hi)";
  if (status === "completed") return "var(--text-ok)";
  if (status === "failed") return "var(--text-err)";
  return "var(--text-sub)";
}

// ── 周期报告（§9 / P3-9 季度·年度）─────────────────────────────────
const reportTrendColor = computed(() => {
  const t = store.report?.narrative.trend;
  if (t === "up") return "var(--text-ok)";
  if (t === "down") return "var(--text-err)";
  return "var(--text-hi)";
});

const REPORT_PERIODS = [
  { key: "weekly", label: "周" },
  { key: "monthly", label: "月" },
  { key: "quarterly", label: "季" },
  { key: "annual", label: "年" },
] as const;
const PERIOD_NAME: Record<string, string> = {
  weekly: "每周报告",
  monthly: "月度报告",
  quarterly: "季度报告",
  annual: "年度报告",
};

// ── 决策中枢（§8/§9）──────────────────────────────────────────────
const netGrowthColor = computed(() => {
  const v = store.netGrowth?.netValue ?? 0;
  if (v > 20) return "var(--text-ok)";
  if (v >= -20) return "var(--text-hi)";
  return "var(--text-err)";
});

const choiceQuestion = ref("");
const choiceOptionsText = ref("");

async function submitChoicePrediction() {
  const q = choiceQuestion.value.trim();
  const options = choiceOptionsText.value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!q || options.length < 2) {
    store.error = "请填写决策问题，并至少给出两个方案（每行一个）。";
    return;
  }
  store.error = "";
  await store.predictChoice(q, options);
}

// ── 档案演化提议（§5.3）────────────────────────────────────────────
const PROFILE_FIELD_LABELS: Record<string, string> = {
  basicInfo: "基本信息",
  traits: "性格特质",
  motivations: "动机",
  redLines: "红线",
  longTermVision: "长期愿景",
};

function proposalFieldLabel(p: ProfileChangeProposal): string {
  const base = PROFILE_FIELD_LABELS[p.field] ?? p.field;
  return p.subPath ? `${base} · ${p.subPath}` : base;
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "（空）";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => String(v)).join("、");
  return JSON.stringify(value);
}

// ── 晨间规划仪式 modal ──────────────────────────────────────────────
type RitualPhase = "idle" | "morning" | "review" | "result";
const ritualPhase = ref<RitualPhase>("idle");
const ritualLoading = ref(false);
const ritualResult = ref("");
const ritualResultTitle = ref("");

async function startMorningRitual() {
  ritualPhase.value = "morning";
  ritualLoading.value = true;
  ritualResult.value = "";
  try {
    await store.morningPlan();
    await nextTick();
    ritualResultTitle.value = "晨间规划协议已生成";
    ritualResult.value = store.chat.at(-1)?.text ?? "协议已记录。";
    ritualPhase.value = "result";
  } catch {
    ritualPhase.value = "idle";
  } finally {
    ritualLoading.value = false;
  }
}

async function startReviewRitual() {
  ritualPhase.value = "review";
}

async function submitReviewRitual() {
  const note = reviewNote.value.trim() || "今天先做一次快速校准。";
  ritualLoading.value = true;
  ritualResult.value = "";
  try {
    await store.dailyReview(note);
    reviewNote.value = "";
    ritualResultTitle.value = "日终校准协议已记录";
    ritualResult.value = store.chat.at(-1)?.text ?? "校准已记录。";
    ritualPhase.value = "result";
  } catch {
    ritualPhase.value = "idle";
  } finally {
    ritualLoading.value = false;
  }
}

function closeRitual() {
  ritualPhase.value = "idle";
  ritualResult.value = "";
}
</script>

<template>
  <main class="shell">
    <header class="topbar">
      <section>
        <p class="eyebrow">NEXUS-7 · 个体进化协议</p>
        <h1>今日执行中枢</h1>
      </section>
      <div class="status-row">
        <span v-if="native" class="status-pill aw-on" title="NEXUS-7 原生客户端（Tauri）">
          <CircleDot :size="14" />
          原生运行
        </span>
        <span class="status-pill">
          <CircleDot :size="14" />
          {{ store.offlineLlm ? "离线模拟" : "AI 在线" }}
        </span>
        <span :class="['status-pill', store.awConnected ? 'aw-on' : 'aw-off']" :title="store.awConnected ? `ActivityWatch 已连接 · 今日专注 ${store.awFocusMinutes} 分钟` : 'ActivityWatch 未连接，日终复盘无客观数据'">
          <CircleDot :size="14" />
          {{ store.awConnected ? `AW · ${store.awFocusMinutes}m` : "AW 未连接" }}
        </span>
        <button
          class="icon-button"
          :title="isLight ? '切换夜间模式' : '切换白天模式'"
          type="button"
          @click="toggleTheme"
        >
          <Moon v-if="isLight" :size="18" />
          <Sun v-else :size="18" />
        </button>
        <button class="icon-button" title="刷新" type="button" :disabled="store.loading" @click="store.refresh">
          <RefreshCw :size="18" />
        </button>
      </div>
    </header>

    <p v-if="store.error" class="error-line">{{ store.error }}</p>

    <section class="command-band">
      <button type="button" :disabled="store.loading" @click="startMorningRitual">
        <Sun :size="18" />
        启动晨间仪式
      </button>
      <button type="button" :disabled="store.loading" @click="startReviewRitual">
        <Moon :size="18" />
        日终校准协议
      </button>
    </section>

    <!-- ── 习惯链常驻展示（§6.6.1） ──────────────────────────────────── -->
    <section v-if="streakChips.length > 0" class="streak-strip">
      <span
        v-for="chip in streakChips"
        :key="chip.key"
        :class="['streak-chip', chip.current > 0 ? 'alive' : 'broken']"
        :title="`历史最长 ${chip.longest} 天`"
      >
        <Flame v-if="chip.current > 0" :size="13" />
        <template v-if="chip.current > 0">
          {{ chip.label }} · 连续 {{ chip.current }} 天<template v-if="chip.isRecord"> · 新纪录</template>
        </template>
        <template v-else>
          {{ chip.label }} · 已断<template v-if="chip.lastBreak">于 {{ chip.lastBreak }}</template> · 最长 {{ chip.longest }} 天
        </template>
      </span>
    </section>

    <!-- ── 晨间/日终仪式全屏 Modal ────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="ritualPhase !== 'idle'" class="ritual-backdrop" @click.self="closeRitual">
        <div class="ritual-modal">
          <!-- 晨间：loading 阶段 -->
          <template v-if="ritualPhase === 'morning'">
            <div class="ritual-icon morning">
              <Sun :size="48" />
            </div>
            <h2>晨间规划仪式</h2>
            <p class="ritual-desc">
              {{ ritualLoading ? "系统正在分析目标，生成今日执行协议..." : "协议生成中" }}
            </p>
            <div v-if="ritualLoading" class="ritual-spinner"></div>
          </template>

          <!-- 日终：输入阶段 -->
          <template v-else-if="ritualPhase === 'review'">
            <div class="ritual-icon review">
              <Moon :size="48" />
            </div>
            <h2>日终校准仪式</h2>
            <p class="ritual-desc">系统需要宿主的真实陈述，用于对比客观数据。</p>
            <textarea
              v-model="reviewNote"
              class="ritual-input"
              placeholder="今天真实完成了什么？遇到了哪些阻力？有没有在逃避什么？"
              :disabled="ritualLoading"
              rows="5"
            />
            <div class="ritual-actions">
              <button type="button" :disabled="ritualLoading" @click="submitReviewRitual">
                {{ ritualLoading ? "校准中..." : "提交陈述" }}
              </button>
              <button type="button" class="cancel" @click="closeRitual">取消</button>
            </div>
          </template>

          <!-- 结果阶段 -->
          <template v-else-if="ritualPhase === 'result'">
            <div class="ritual-icon result">
              <Sparkles :size="48" />
            </div>
            <h2>{{ ritualResultTitle }}</h2>
            <p class="ritual-result-text">{{ ritualResult }}</p>
            <button type="button" class="ritual-close" @click="closeRitual">
              <Check :size="16" /> 确认
            </button>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- ── 权限解锁仪式 ──────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="unlockCeremony" class="ritual-backdrop" @click.self="closeUnlockCeremony">
        <div class="ritual-modal unlock-modal">
          <div class="ritual-icon unlock-icon">
            <Unlock :size="48" />
          </div>
          <p class="unlock-eyebrow">权限已激活 · Lv.{{ unlockCeremony.level }}</p>
          <h2>新协议解锁</h2>
          <div class="unlock-list">
            <span v-for="f in unlockCeremony.features" :key="f" class="unlock-feature">
              {{ UNLOCK_LABELS[f] }}
            </span>
          </div>
          <button type="button" class="ritual-close" @click="closeUnlockCeremony">
            <Check :size="16" /> 接入新权限
          </button>
        </div>
      </div>
    </Teleport>

    <section class="profile-section">
      <div class="profile-header">
        <User :size="16" />
        <h2>宿主档案</h2>
        <span class="profile-summary">
          {{ store.profile?.basicInfo?.codename ?? "宿主" }}
          <template v-if="store.profile?.basicInfo?.focus">
            · {{ store.profile.basicInfo.focus }}
          </template>
        </span>
        <button class="icon-button" title="编辑档案" type="button" @click="openProfileForm">
          <Edit3 :size="16" />
        </button>
      </div>
      <form v-if="showProfileForm" class="profile-form" @submit.prevent="saveProfile">
        <label>
          <span>代号/称呼</span>
          <input v-model="profileDraft.codename" placeholder="例：caoqi" />
        </label>
        <label>
          <span>当前专注</span>
          <input v-model="profileDraft.focus" placeholder="例：完成 NEXUS-7 Phase 0，建立每日复盘习惯" />
        </label>
        <label>
          <span>长期愿景</span>
          <textarea v-model="profileDraft.vision" placeholder="例：成为能够自主生活、持续进化、深度创作的个体" />
        </label>
        <label>
          <span>红线（每行一条）</span>
          <textarea v-model="profileDraft.redLines" placeholder="例：不要把任务系统退化成机械打卡&#10;不逃避复盘" />
        </label>
        <div class="profile-form-actions">
          <button type="submit" :disabled="store.loading">保存</button>
          <button type="button" @click="showProfileForm = false">取消</button>
        </div>
      </form>

      <!-- 档案演化提议（§5.3）：系统提议、宿主裁决 -->
      <div class="evolution-block">
        <div class="evolution-head">
          <ScrollText :size="14" />
          <span>档案演化提议</span>
          <button
            class="evolution-scan-btn"
            type="button"
            :disabled="store.loading"
            title="立即扫描行为与档案的矛盾"
            @click="store.runProfileEvolution()"
          >
            扫描
          </button>
        </div>
        <p v-if="store.profileChanges.length === 0" class="evolution-empty">
          系统会对比你的实际行为与档案，发现矛盾时在此提议。当前无待裁决提议。
        </p>
        <article v-for="p in store.profileChanges" :key="p.id" class="evolution-card">
          <div class="evolution-card-head">
            <span class="evolution-field">{{ proposalFieldLabel(p) }}</span>
            <span class="evolution-confidence">置信 {{ Math.round(p.confidence * 100) }}%</span>
          </div>
          <div class="evolution-diff">
            <span class="evolution-old">{{ renderValue(p.currentValue) }}</span>
            <span class="evolution-arrow">→</span>
            <span class="evolution-new">{{ renderValue(p.proposedValue) }}</span>
          </div>
          <p class="evolution-reason">{{ p.reason }}</p>
          <div class="evolution-actions">
            <button type="button" class="accept" :disabled="store.loading" @click="store.resolveProfileChange(p.id, true)">
              <Check :size="13" /> 接受
            </button>
            <button type="button" class="reject" :disabled="store.loading" @click="store.resolveProfileChange(p.id, false)">
              <X :size="13" /> 拒绝
            </button>
          </div>
        </article>
      </div>
    </section>

    <!-- ── 觉醒等级 + 六维属性面板 ────────────────────────────────────── -->
    <section v-if="store.user" :class="['attr-panel', !unlocked('attributes') && 'panel-locked']">
      <div class="attr-header">
        <Zap :size="16" />
        <h2>觉醒等级 · Lv.{{ levelInfo.level }}</h2>
        <span class="attr-energy">
          <Sparkles :size="13" />
          {{ store.user.energyPoints }} EP
        </span>
        <span class="attr-credibility" :style="{ color: credibilityColor }">
          可信度 {{ store.user.credibilityScore.toFixed(2) }}
        </span>
      </div>

      <!-- XP 进度条 -->
      <div class="xp-bar-wrap">
        <div class="xp-bar" :style="{ width: levelInfo.pct + '%' }" />
        <span class="xp-label">{{ levelInfo.xpProgress }} / {{ levelInfo.xpNeeded - levelInfo.level * levelInfo.level * 100 }} XP → Lv.{{ levelInfo.level + 1 }}</span>
      </div>

      <!-- 六维属性 -->
      <div class="attr-grid">
        <div v-for="key in ATTR_KEYS" :key="key" class="attr-row">
          <span class="attr-name">{{ ATTRIBUTE_LABELS[key] }}</span>
          <div class="attr-track">
            <div class="attr-fill" :style="{ width: attrPct(key) + '%' }" />
          </div>
          <span class="attr-val">{{ store.user.attributes[key] ?? 0 }}</span>
        </div>
      </div>
      <!-- 锁定遮罩：< Lv.10 时显示 -->
      <div v-if="!unlocked('attributes')" class="lock-overlay">
        <span>{{ lockMsg('attributes') }}</span>
      </div>
    </section>

    <!-- ── 洞察报告（Lv.5 review_insights 解锁） ─────────────────────── -->
    <section :class="['insight-panel', !unlocked('review_insights') && 'panel-locked']">
      <div class="insight-header">
        <Brain :size="16" />
        <h2>行为洞察报告</h2>
        <button
          class="icon-button"
          title="生成洞察"
          type="button"
          :disabled="store.loading"
          @click="store.weeklyInsight()"
        >
          <TrendingUp :size="16" />
        </button>
      </div>
      <template v-if="store.latestInsight">
        <p class="insight-core">{{ store.latestInsight.coreInsight }}</p>
        <div class="insight-patterns">
          <span
            v-for="p in store.latestInsight.patterns"
            :key="p.description"
            :class="['insight-pattern', p.type]"
          >
            {{ p.type === 'positive' ? '↑' : '↓' }} {{ p.description }}
          </span>
        </div>
        <p class="insight-suggestion">
          <strong>校准方向：</strong>{{ store.latestInsight.calibrationSuggestion }}
        </p>
        <span :class="['insight-signal', store.latestInsight.credibilitySignal]">
          数据可信度：{{ store.latestInsight.credibilitySignal === 'high' ? '高' : store.latestInsight.credibilitySignal === 'medium' ? '中' : '低' }}
        </span>
      </template>
      <p v-else class="empty">点击右上角生成首个行为洞察报告。积累更多数据后洞察更准确。</p>
      <div v-if="!unlocked('review_insights')" class="lock-overlay">
        <span>{{ lockMsg('review_insights') }}</span>
      </div>
    </section>

    <!-- ── 决策中枢（Lv.15 behavior_score 解锁，§8/§9） ──────────────── -->
    <section :class="['decision-panel', !unlocked('behavior_score') && 'panel-locked']">
      <div class="decision-header">
        <Scale :size="16" />
        <h2>决策中枢 <span class="panel-sub">·行为影响评分</span></h2>
      </div>

      <!-- 今日净成长值 -->
      <div class="netgrowth-block">
        <div class="netgrowth-main">
          <div class="netgrowth-value" :style="{ color: netGrowthColor }">
            {{ store.netGrowth ? (store.netGrowth.netValue >= 0 ? '+' : '') + store.netGrowth.netValue : '—' }}
          </div>
          <div class="netgrowth-meta">
            <span class="netgrowth-label">今日净成长值</span>
            <span v-if="store.netGrowth" class="netgrowth-verdict" :style="{ color: netGrowthColor }">
              {{ NET_GROWTH_VERDICT_LABELS[store.netGrowth.verdict] }}
            </span>
          </div>
          <button
            class="icon-button"
            title="重新评估今日净成长"
            type="button"
            :disabled="store.loading"
            @click="store.runNetGrowth()"
          >
            <RefreshCw :size="15" />
          </button>
        </div>
        <p v-if="store.netGrowth" class="netgrowth-summary">{{ store.netGrowth.summary }}</p>
        <p v-else class="empty">日终校准后自动评估，或点击右侧按钮立即计算。锚点是你的长期愿景，不是今天忙不忙。</p>
        <div v-if="store.netGrowth && (store.netGrowth.positives.length || store.netGrowth.negatives.length)" class="netgrowth-factors">
          <span v-for="p in store.netGrowth.positives" :key="`p-${p.label}`" class="factor pos">+{{ p.weight }} {{ p.label }}</span>
          <span v-for="n in store.netGrowth.negatives" :key="`n-${n.label}`" class="factor neg">−{{ n.weight }} {{ n.label }}</span>
        </div>
      </div>

      <!-- 选择前预测 -->
      <div class="choice-block">
        <div class="choice-head">
          <Split :size="14" />
          <span>选择前预测</span>
        </div>
        <input v-model="choiceQuestion" class="choice-input" placeholder="你面临的决策，例：周末是复习考研还是接私活？" />
        <textarea v-model="choiceOptionsText" class="choice-options" placeholder="每行一个方案&#10;方案 A：全力复习&#10;方案 B：接私活" rows="3" />
        <button class="choice-submit" type="button" :disabled="store.loading" @click="submitChoicePrediction">
          预测各方案对理想人生的影响
        </button>
        <div v-if="store.choicePrediction" class="choice-result">
          <article v-for="opt in store.choicePrediction.options" :key="opt.label" class="choice-option">
            <div class="choice-option-head">
              <span class="choice-option-label">{{ opt.label }}</span>
              <span class="choice-align">契合 {{ opt.alignmentScore }}</span>
            </div>
            <div class="choice-detail"><strong>长期收益：</strong>{{ opt.longTermGain }}</div>
            <div class="choice-detail"><strong>短期代价：</strong>{{ opt.shortTermCost }}</div>
            <div class="choice-detail risk"><strong>风险：</strong>{{ opt.risk }}</div>
          </article>
          <p class="choice-reco"><strong>NEXUS 建议：</strong>{{ store.choicePrediction.recommendation }}</p>
          <p v-if="store.choicePrediction.warning" class="choice-warning">⚠ {{ store.choicePrediction.warning }}</p>
        </div>
      </div>

      <div v-if="!unlocked('behavior_score')" class="lock-overlay">
        <span>{{ lockMsg('behavior_score') }}</span>
      </div>
    </section>

    <!-- ── 分歧档案 · 黑箱裁决（§6.7.4） ────────────────────────────── -->
    <section v-if="store.divergences.length > 0" class="divergence-panel">
      <div class="health-header">
        <Gavel :size="16" />
        <h2>分歧档案 <span class="panel-sub">·黑箱裁决</span></h2>
      </div>
      <p class="divergence-intro">系统记得你坚持过什么，以及现实后来站在了哪一边。</p>

      <article v-for="d in openDivergences" :key="d.id" class="divergence-card open">
        <div class="divergence-claim"><strong>你坚持：</strong>{{ d.claim }}</div>
        <div class="divergence-evidence"><strong>当时的证据：</strong>{{ d.evidence }}</div>
        <div class="divergence-actions">
          <span class="divergence-status open">追踪中</span>
          <button type="button" class="dvg-resolve confirmed" :disabled="store.loading" @click="store.resolveDivergence(d.id, 'confirmed')">现实证实了我</button>
          <button type="button" class="dvg-resolve refuted" :disabled="store.loading" @click="store.resolveDivergence(d.id, 'refuted')">现实证伪了我</button>
          <button type="button" class="dvg-resolve withdrawn" :disabled="store.loading" @click="store.resolveDivergence(d.id, 'withdrawn')">我撤回</button>
        </div>
      </article>

      <details v-if="resolvedDivergences.length > 0" class="divergence-history">
        <summary>已裁决（{{ resolvedDivergences.length }}）</summary>
        <article v-for="d in resolvedDivergences" :key="d.id" class="divergence-card resolved">
          <div class="divergence-claim">{{ d.claim }}</div>
          <span :class="['divergence-status', d.status]">{{ DIVERGENCE_STATUS_LABELS[d.status] }}</span>
        </article>
      </details>
    </section>

    <!-- ── 进化日志 · 系统进化引擎（§6.4，仅提议·可回滚） ──────────────── -->
    <section class="divergence-panel">
      <div class="health-header">
        <Dna :size="16" />
        <h2>进化日志 <span class="panel-sub">·系统自我改进</span></h2>
      </div>
      <p class="divergence-intro">
        进化引擎只提议、绝不自动生效，且永不触碰安全 Agent 与自身。所有改动你确认才应用，随时可回滚。
      </p>
      <div class="evo-targets">
        <span class="evo-targets-hint">扫描并提议改进：</span>
        <button
          v-for="t in EVO_TARGETS"
          :key="t.key"
          type="button"
          class="evo-target-btn"
          :disabled="store.loading"
          @click="store.runEvolution(t.key)"
        >{{ t.label }}</button>
      </div>

      <article v-for="e in evoProposed" :key="e.id" class="evo-card proposed">
        <div class="evo-card-top">
          <span class="evo-target">{{ e.targetKey }}</span>
          <span class="evo-status proposed">待裁决</span>
        </div>
        <p class="evo-reason">{{ e.reason }}</p>
        <details class="evo-diff">
          <summary>查看提议的新提示词</summary>
          <pre class="evo-prompt">{{ e.newPrompt }}</pre>
        </details>
        <div class="evo-actions">
          <button type="button" class="evo-btn apply" :disabled="store.loading" @click="store.resolveEvolution(e.id, 'apply')">应用</button>
          <button type="button" class="evo-btn reject" :disabled="store.loading" @click="store.resolveEvolution(e.id, 'reject')">拒绝</button>
        </div>
      </article>

      <details v-if="evoResolved.length > 0" class="divergence-history">
        <summary>历史（{{ evoResolved.length }}）</summary>
        <article v-for="e in evoResolved" :key="e.id" class="evo-card resolved">
          <span class="evo-target">{{ e.targetKey }}</span>
          <span :class="['evo-status', e.status]">{{ EVO_STATUS_LABEL[e.status] }}</span>
          <button v-if="e.status === 'applied'" type="button" class="evo-btn rollback" :disabled="store.loading" @click="store.resolveEvolution(e.id, 'rollback')">回滚</button>
        </article>
      </details>
      <p v-if="store.evolution.length === 0" class="empty">
        点击上方任一 Agent，进化引擎会基于近期指标提议提示词改进——或在指标正常时克制地什么都不改。
      </p>
    </section>

    <!-- ── 周期报告（Lv.20 weekly_summary 解锁，§9 / P3-9 季度·年度） ─── -->
    <section :class="['report-panel', !unlocked('weekly_summary') && 'panel-locked']">
      <div class="report-header">
        <CalendarRange :size="16" />
        <h2>{{ store.report ? PERIOD_NAME[store.report.type] : '周期报告' }} <span class="panel-sub">·复盘</span></h2>
        <span
          v-if="store.report"
          class="report-trend"
          :style="{ color: reportTrendColor }"
        >
          <TrendingUp v-if="store.report.narrative.trend === 'up'" :size="13" />
          <TrendingDown v-else-if="store.report.narrative.trend === 'down'" :size="13" />
          {{ PERIOD_TREND_LABELS[store.report.narrative.trend] }}
        </span>
      </div>

      <div class="report-periods">
        <button
          v-for="p in REPORT_PERIODS"
          :key="p.key"
          type="button"
          class="report-period-btn"
          :disabled="store.loading"
          @click="store.runReport(p.key)"
        >
          {{ p.label }}
        </button>
      </div>

      <template v-if="store.report">
        <p class="report-headline">{{ store.report.narrative.headline }}</p>
        <p class="report-narrative">{{ store.report.narrative.narrative }}</p>

        <div class="report-stats">
          <div class="report-stat">
            <strong>{{ store.report.stats.tasksCompleted }}</strong>
            <span>完成任务</span>
          </div>
          <div class="report-stat">
            <strong>{{ store.report.stats.reviewsDone }}</strong>
            <span>校准次数</span>
          </div>
          <div class="report-stat">
            <strong :style="{ color: reportTrendColor }">
              {{ store.report.stats.netGrowthAvg ?? '—' }}
            </strong>
            <span>净成长均值</span>
          </div>
        </div>

        <!-- 多源滚动汇总（季度/年度更有意义） -->
        <div v-if="store.report.stats.healthRollup || store.report.stats.financeRollup" class="report-rollups">
          <span v-if="store.report.stats.healthRollup" class="report-rollup">
            🏃 {{ store.report.stats.healthRollup.activeDays }} 天有记录 · 均 {{ store.report.stats.healthRollup.avgSteps }} 步 · 运动 {{ store.report.stats.healthRollup.totalWorkoutMinutes }} 分钟
          </span>
          <span v-if="store.report.stats.financeRollup" class="report-rollup">
            💳 支出 {{ store.report.stats.financeRollup.totalExpense }} · 冲动信号 {{ store.report.stats.financeRollup.impulseSignals }}
          </span>
        </div>

        <div class="report-wl">
          <p class="report-win"><strong>最大进展：</strong>{{ store.report.narrative.biggestWin }}</p>
          <p class="report-leak"><strong>最大泄漏：</strong>{{ store.report.narrative.biggestLeak }}</p>
        </div>
        <p class="report-focus">
          <strong>下个周期焦点：</strong>{{ store.report.narrative.nextFocus }}
        </p>

        <p v-if="store.report.stats.pendingProposals > 0" class="report-proposals">
          有 {{ store.report.stats.pendingProposals }} 条档案演化提议待你在「宿主档案」中裁决。
        </p>
      </template>
      <p v-else class="empty">选择周期生成报告。周报每周日自动生成；季/年报把多源数据（健康/财务）滚进长期趋势，让你看见"完整的你"3 个月、1 年的真实轨迹。</p>

      <div v-if="!unlocked('weekly_summary')" class="lock-overlay">
        <span>{{ lockMsg('weekly_summary') }}</span>
      </div>
    </section>

    <!-- ── 日历接入（§6.7 全域感知，喂晨间规划 + 复盘锚点） ──────────── -->
    <section class="health-panel">
      <div class="health-header">
        <CalendarClock :size="16" />
        <h2>日历接入 <span class="panel-sub">·规划上下文</span></h2>
      </div>

      <div v-if="store.upcomingCalendar.length > 0" class="cal-list">
        <div v-for="(e, i) in store.upcomingCalendar.slice(0, 8)" :key="`${e.uid}-${i}`" class="cal-row">
          <span class="cal-time">{{ fmtCalTime(e) }}</span>
          <span class="cal-title">{{ e.title }}</span>
          <span v-if="e.location" class="cal-loc">{{ e.location }}</span>
        </div>
      </div>

      <details class="health-import">
        <summary>导入 .ics 日历</summary>
        <p class="health-hint">
          Google Calendar / Outlook 导出的 .ics 文件内容直接粘贴。日程会成为晨间规划的上下文
          （避开占用时段、不堆满）与日终复盘的客观锚点。
        </p>
        <textarea
          v-model="calendarIcs"
          class="health-textarea"
          rows="5"
          placeholder="BEGIN:VCALENDAR&#10;BEGIN:VEVENT&#10;SUMMARY:项目评审&#10;DTSTART:20260616T060000Z&#10;END:VEVENT&#10;END:VCALENDAR"
        />
        <button class="health-import-btn" type="button" :disabled="store.loading" @click="importCalendar">
          <CalendarClock :size="14" /> 接入日程
        </button>
      </details>
      <p v-if="store.upcomingCalendar.length === 0" class="empty">
        接入日历后，晨间规划会绕开你已占用的时段——不再把任务堆在开了一整天会的日子。
      </p>
    </section>

    <!-- ── 生命体征接入（§6.7 全域感知，喂体力属性 + 净成长值） ──────── -->
    <section class="health-panel">
      <div class="health-header">
        <HeartPulse :size="16" />
        <h2>生命体征接入 <span class="panel-sub">·全域感知</span></h2>
        <span v-if="store.lastHealthImport" class="health-badge">
          {{ store.lastHealthImport.summary }}
        </span>
        <button
          class="steward-btn"
          type="button"
          title="唤起健康管家（辅助 Agent，主小人转达）"
          :disabled="store.loading"
          @click="store.runHealthSteward()"
        >
          <Stethoscope :size="13" /> 健康管家
        </button>
      </div>

      <div v-if="store.healthSteward" :class="['steward-card', store.healthSteward.concernLevel]">
        <div class="steward-top">
          <Stethoscope :size="14" />
          <span class="steward-label">健康管家</span>
          <span :class="['steward-level', store.healthSteward.concernLevel]">
            {{ store.healthSteward.concernLevel === 'good' ? '达标' : store.healthSteward.concernLevel === 'watch' ? '留意' : '荒废预警' }}
          </span>
        </div>
        <p class="steward-assessment">{{ store.healthSteward.assessment }}</p>
        <p class="steward-nudge"><strong>建议：</strong>{{ store.healthSteward.nudge }}</p>
      </div>

      <div v-if="healthTrend.length > 0" class="health-trend">
        <div v-for="d in healthTrend" :key="d.date" class="health-bar-col" :title="`${d.date} · ${d.steps ?? 0} 步 · 运动 ${d.workoutMinutes ?? d.activeMinutes ?? 0} 分钟`">
          <div class="health-bar-track">
            <div class="health-bar-fill" :style="{ height: Math.round(((d.steps ?? 0) / healthMaxStep) * 100) + '%' }"></div>
          </div>
          <span class="health-bar-day">{{ d.date.slice(5) }}</span>
        </div>
      </div>

      <details class="health-import">
        <summary>导入健康/运动 CSV</summary>
        <p class="health-hint">
          小米/Zepp Life/Keep 等导出 CSV 直接粘贴。需含日期列，加步数/运动时长/睡眠/心率任意列。
          运动会转化为体力属性与净成长值（单日封顶防刷）。
        </p>
        <textarea
          v-model="healthCsv"
          class="health-textarea"
          rows="5"
          placeholder="日期,步数,运动时长,睡眠&#10;2026-06-14,9200,45,7.5&#10;2026-06-15,6100,0,6.2"
        />
        <button class="health-import-btn" type="button" :disabled="store.loading" @click="importHealth">
          <Activity :size="14" /> 接入并校准体力
        </button>
      </details>
      <p v-if="healthTrend.length === 0 && !store.lastHealthImport" class="empty">
        系统目前只能看见"屏幕前的你"。接入健康数据，让它看见完整的你。
      </p>
    </section>

    <!-- ── 财务感知（§6.7.6 红线检测 + 目标代价评估） ────────────────── -->
    <section class="health-panel">
      <div class="health-header">
        <Wallet :size="16" />
        <h2>财务感知 <span class="panel-sub">·红线 / 冲动消费</span></h2>
        <span v-if="store.lastFinanceImport" class="health-badge">
          {{ store.lastFinanceImport.summary }}
        </span>
      </div>

      <div v-if="store.financeSummary" class="finance-summary">
        <div class="finance-stats">
          <div class="finance-stat"><strong>{{ store.financeSummary.totalExpense }}</strong><span>支出</span></div>
          <div class="finance-stat"><strong>{{ store.financeSummary.totalIncome }}</strong><span>收入</span></div>
          <div class="finance-stat"><strong>{{ store.financeSummary.txnCount }}</strong><span>笔交易</span></div>
        </div>
        <div v-if="store.financeSummary.topCategories.length" class="finance-cats">
          <span v-for="c in store.financeSummary.topCategories" :key="c.category" class="finance-cat">
            {{ c.category }} · {{ c.amount }}
          </span>
        </div>
        <ul v-if="store.financeSummary.impulseFlags.length" class="finance-flags">
          <li v-for="f in store.financeSummary.impulseFlags" :key="f">⚠ {{ f }}</li>
        </ul>
      </div>

      <details class="health-import">
        <summary>导入账单 CSV</summary>
        <p class="health-hint">
          支付宝/微信/银行账单导出 CSV 直接粘贴。需含日期列与金额列，收/支与交易分类列可选。
          系统识别冲动消费信号，并在日终校准对照你的红线（如"不冲动消费"）。
        </p>
        <textarea
          v-model="financeCsv"
          class="health-textarea"
          rows="5"
          placeholder="交易时间,金额,收/支,交易分类&#10;2026-06-14,68,支出,外卖&#10;2026-06-14,1299,支出,数码"
        />
        <button class="health-import-btn" type="button" :disabled="store.loading" @click="importFinance">
          <Wallet :size="14" /> 接入并校验红线
        </button>
      </details>
      <p v-if="!store.financeSummary && !store.lastFinanceImport" class="empty">
        "我这月没超支"是最常见的自欺之一。接入账单，让系统替你诚实记账。
      </p>
    </section>

    <!-- ── 认知成长 · 学习教练（§6.7.3 第二个辅助 Agent） ──────────────── -->
    <section class="health-panel">
      <div class="health-header">
        <GraduationCap :size="16" />
        <h2>认知成长 <span class="panel-sub">·学习教练</span></h2>
        <button
          class="steward-btn"
          type="button"
          title="唤起学习教练（辅助 Agent，主小人转达）"
          :disabled="store.loading"
          @click="store.runLearningSteward()"
        >
          <BookOpen :size="13" /> 学习教练
        </button>
      </div>

      <div v-if="store.learningSteward" :class="['steward-card', store.learningSteward.concernLevel]">
        <div class="steward-top">
          <BookOpen :size="14" />
          <span class="steward-label">学习教练</span>
          <span :class="['steward-level', store.learningSteward.concernLevel]">
            {{ store.learningSteward.concernLevel === 'good' ? '有产出' : store.learningSteward.concernLevel === 'watch' ? '只输入' : '认知停滞' }}
          </span>
        </div>
        <p class="steward-assessment">{{ store.learningSteward.assessment }}</p>
        <p class="steward-nudge"><strong>建议：</strong>{{ store.learningSteward.nudge }}</p>
      </div>
      <p v-else class="empty">
        刷了很多 ≠ 学到了。学习教练只认"产出"——点击右上角，让它替你分清输入和成长。
      </p>
    </section>

    <!-- ── 关系图谱（Lv.30 path_simulation 解锁，§5.1） ──────────────── -->
    <section :class="['graph-panel', !unlocked('path_simulation') && 'panel-locked']">
      <div class="graph-header">
        <Network :size="16" />
        <h2>关系图谱 <span class="panel-sub">·目标·任务·属性</span></h2>
        <div class="graph-legend">
          <span class="legend goal">目标</span>
          <span class="legend task">任务</span>
          <span class="legend attr">属性</span>
        </div>
      </div>
      <div v-if="graphLayout" class="graph-canvas">
        <svg :viewBox="`0 0 ${graphLayout.width} ${graphLayout.height}`" preserveAspectRatio="xMidYMid meet">
          <line
            v-for="(e, i) in graphLayout.edges"
            :key="`e-${i}`"
            :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2"
            :class="['graph-edge', e.kind]"
          />
          <g v-for="n in graphLayout.nodes" :key="n.id">
            <circle :cx="n.x" :cy="n.y" :r="n.r" :fill="graphNodeColor(n.type, n.status)" fill-opacity="0.85" />
            <text :x="n.x" :y="n.y + n.r + 11" text-anchor="middle" class="graph-label">{{ n.label }}</text>
          </g>
        </svg>
      </div>
      <p v-else class="empty">设定目标并完成带属性奖励的任务后，这里会浮现目标 → 任务 → 属性的关系网络。</p>
      <div v-if="!unlocked('path_simulation')" class="lock-overlay">
        <span>{{ lockMsg('path_simulation') }}</span>
      </div>
    </section>

    <!-- ── 深度长期趋势（Lv.50 deep_analysis 解锁，§7.3） ──────────────── -->
    <section :class="['deep-panel', !unlocked('deep_analysis') && 'panel-locked']">
      <div class="health-header">
        <LineChart :size="16" />
        <h2>深度长期趋势 <span class="panel-sub">·{{ store.deepAnalysis?.weeks ?? 12 }} 周视野</span></h2>
        <button
          class="steward-btn"
          type="button"
          title="计算跨周期深度趋势"
          :disabled="store.loading"
          @click="store.loadDeepAnalysis()"
        >
          <LineChart :size="13" /> 生成
        </button>
      </div>

      <template v-if="store.deepAnalysis">
        <div class="deep-trends">
          <div class="deep-trend">
            <span class="deep-trend-label">净成长值</span>
            <svg viewBox="0 0 220 36" preserveAspectRatio="none" class="deep-spark">
              <polyline :points="sparkline(store.deepAnalysis.netGrowthTrend)" class="spark-line net" />
            </svg>
          </div>
          <div class="deep-trend">
            <span class="deep-trend-label">任务完成</span>
            <svg viewBox="0 0 220 36" preserveAspectRatio="none" class="deep-spark">
              <polyline :points="sparkline(store.deepAnalysis.taskTrend)" class="spark-line task" />
            </svg>
          </div>
          <div v-if="store.deepAnalysis.healthTrend.length" class="deep-trend">
            <span class="deep-trend-label">日均步数</span>
            <svg viewBox="0 0 220 36" preserveAspectRatio="none" class="deep-spark">
              <polyline :points="sparkline(store.deepAnalysis.healthTrend)" class="spark-line health" />
            </svg>
          </div>
          <div v-if="store.deepAnalysis.financeTrend.length" class="deep-trend">
            <span class="deep-trend-label">每周支出</span>
            <svg viewBox="0 0 220 36" preserveAspectRatio="none" class="deep-spark">
              <polyline :points="sparkline(store.deepAnalysis.financeTrend)" class="spark-line finance" />
            </svg>
          </div>
        </div>

        <ul class="deep-observations">
          <li v-for="o in store.deepAnalysis.observations" :key="o">{{ o }}</li>
        </ul>
      </template>
      <p v-else class="empty">点击「生成」，把 12 周的净成长、任务、健康、财务画成趋势线——单点看不清的东西，曲线会告诉你。</p>

      <div v-if="!unlocked('deep_analysis')" class="lock-overlay">
        <span>{{ lockMsg('deep_analysis') }}</span>
      </div>
    </section>

    <!-- ── 人生路线模拟（Lv.30 path_simulation 解锁，§9） ────────────── -->
    <section :class="['path-panel', !unlocked('path_simulation') && 'panel-locked']">
      <div class="path-header">
        <Route :size="16" />
        <h2>人生路线模拟 <span class="panel-sub">·分叉点推演</span></h2>
      </div>
      <input v-model="pathScenario" class="choice-input" placeholder="人生级抉择，例：研究生毕业后是进大厂还是去创业公司？" />
      <textarea v-model="pathOptionsText" class="choice-options" placeholder="每行一条路线&#10;路线 A：进大厂稳定发展&#10;路线 B：加入早期创业公司" rows="3" />
      <button class="choice-submit" type="button" :disabled="store.loading" @click="submitPathSimulation">
        推演每条路线 3 个月 / 1 年 / 3 年的轨迹
      </button>

      <div v-if="store.pathSimulation" class="path-result">
        <p class="path-divergence">
          <strong>关键分叉点：</strong>{{ store.pathSimulation.divergencePoint }}
        </p>
        <div class="path-tracks">
          <article v-for="p in store.pathSimulation.paths" :key="p.label" class="path-track">
            <div class="path-track-head">
              <span class="path-label">{{ p.label }}</span>
              <span class="path-align">契合 {{ p.alignmentScore }}</span>
            </div>
            <div class="path-timeline">
              <div v-for="t in p.trajectory" :key="t.horizon" class="path-step">
                <span class="path-horizon">{{ t.horizon }}</span>
                <span class="path-state">{{ t.state }}</span>
              </div>
            </div>
            <p class="path-end"><strong>终局：</strong>{{ p.endState }}</p>
            <ul v-if="p.keyRisks.length" class="path-risks">
              <li v-for="r in p.keyRisks" :key="r">{{ r }}</li>
            </ul>
          </article>
        </div>
        <p class="path-reco"><strong>NEXUS 建议：</strong>{{ store.pathSimulation.recommendation }}</p>
      </div>

      <div v-if="!unlocked('path_simulation')" class="lock-overlay">
        <span>{{ lockMsg('path_simulation') }}</span>
      </div>
    </section>

    <!-- ── 能量点商城（Lv.3 解锁，§6.7.6 皮肤/特效） ─────────────────── -->
    <section :class="['shop-panel', !unlocked('shop') && 'panel-locked']">
      <div class="shop-header">
        <Zap :size="16" />
        <h2>能量点商城 <span class="panel-sub">·皮肤/特效</span></h2>
        <span class="attr-energy"><Sparkles :size="13" /> {{ store.shop?.energyPoints ?? store.user?.energyPoints ?? 0 }} EP</span>
      </div>

      <div v-if="store.shop" class="shop-grid">
        <article
          v-for="item in store.shop.catalog"
          :key="item.id"
          :class="['shop-item', { owned: store.shop.owned.includes(item.id), equipped: store.shop.equipped === item.id }]"
        >
          <div class="shop-item-top">
            <span class="shop-item-name">{{ item.name }}</span>
            <span class="shop-item-kind">{{ item.kind === 'skin' ? '皮肤' : '特效' }}</span>
          </div>
          <p class="shop-item-desc">{{ item.description }}</p>
          <div class="shop-item-foot">
            <span class="shop-item-cost"><Sparkles :size="12" /> {{ item.cost }}</span>
            <button
              v-if="store.shop.equipped === item.id"
              class="shop-btn equipped"
              type="button"
              disabled
            >已装备</button>
            <button
              v-else-if="store.shop.owned.includes(item.id)"
              class="shop-btn equip"
              type="button"
              :disabled="store.loading"
              @click="store.equipSkin(item.id)"
            >装备</button>
            <button
              v-else
              class="shop-btn buy"
              type="button"
              :disabled="store.loading || store.shop.energyPoints < item.cost || store.shop.credibilityScore < item.minCredibility"
              :title="store.shop.credibilityScore < item.minCredibility ? `需要可信度 ≥ ${item.minCredibility}` : (store.shop.energyPoints < item.cost ? '能量点不足' : '')"
              @click="store.purchaseShopItem(item.id)"
            >兑换</button>
          </div>
        </article>
      </div>

      <div v-if="!unlocked('shop')" class="lock-overlay">
        <span>{{ lockMsg('shop') }}</span>
      </div>
    </section>

    <section class="goals-section">
      <div class="goals-header">
        <Target :size="16" />
        <h2>进化目标</h2>
        <button
          class="icon-button"
          title="添加目标"
          type="button"
          :disabled="store.loading"
          @click="showGoalForm = !showGoalForm"
        >
          <Plus :size="18" />
        </button>
      </div>
      <form v-if="showGoalForm" class="goal-form" @submit.prevent="createGoal">
        <input v-model="newGoalTitle" placeholder="进化目标，例：本周完成 NEXUS-7 Phase 0" autofocus />
        <select v-model="newGoalLevel">
          <option value="ultimate">终极目标</option>
          <option value="long_term">长期目标</option>
          <option value="stage">阶段目标</option>
          <option value="weekly">周目标</option>
          <option value="daily">日目标</option>
        </select>
        <button type="submit" :disabled="!newGoalTitle.trim() || store.loading">创建</button>
      </form>
      <div class="goal-list">
        <span v-for="goal in store.goals" :key="goal.id" class="goal-chip">
          <span class="goal-level-tag">{{ goalLevelLabel[goal.level] }}</span>
          {{ goal.title }}
          <button
            class="goal-chip-btn"
            title="标记完成"
            type="button"
            :disabled="store.loading"
            @click.stop="store.updateGoalStatus(goal.id, 'completed')"
          ><Check :size="12" /></button>
          <button
            class="goal-chip-btn"
            title="暂停目标"
            type="button"
            :disabled="store.loading"
            @click.stop="store.updateGoalStatus(goal.id, 'paused')"
          ><Pause :size="12" /></button>
        </span>
        <span v-if="store.goals.length === 0" class="empty">设定进化目标后，晨间仪式将生成定向执行协议。</span>
      </div>
    </section>

    <section class="workspace-grid">
      <section class="panel task-panel">
        <div class="panel-heading">
          <Activity :size="18" />
          <h2>今日执行协议 <span class="panel-sub">·行动矩阵</span></h2>
        </div>
        <div class="task-list">
          <article v-for="row in taskRows" :key="row.task.id" class="task-row">
            <div class="task-main">
              <div class="task-title-row">
                <h3>{{ row.task.title }}</h3>
                <span :class="['status-badge', row.task.status]">{{ statusLabel[row.task.status] }}</span>
              </div>
              <p>{{ row.task.description || row.task.acceptanceCriteria }}</p>
              <div class="task-meta">
                <span><Zap :size="14" />{{ energyLabel[row.task.energyRequired] }}</span>
                <span><Clock :size="14" />{{ row.task.estimatedMinutes ?? "?" }} 分钟</span>
                <span><Sparkles :size="14" />+{{ row.task.rewardPoints }}</span>
              </div>
              <dl class="task-proof">
                <div>
                  <dt>验收</dt>
                  <dd>{{ row.task.acceptanceCriteria }}</dd>
                </div>
                <div>
                  <dt>证明</dt>
                  <dd>{{ row.task.proofMethod }}</dd>
                </div>
              </dl>
            </div>

            <div class="evidence-box">
              <textarea v-model="row.draft.note" placeholder="证据备注：完成了什么，或为什么失败" />
              <div class="evidence-grid">
                <label>
                  <Clock :size="14" />
                  <input v-model="row.draft.actualMinutes" inputmode="numeric" placeholder="实际分钟" />
                </label>
                <label>
                  <LinkIcon :size="14" />
                  <input v-model="row.draft.proofLink" placeholder="证明链接" />
                </label>
              </div>
            </div>

            <div class="task-actions">
              <button
                title="开始"
                type="button"
                :disabled="row.task.status === 'in_progress' || row.task.status === 'completed'"
                @click="updateTask(row.task, 'in_progress')"
              >
                <Play :size="16" />
              </button>
              <button
                title="暂停"
                type="button"
                :disabled="row.task.status !== 'in_progress'"
                @click="updateTask(row.task, 'paused')"
              >
                <Pause :size="16" />
              </button>
              <button
                title="完成"
                type="button"
                :disabled="row.task.status === 'completed'"
                @click="updateTask(row.task, 'completed')"
              >
                <Check :size="16" />
              </button>
              <button
                title="失败"
                type="button"
                :disabled="row.task.status === 'failed' || row.task.status === 'completed'"
                @click="updateTask(row.task, 'failed')"
              >
                <X :size="16" />
              </button>
            </div>
          </article>
          <p v-if="store.tasks.length === 0" class="empty">启动晨间仪式后，系统将生成今日执行协议。</p>
        </div>
      </section>

      <section :class="['panel', 'companion-panel', `skin-${store.companion?.currentForm ?? 'default'}`]">
        <div class="panel-heading">
          <Bot :size="18" />
          <h2>系统核心 <span class="panel-sub">·意识接口</span></h2>
          <button
            class="steward-btn"
            type="button"
            title="守护巡查：荒废的维度由主小人主动提醒（多管家汇总成一个声音）"
            :disabled="store.loading"
            @click="store.runStewardSweep()"
          >
            <Stethoscope :size="13" /> 守护巡查
          </button>
        </div>
        <Live2DStage :state="store.companion?.currentState ?? 'idle'" :size="168" />
        <p class="companion-dialogue">
          {{ store.companion?.currentDialogue ?? "NEXUS-7 神经链路已建立。等待宿主指令。" }}
        </p>
        <div class="metrics">
          <div>
            <strong>{{ store.completedToday }}</strong>
            <span>已完成</span>
          </div>
          <div>
            <strong>{{ store.activeTasks.length }}</strong>
            <span>待推进</span>
          </div>
          <div>
            <strong>{{ store.goals.length }}</strong>
            <span>活跃目标</span>
          </div>
        </div>
      </section>

      <section class="panel review-panel">
        <div class="panel-heading">
          <FileText :size="18" />
          <h2>日终校准记录 <span class="panel-sub">·真实性检验</span></h2>
        </div>
        <div v-if="store.latestReview" class="review-content">
          <p>{{ reviewText(store.latestReview, "summary") }}</p>
          <dl>
            <div>
              <dt>真实偏差</dt>
              <dd>{{ reviewText(store.latestReview, "honestDelta") }}</dd>
            </div>
            <div>
              <dt>明日调整</dt>
              <dd>{{ reviewText(store.latestReview, "tomorrowAdjustment") }}</dd>
            </div>
          </dl>
          <div class="tag-row">
            <span v-for="tag in store.latestReview.emotionTags" :key="tag">{{ tag }}</span>
          </div>
          <ul class="risk-list">
            <li v-for="risk in reviewRisks(store.latestReview)" :key="risk">
              <Flag :size="14" />
              {{ risk }}
            </li>
          </ul>
          <button
            v-if="reviewText(store.latestReview, 'honestDelta')"
            class="insist-btn"
            type="button"
            title="不认同系统的判断？开启黑箱裁决，现实会说话"
            :disabled="store.loading"
            @click="insistAgainstReview"
          >
            <Gavel :size="13" /> 我坚持（开启裁决）
          </button>
        </div>
        <p v-else class="empty">完成日终校准协议后，系统将生成结构化真实性报告。</p>
      </section>

      <section class="panel events-panel">
        <div class="panel-heading">
          <Flag :size="18" />
          <h2>神经脉冲流 <span class="panel-sub">·行为事件</span></h2>
        </div>
        <div class="event-list">
          <article v-for="event in store.events" :key="event.id" class="event-row">
            <div>
              <strong>{{ event.category ?? event.type }}</strong>
              <span>{{ event.source }} · {{ formatTime(event.occurredAt) }}</span>
            </div>
            <p>{{ summarizeEvent(event) }}</p>
            <details>
              <summary>结构化数据</summary>
              <pre>{{ prettyJson(event.structured) }}</pre>
            </details>
          </article>
          <p v-if="store.events.length === 0" class="empty">神经脉冲流尚未激活。开始使用后实时记录。</p>
        </div>
      </section>

      <section class="panel chat-panel">
        <div class="panel-heading">
          <MessageSquare :size="18" />
          <h2>神经链接 <span class="panel-sub">·实时通信</span></h2>
        </div>
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
      </section>
    </section>

    <!-- 桌面悬浮小人（可拖动，任务完成弹出） -->
    <FloatingCompanion />

    <!-- 首次启动觉醒仪式（§7.2，未 onboarded 时全屏覆盖） -->
    <Teleport to="body">
      <OnboardingRitual v-if="showOnboarding" @done="ritualDismissed = true" />
    </Teleport>
  </main>
</template>
