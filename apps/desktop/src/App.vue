<script setup lang="ts">
import type { AttributeKey, Bounty, BountyCategory, FeatureKey, GoalLevel, NetGrowthVerdict, NexusEvent, ProfileChangeProposal, ProfileChangeStatus, Review, Task, TaskStatus, TaskStatusUpdateEvidence, UserStreak } from "@nexus/shared";
import { ATTRIBUTE_LABELS, BOUNTY_CATEGORY_LABELS, BOUNTY_STATE_LABELS, DIVERGENCE_STATUS_LABELS, MBTI_AXIS_KEYS, NET_GROWTH_VERDICT_LABELS, OBSERVED_DIM_KEYS, OBSERVED_DIM_LABELS, PERIOD_TREND_LABELS, STREAK_LABELS, UNLOCK_LABELS, UNLOCK_LEVELS, assessProfileGrade, isFeatureUnlocked, profileFieldRiskTier, xpToNextLevel } from "@nexus/shared";
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  Bot,
  Brain,
  Check,
  CircleDot,
  Clock,
  Edit3,
  FileText,
  Flag,
  Flame,
  Image as ImageIcon,
  LayoutDashboard,
  Link as LinkIcon,
  Moon,
  Pause,
  Play,
  BookOpen,
  CalendarCheck,
  CalendarRange,
  GraduationCap,
  HeartPulse,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Database,
  Dna,
  Dumbbell,
  Flower2,
  Gamepad2,
  Gavel,
  Gift,
  Palette,
  Plane,
  Shirt,
  Smartphone,
  Sofa,
  UtensilsCrossed,
  Trash2,
  LineChart,
  Network,
  Stethoscope,
  Wallet,
  Plus,
  RefreshCw,
  Route,
  Scale,
  Shield,
  Fingerprint,
  Radar,
  History,
  RotateCcw,
  ChevronDown,
  ScrollText,
  Split,
  Timer,
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
import { type Component, computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import FloatingCompanion from "./components/FloatingCompanion.vue";
import FocusTimer from "./components/FocusTimer.vue";
import GuideTour from "./components/GuideTour.vue";
import Live2DStage from "./components/Live2DStage.vue";
import OnboardingRitual from "./components/OnboardingRitual.vue";
import { useFocusTimer } from "./focus-timer";
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
import { api, assetUrl, isBusy } from "./api";
import ChatWindow from "./components/ChatWindow.vue";
import { useNexusStore } from "./store";

interface EvidenceDraft {
  note: string;
  proofLink: string;
  actualMinutes: string;
}

const store = useNexusStore();
const focusTimer = useFocusTimer();
function startFocus(task: Task) {
  // 专注 = 进入深度模式：立刻起计时，并把任务设为进行中（合并「开始」）
  focusTimer.start(task.id, task.title);
  if (task.status !== "in_progress" && task.status !== "completed") {
    void store.updateTaskStatus(task.id, "in_progress");
  }
}

// 进行中任务的实时计时：每秒走一次的 now，驱动"已进行 / 剩余"显示
const nowMs = ref(Date.now());
let clockTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  clockTimer = setInterval(() => {
    nowMs.value = Date.now();
  }, 1000);
});
onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer);
});
function taskElapsedSec(task: Task): number {
  if (!task.startedAt) return 0;
  return Math.max(0, Math.floor((nowMs.value - new Date(task.startedAt).getTime()) / 1000));
}
function fmtDuration(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}
function taskRunProgress(task: Task): number {
  if (!task.estimatedMinutes) return 0;
  return Math.min(1, taskElapsedSec(task) / 60 / task.estimatedMinutes);
}
function taskOvertime(task: Task): boolean {
  return !!task.estimatedMinutes && taskElapsedSec(task) / 60 > task.estimatedMinutes;
}
function taskRemainLabel(task: Task): string {
  if (!task.estimatedMinutes) return "";
  const remain = task.estimatedMinutes - taskElapsedSec(task) / 60;
  return remain >= 0 ? `剩 ${Math.ceil(remain)} 分钟` : `超时 ${Math.floor(-remain)} 分钟`;
}

const ritualDismissed = ref(false);
const showOnboarding = computed(() => store.needsOnboarding && !ritualDismissed.value);
// #6 新手指引：已 onboarded、档案就绪、且没看过指引时显示
const guideSeen = ref(localStorage.getItem("nexus-guide-seen") === "1");
const showGuide = computed(
  () => !guideSeen.value && store.profile !== null && !store.needsOnboarding && !showOnboarding.value,
);
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

// ── 自定义悬赏与 AI 定价（商城子系统）──────────────────────────────
const showWishForm = ref(false);
const wishTitle = ref("");
const wishNote = ref("");
const wishReference = ref("");
async function submitWish() {
  const title = wishTitle.value.trim();
  if (!title) return;
  const refPrice = Number(wishReference.value);
  const result = await store.proposeBounty(
    title,
    wishNote.value.trim() || undefined,
    Number.isFinite(refPrice) && refPrice > 0 ? refPrice : undefined,
  );
  // 定价/婉拒后清空表单；澄清则保留，待宿主补充后重提
  if (result && result.verdict !== "clarify") {
    wishTitle.value = "";
    wishNote.value = "";
    wishReference.value = "";
    showWishForm.value = false;
  }
}
/** 心愿进度：当前能量 / 价格（0..1）*/
function bountyProgress(price: number): number {
  const energy = store.bounties?.energyPoints ?? 0;
  if (price <= 0) return 1;
  return Math.min(1, energy / price);
}
/** 近 14 天内被节奏漂移再校准过 → 卡片上提示 */
function recentlyRepriced(b: Bounty): boolean {
  const at = b.priceBreakdown.repricedAt;
  return !!at && Date.now() - new Date(at).getTime() < 14 * 86400000;
}
// 分类顺序 + 每类一个 lucide 图标（充当商品「图」，京东淘宝式卡片）
const CATEGORY_ORDER: BountyCategory[] = [
  "electronics", "food", "apparel", "entertainment", "travel",
  "learning", "fitness", "beauty", "home", "other",
];
const CATEGORY_ICON: Record<BountyCategory, Component> = {
  electronics: Smartphone,
  food: UtensilsCrossed,
  apparel: Shirt,
  entertainment: Gamepad2,
  travel: Plane,
  learning: BookOpen,
  fitness: Dumbbell,
  beauty: Flower2,
  home: Sofa,
  other: Gift,
};
const SKIN_ICON = Palette;
// 从非响应式 const 取图标组件（避免把组件放进响应式 computed 触发警告）
function categoryIcon(c: BountyCategory): Component {
  return CATEGORY_ICON[c];
}
const energyNow = computed(() => store.bounties?.energyPoints ?? store.shop?.energyPoints ?? store.user?.energyPoints ?? 0);

// ── 商城：可兑换的商品（未拥有的皮肤/特效 + 已定价的心愿）按类别陈列 ──
const purchasableSkins = computed(() => {
  const shop = store.shop;
  if (!shop) return [];
  return shop.catalog.filter((item) => !shop.owned.includes(item.id));
});
const marketBounties = computed(() =>
  (store.bounties?.bounties ?? []).filter((b) => b.state === "saving" || b.state === "redeemable"),
);
const marketByCategory = computed(() =>
  CATEGORY_ORDER.map((category) => ({
    category,
    label: BOUNTY_CATEGORY_LABELS[category],
    items: marketBounties.value.filter((b) => b.category === category),
  })).filter((g) => g.items.length > 0),
);
const hasMarket = computed(() => purchasableSkins.value.length > 0 || marketBounties.value.length > 0);

// ── 奖励库：已获得（已拥有皮肤/特效 + 已兑现心愿）按类别陈列 ──
const ownedSkins = computed(() => {
  const shop = store.shop;
  if (!shop) return [];
  return shop.catalog
    .filter((item) => shop.owned.includes(item.id))
    .map((item) => ({ ...item, equipped: shop.equipped === item.id }));
});
const obtainedBounties = computed(() =>
  (store.bounties?.bounties ?? []).filter((b) => b.state === "redeemed" || b.state === "fulfilled"),
);
const vaultByCategory = computed(() =>
  CATEGORY_ORDER.map((category) => ({
    category,
    label: BOUNTY_CATEGORY_LABELS[category],
    items: obtainedBounties.value.filter((b) => b.category === category),
  })).filter((g) => g.items.length > 0),
);
const hasRewards = computed(() => obtainedBounties.value.length > 0 || ownedSkins.value.length > 0);
const dismissedBounties = computed(() =>
  (store.bounties?.bounties ?? []).filter((b) => b.state === "rejected" || b.state === "abandoned"),
);

const showProfileForm = ref(false);
const profileDraft = reactive({
  name: "",
  codename: "",
  focus: "",
  vision: "",
  redLines: "",
  mbtiEI: "",
  mbtiSN: "",
  mbtiTF: "",
  mbtiJP: "",
});

// MBTI 四轴（声明层「人格基线 · 自评」，§7.1）
const MBTI_AXES = [
  { key: "mbtiEI", a: "E", b: "I", la: "外向", lb: "内向" },
  { key: "mbtiSN", a: "S", b: "N", la: "实感", lb: "直觉" },
  { key: "mbtiTF", a: "T", b: "F", la: "思考", lb: "情感" },
  { key: "mbtiJP", a: "J", b: "P", la: "判断", lb: "感知" },
] as const;
type MbtiAxisKey = (typeof MBTI_AXES)[number]["key"];
function setMbtiAxis(key: MbtiAxisKey, val: string) {
  profileDraft[key] = profileDraft[key] === val ? "" : val;
}

function openProfileForm() {
  const p = store.profile;
  profileDraft.name = String(p?.basicInfo?.name ?? "");
  profileDraft.codename = String(p?.basicInfo?.codename ?? "");
  profileDraft.focus = String(p?.basicInfo?.focus ?? "");
  profileDraft.vision = String(p?.longTermVision?.statement ?? "");
  profileDraft.redLines = Array.isArray(p?.redLines) ? p.redLines.join("\n") : "";
  const mbti = ((p?.traits as Record<string, unknown> | undefined)?.mbti as { type?: unknown } | undefined)?.type;
  const t = typeof mbti === "string" ? mbti.toUpperCase() : "";
  profileDraft.mbtiEI = t[0] === "E" || t[0] === "I" ? t[0] : "";
  profileDraft.mbtiSN = t[1] === "S" || t[1] === "N" ? t[1] : "";
  profileDraft.mbtiTF = t[2] === "T" || t[2] === "F" ? t[2] : "";
  profileDraft.mbtiJP = t[3] === "J" || t[3] === "P" ? t[3] : "";
  showProfileForm.value = true;
}

function toggleProfileForm() {
  if (showProfileForm.value) showProfileForm.value = false;
  else openProfileForm();
}

async function saveProfile() {
  const redLines = profileDraft.redLines
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const mbtiType =
    profileDraft.mbtiEI && profileDraft.mbtiSN && profileDraft.mbtiTF && profileDraft.mbtiJP
      ? profileDraft.mbtiEI + profileDraft.mbtiSN + profileDraft.mbtiTF + profileDraft.mbtiJP
      : "";
  await store.updateProfile({
    basicInfo: {
      ...(store.profile?.basicInfo ?? {}),
      name: profileDraft.name.trim(),
      codename: profileDraft.codename.trim() || "宿主",
      focus: profileDraft.focus.trim(),
    },
    traits: {
      ...(store.profile?.traits ?? {}),
      // 自评基线：仅四轴齐全才写入；行为校准（观测层）是 P3 范畴，互不覆盖
      ...(mbtiType ? { mbti: { type: mbtiType, source: "self", setAt: new Date().toISOString() } } : {}),
    },
    longTermVision: {
      ...(store.profile?.longTermVision ?? {}),
      statement: profileDraft.vision.trim(),
    },
    redLines,
  });
  if (!store.error) showProfileForm.value = false;
}

// ── 宿主档案：只读视图派生数据（避免把信息藏在编辑表单里） ──────────
const profileCodename = computed(() => String(store.profile?.basicInfo?.codename ?? "宿主"));
const profileName = computed(() => String(store.profile?.basicInfo?.name ?? "").trim());
const profileDisplayName = computed(() => profileName.value || profileCodename.value);
const profileMbti = computed(() => {
  const m = (store.profile?.traits as Record<string, unknown> | undefined)?.mbti as { type?: unknown } | undefined;
  return typeof m?.type === "string" ? m.type.toUpperCase() : "";
});
const profileInitial = computed(() => {
  const c = profileDisplayName.value.trim();
  return c ? c[0]!.toUpperCase() : "?";
});
const profileFocus = computed(() => String(store.profile?.basicInfo?.focus ?? "").trim());
const profileVision = computed(() => String(store.profile?.longTermVision?.statement ?? "").trim());
const profileRedLines = computed<string[]>(() =>
  Array.isArray(store.profile?.redLines) ? store.profile!.redLines.filter((s) => s.trim()) : [],
);
const profilePersona = computed(() => {
  const t = (store.profile?.traits ?? {}) as Record<string, unknown>;
  return typeof t.personaSummary === "string" ? t.personaSummary : "";
});
const profileSyncedAt = computed(() => {
  const iso = store.profile?.updatedAt;
  if (!iso) return "——";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "——";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
});

// ── 观测层 · 活体画像（规划书 §6/§9，P2/P3/P4）──────────────────────
const showObserved = ref(false);
const obs = computed(() => store.observation);

const obsDims = computed(() =>
  OBSERVED_DIM_KEYS.map((k) => {
    const d = obs.value?.dimensions?.[k];
    return {
      key: k,
      label: OBSERVED_DIM_LABELS[k],
      score: d?.score ?? 0,
      confidence: d?.confidence ?? 0,
      note: d?.note ?? "",
    };
  }),
);

// 六维雷达几何（viewBox 0 0 180 180，中心 90，半径 64）
const RADAR_C = 90;
const RADAR_R = 64;
function radarPoint(frac: number, i: number, n: number): [number, number] {
  const ang = ((-90 + (360 / n) * i) * Math.PI) / 180;
  return [RADAR_C + RADAR_R * frac * Math.cos(ang), RADAR_C + RADAR_R * frac * Math.sin(ang)];
}
const radar = computed(() => {
  const dims = obsDims.value;
  const n = dims.length;
  const polygon = dims.map((d, i) => radarPoint(Math.max(0.03, d.score), i, n).join(",")).join(" ");
  const axes = dims.map((d, i) => {
    const [x, y] = radarPoint(1, i, n);
    const [lx, ly] = radarPoint(1.24, i, n);
    return { x, y, lx, ly, label: d.label, key: d.key };
  });
  const rings = [0.25, 0.5, 0.75, 1].map((r) =>
    dims.map((_, i) => radarPoint(r, i, n).join(",")).join(" "),
  );
  return { polygon, axes, rings };
});

const MBTI_POLES: Record<string, [string, string]> = {
  EI: ["E", "I"],
  SN: ["S", "N"],
  TF: ["T", "F"],
  JP: ["J", "P"],
};
const MBTI_AXIS_NAMES: Record<string, string> = {
  EI: "能量来源",
  SN: "信息获取",
  TF: "决策方式",
  JP: "生活态度",
};
const mbtiRows = computed(() =>
  MBTI_AXIS_KEYS.map((k) => {
    const ev = obs.value?.mbtiEvidence?.[k];
    const [a, b] = MBTI_POLES[k]!;
    const lean = ev?.lean ?? "";
    const score = ev?.score ?? 0;
    const pos = lean === a ? 50 - score * 50 : lean === b ? 50 + score * 50 : 50;
    return {
      key: k,
      a,
      b,
      axisName: MBTI_AXIS_NAMES[k],
      lean,
      confidence: ev?.confidence ?? 0,
      pos,
    };
  }),
);

const NET_GROWTH_VERDICT_UI: Record<NetGrowthVerdict, { label: string; cls: string }> = {
  closer: { label: "更接近理想人生", cls: "closer" },
  neutral: { label: "持平", cls: "neutral" },
  further: { label: "更远离理想人生", cls: "further" },
};
const obsVerdict = computed(() => NET_GROWTH_VERDICT_UI[obs.value?.netGrowthVerdict ?? "neutral"]);

// ── 顶部 hero 偏差带：周期评级 + 状态标签 + 最弱项（对齐导向）──────────
const heroLongestStreak = computed(() =>
  store.streaks.reduce((m, s) => Math.max(m, s.currentStreak ?? 0), 0),
);
const hero = computed(() =>
  assessProfileGrade({
    observation: store.observation,
    credibility: store.user?.credibilityScore,
    longestStreak: heroLongestStreak.value,
  }),
);

// 自律分趋势火花线（时间线倒序 → 正序）
const disciplineTrend = computed(() => {
  const series = [...store.observationTrend]
    .reverse()
    .map((o) => o.dimensions?.discipline?.score ?? 0);
  if (series.length < 2) return "";
  const w = 120;
  const h = 26;
  return series.map((v, i) => `${(i / (series.length - 1)) * w},${(h - v * h).toFixed(1)}`).join(" ");
});

// 演化提议风险分级（规划书 §8.1）
const RISK_UI: Record<string, { label: string; cls: string }> = {
  high: { label: "高风险 · 必裁决", cls: "high" },
  medium: { label: "中风险", cls: "medium" },
  low: { label: "低风险", cls: "low" },
};
function proposalRisk(p: ProfileChangeProposal) {
  return RISK_UI[profileFieldRiskTier(p.field, p.subPath)]!;
}

// 演化时间线（已裁决 / 已回滚的历史，可回滚已接受项）
const evolutionHistory = computed(() =>
  store.profileChangeHistory.filter((p) => p.status !== "pending"),
);
const PROFILE_STATUS_UI: Record<ProfileChangeStatus, { label: string; cls: string }> = {
  accepted: { label: "已接受", cls: "accepted" },
  rejected: { label: "已拒绝", cls: "rejected" },
  rolled_back: { label: "已回滚", cls: "rolled" },
  pending: { label: "待裁决", cls: "pending" },
};

const taskRows = computed(() =>
  store.tasks.map((task) => ({
    task,
    draft: ensureEvidenceDraft(task.id),
  })),
);

// 执行页只显示"待办/进行中"的任务；已完成/失败归档到「已完成」视图
const ACTIVE_TASK_STATUSES: TaskStatus[] = ["not_started", "ready", "in_progress", "paused"];
const ARCHIVE_TASK_STATUSES: TaskStatus[] = ["completed", "reviewed", "failed"];
const activeTaskRows = computed(() =>
  taskRows.value.filter((r) => ACTIVE_TASK_STATUSES.includes(r.task.status)),
);
function archiveDateOf(task: Task): string {
  const iso =
    task.completedAt ?? task.statusHistory.at(-1)?.at ?? task.scheduledAt ?? new Date().toISOString();
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function taskNoteOf(task: Task): string {
  const n = (task.evidence as Record<string, unknown> | undefined)?.note;
  return typeof n === "string" ? n : "";
}
// 已完成任务按日期分组（日期倒序）
const archiveByDate = computed(() => {
  const groups = new Map<string, Task[]>();
  for (const t of store.tasks) {
    if (!ARCHIVE_TASK_STATUSES.includes(t.status)) continue;
    const d = archiveDateOf(t);
    const list = groups.get(d) ?? [];
    list.push(t);
    groups.set(d, list);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, tasks]) => ({ date, tasks }));
});

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

onMounted(async () => {
  await store.refresh();
  // 首页趋势图：深度分析是纯本地计算（GET，不调用 LLM），进来即拉取
  if (unlocked("deep_analysis") && !store.deepAnalysis) void store.loadDeepAnalysis();
});

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

// 首页六维属性雷达图
const attrRadar = computed(() => {
  const n = ATTR_KEYS.length;
  const cx = 92;
  const cy = 90;
  const R = 62;
  const at = (i: number, radius: number) => {
    const a = ((-90 + (360 / n) * i) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  };
  const polygon = ATTR_KEYS.map((k, i) => {
    const p = at(i, R * (attrPct(k) / 100));
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(" ");
  const rings = [0.34, 0.67, 1].map((f) =>
    ATTR_KEYS.map((_, i) => {
      const p = at(i, R * f);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(" "),
  );
  const axisPts = ATTR_KEYS.map((k, i) => {
    const edge = at(i, R);
    const label = at(i, R + 15);
    return {
      x: edge.x.toFixed(1),
      y: edge.y.toFixed(1),
      lx: label.x.toFixed(1),
      ly: label.y.toFixed(1),
      label: ATTRIBUTE_LABELS[k],
    };
  });
  return { polygon, rings, axisPts };
});

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
const ritualResultKind = ref<"plan" | "review" | "text">("text");

// ── 晨间一天一次守卫 + 系统（Windows 本地）日期（#11）──────────────
function localDateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const todayStr = ref(localDateKey());
const todayLabel = computed(() =>
  new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date()),
);
const morningPlannedDate = ref(localStorage.getItem("nexus-morning-date") ?? "");
const morningDoneToday = computed(() => morningPlannedDate.value === todayStr.value);
function markMorningDone() {
  todayStr.value = localDateKey();
  morningPlannedDate.value = todayStr.value;
  localStorage.setItem("nexus-morning-date", todayStr.value);
}

async function startMorningRitual() {
  // 一天一次：已规划则直接展示当天方案，不重复生成（重做功能后续开放）
  if (morningDoneToday.value) {
    ritualResultKind.value = store.lastPlan ? "plan" : "text";
    ritualResultTitle.value = "今天已生成晨间规划";
    ritualResult.value = store.lastPlan
      ? ""
      : "今天已完成晨间规划，可在「今日执行协议」查看今天的任务。重做功能稍后开放。";
    ritualPhase.value = "result";
    return;
  }
  ritualPhase.value = "morning";
  ritualLoading.value = true;
  ritualResult.value = "";
  try {
    await store.morningPlan();
    await nextTick();
    markMorningDone();
    ritualResultKind.value = store.lastPlan ? "plan" : "text";
    ritualResultTitle.value = "今日执行协议已生成";
    ritualResult.value = store.lastPlan ? "" : store.chat.at(-1)?.text ?? "协议已记录。";
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
    ritualResultKind.value = store.latestReview ? "review" : "text";
    ritualResultTitle.value = "日终校准协议已记录";
    ritualResult.value = store.latestReview ? "" : store.chat.at(-1)?.text ?? "校准已记录。";
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
  ritualResultKind.value = "text";
}

// ── #12 模型选择 + 重做晨间规划 ───────────────────────────────────
type PlanOverride = { modelTier?: "haiku" | "sonnet" | "opus"; model?: string };
const planModelOptions = computed(() => {
  const opts: Array<{ label: string; value: string; override: PlanOverride }> = [
    { label: "标准", value: "default", override: {} },
    { label: "快速", value: "fast", override: { modelTier: "haiku" } },
    { label: "深度", value: "deep", override: { modelTier: "opus" } },
  ];
  if (!store.offlineLlm && store.llmProvider === "deepseek") {
    opts.push({ label: "深度推理 R1", value: "r1", override: { model: "deepseek-reasoner" } });
  }
  return opts;
});
const selectedPlanModel = ref("default");
async function regeneratePlan() {
  const opt =
    planModelOptions.value.find((o) => o.value === selectedPlanModel.value) ?? planModelOptions.value[0];
  ritualLoading.value = true;
  try {
    await store.regenerateMorning(opt?.override);
    markMorningDone();
    ritualResultKind.value = store.lastPlan ? "plan" : "text";
    ritualResult.value = store.lastPlan ? "" : (store.chat.at(-1)?.text ?? "已重新生成。");
  } finally {
    ritualLoading.value = false;
  }
}

// ── #8 数据管理抽屉：按日期查看/删除 ──────────────────────────────
const dataDate = ref(localDateKey());
function loadDay() {
  store.loadDayData(dataDate.value);
}
watch(dataDate, loadDay);

// ── #12 任务行内编辑 ──────────────────────────────────────────────
const editingTaskId = ref<string | null>(null);
const taskEdit = reactive({ title: "", estimatedMinutes: "", description: "", acceptanceCriteria: "" });
function startEditTask(t: Task) {
  editingTaskId.value = t.id;
  taskEdit.title = t.title;
  taskEdit.estimatedMinutes = String(t.estimatedMinutes ?? "");
  taskEdit.description = t.description ?? "";
  taskEdit.acceptanceCriteria = t.acceptanceCriteria ?? "";
}
function cancelEditTask() {
  editingTaskId.value = null;
}
async function saveEditTask(id: string) {
  await store.editTask(id, {
    title: taskEdit.title.trim() || undefined,
    estimatedMinutes: taskEdit.estimatedMinutes ? Number(taskEdit.estimatedMinutes) : undefined,
    description: taskEdit.description,
    acceptanceCriteria: taskEdit.acceptanceCriteria.trim() || undefined,
  });
  editingTaskId.value = null;
}

// ── #2 性格测试：短测评 → 写入 profile.traits，影响晨间规划与小人语气 ──
const personaQuestions = [
  {
    key: "rhythm",
    short: "作息",
    prompt: "你的精力高峰在？",
    options: [
      { label: "早晨型", value: "morning" },
      { label: "夜猫型", value: "night" },
      { label: "全天平稳", value: "steady" },
    ],
  },
  {
    key: "motivation",
    short: "动机",
    prompt: "你更容易被什么驱动？",
    options: [
      { label: "目标成就", value: "achievement" },
      { label: "好奇探索", value: "curiosity" },
      { label: "被认可", value: "recognition" },
      { label: "避免损失", value: "security" },
    ],
  },
  {
    key: "workStyle",
    short: "风格",
    prompt: "你做事的风格？",
    options: [
      { label: "冲刺爆发", value: "sprinter" },
      { label: "稳定持续", value: "steady" },
      { label: "灵活随机", value: "flexible" },
    ],
  },
  {
    key: "approach",
    short: "方式",
    prompt: "面对大任务你倾向？",
    options: [
      { label: "拆小步逐个击破", value: "incremental" },
      { label: "一鼓作气", value: "burst" },
      { label: "先想清再动", value: "planner" },
    ],
  },
] as const;
const personaQuiz = reactive<Record<string, string>>({
  rhythm: "",
  motivation: "",
  workStyle: "",
  approach: "",
});
const personaSaved = ref("");
const personaComplete = computed(() => personaQuestions.every((q) => personaQuiz[q.key]));
function personaLabel(key: string, value: string): string {
  const q = personaQuestions.find((x) => x.key === key);
  return q?.options.find((o) => o.value === value)?.label ?? value;
}
function seedPersona() {
  const t = (store.profile?.traits ?? {}) as Record<string, unknown>;
  for (const q of personaQuestions) {
    personaQuiz[q.key] = typeof t[q.key] === "string" ? (t[q.key] as string) : "";
  }
  personaSaved.value = typeof t.personaSummary === "string" ? (t.personaSummary as string) : "";
}
async function submitPersona() {
  const summary = personaQuestions
    .map((q) => `${q.short}:${personaLabel(q.key, personaQuiz[q.key] ?? "")}`)
    .join(" · ");
  await store.updateProfile({
    traits: {
      ...(store.profile?.traits ?? {}),
      rhythm: personaQuiz.rhythm,
      motivation: personaQuiz.motivation,
      workStyle: personaQuiz.workStyle,
      approach: personaQuiz.approach,
      personaSummary: summary,
    },
  });
  personaSaved.value = summary;
}

// ── #10 证据图片上传 ──────────────────────────────────────────────
const proofUploading = ref<string | null>(null);
function isImageProof(link: string): boolean {
  return /^\/uploads\//.test(link) || /\.(png|jpe?g|webp|gif)$/i.test(link);
}
async function onProofFile(e: Event, draft: EvidenceDraft) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  proofUploading.value = file.name;
  try {
    const dataUrl = await new Promise<string>((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(String(reader.result));
      reader.onerror = () => rej(new Error("读取文件失败"));
      reader.readAsDataURL(file);
    });
    const { url } = await api.uploadImage(dataUrl, file.name);
    draft.proofLink = url;
  } catch (err) {
    store.error = err instanceof Error ? err.message : String(err);
  } finally {
    proofUploading.value = null;
    input.value = "";
  }
}

// ── 模块抽屉（左栏入口 + 右侧侧滑，一次只开一个） ──────────────────
const MODULES = [
  { key: "profile", label: "档案", title: "宿主档案", icon: User },
  { key: "level", label: "等级", title: "觉醒等级 · 六维属性", icon: Zap },
  { key: "insight", label: "洞察", title: "行为洞察报告", icon: Brain },
  { key: "decision", label: "决策", title: "决策中枢 · 黑箱裁决 · 进化日志", icon: Scale },
  { key: "report", label: "报告", title: "周期报告", icon: CalendarRange },
  { key: "sense", label: "感知", title: "全域感知 · 日历 / 生命体征 / 财务 / 学习", icon: HeartPulse },
  { key: "sim", label: "推演", title: "推演与趋势 · 关系图谱 / 深度趋势 / 路线模拟", icon: Network },
  { key: "shop", label: "商城", title: "能量点商城", icon: Sparkles },
  { key: "goals", label: "目标", title: "进化目标", icon: Target },
  { key: "archive", label: "已完成", title: "已完成 · 按日期归档", icon: CalendarCheck },
  { key: "persona", label: "性格", title: "性格测试 · 让方案更贴合你", icon: Dna },
  { key: "data", label: "数据", title: "数据管理 · 按日期查看 / 修改 / 删除", icon: Database },
] as const;

// ── 主视图切换：总览 / 执行 / 各模块，全部整页切换（不再用抽屉）────────
const MAIN_VIEWS = [
  { key: "home", label: "总览", title: "态势总览 · 图形汇总", icon: LayoutDashboard },
  { key: "workspace", label: "执行", title: "今日执行中枢 · 任务 / 小人 / 复盘 / 事件", icon: Activity },
] as const;
type MainView = (typeof MAIN_VIEWS)[number]["key"] | (typeof MODULES)[number]["key"];
const VIEW_TITLES: Record<string, string> = {
  home: "态势总览",
  workspace: "今日执行中枢",
  ...Object.fromEntries(MODULES.map((m) => [m.key, m.label])),
};
const mainView = ref<MainView>(
  (() => {
    const saved = localStorage.getItem("nexus-main-view");
    return saved && saved in VIEW_TITLES ? (saved as MainView) : "home";
  })(),
);
// 当前模块（home/workspace 之外即模块整页）
const currentModule = computed(() => MODULES.find((m) => m.key === mainView.value) ?? null);
function setMainView(v: MainView) {
  mainView.value = v;
  localStorage.setItem("nexus-main-view", v);
}
// 切到数据 / 性格模块时的副作用：载入当天数据、回填测评结果
watch(mainView, (k) => {
  if (k === "data") loadDay();
  if (k === "persona") seedPersona();
  if (k === "profile") void store.loadProfilePanel();
  if (k === "shop" && unlocked("shop")) {
    void store.loadBounties();
    void store.loadShop();
  }
});

// 错误弹窗：4.5s 自动消失（也可手动关闭）
let errorTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => store.error,
  (e) => {
    if (errorTimer) {
      clearTimeout(errorTimer);
      errorTimer = null;
    }
    if (e) errorTimer = setTimeout(() => { store.error = ""; }, 4500);
  },
);

// ── 仪表盘外壳：侧边栏折叠 + 面包屑 + 欢迎横幅数据 ────────────────────
const sidebarCollapsed = ref(localStorage.getItem("nexus-sidebar-collapsed") === "1");
function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
  localStorage.setItem("nexus-sidebar-collapsed", sidebarCollapsed.value ? "1" : "0");
}
const currentViewLabel = computed(() => VIEW_TITLES[mainView.value] ?? "态势总览");
const hostName = computed(() => {
  const name = (store.profile?.basicInfo as { codename?: string } | undefined)?.codename;
  return name && String(name).trim() ? String(name) : "宿主";
});
const aliveStreakCount = computed(() => streakChips.value.filter((c) => c.current > 0).length);
const longestStreak = computed(() =>
  streakChips.value.reduce((max, c) => Math.max(max, c.current), 0),
);
const overviewInsight = computed(() => {
  if (store.netGrowth?.summary) return store.netGrowth.summary;
  if (store.latestInsight?.coreInsight) return store.latestInsight.coreInsight;
  if (store.report?.narrative?.headline) return store.report.narrative.headline;
  return "数据积累中：完成晨间规划与任务、做一次净成长研判后，这里会告诉你「是否在前进」并给出建议。";
});
</script>

<template>
  <main class="shell" :class="{ 'nav-collapsed': sidebarCollapsed }">
    <header class="appbar">
      <div class="crumb">
        <span class="crumb-home">首页</span>
        <span class="crumb-sep">/</span>
        <span class="crumb-cur">{{ currentViewLabel }}</span>
      </div>
      <div class="status-row">
        <span
          v-if="store.user"
          class="status-pill level-pill"
          :title="`经验 ${levelInfo.xpProgress} / ${levelInfo.xpNeeded - levelInfo.level * levelInfo.level * 100} XP → Lv.${levelInfo.level + 1}`"
        >
          <Zap :size="14" />
          Lv.{{ levelInfo.level }}
          <span class="level-pill-bar"><span class="level-pill-fill" :style="{ width: levelInfo.pct + '%' }" /></span>
        </span>
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
        <span class="appbar-user"><User :size="14" /> {{ hostName }}</span>
      </div>
    </header>

    <!-- 欢迎横幅（仅总览页）──────────────────────────────────────────── -->
    <section v-if="mainView === 'home'" class="welcome-banner">
      <div class="wb-left">
        <h1 class="wb-title">欢迎回来，{{ hostName }} 👋</h1>
        <p class="wb-sub">NEXUS-7 · 个体进化协议 —— 今天的行为，是更接近还是更远离理想人生？</p>
      </div>
      <div class="wb-kpis">
        <div class="wb-kpi"><span class="wb-kpi-num">{{ store.goals.length }}</span><span class="wb-kpi-label">活跃目标</span></div>
        <div class="wb-kpi"><span class="wb-kpi-num">{{ aliveStreakCount }}</span><span class="wb-kpi-label">在持习惯</span></div>
        <div class="wb-kpi"><span class="wb-kpi-num">Lv.{{ levelInfo.level }}</span><span class="wb-kpi-label">觉醒等级</span></div>
      </div>
    </section>

    <section v-if="mainView === 'home'" class="command-band">
      <button
        type="button"
        :class="{ 'cmd-done': morningDoneToday }"
        :disabled="store.loading"
        :title="morningDoneToday ? '今天已生成晨间规划，点击查看' : '生成今日执行协议'"
        @click="startMorningRitual"
      >
        <Sun :size="18" />
        {{ morningDoneToday ? "今日已规划 ✓" : "启动晨间仪式" }}
      </button>
      <button type="button" :disabled="store.loading" @click="startReviewRitual">
        <Moon :size="18" />
        日终校准协议
      </button>
      <span class="command-date"><CalendarClock :size="14" /> {{ todayLabel }}</span>
    </section>

    <!-- ── 习惯链常驻展示（§6.6.1） ──────────────────────────────────── -->
    <section v-if="mainView === 'home' && streakChips.length > 0" class="streak-strip">
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

            <!-- 晨间：结构化方案卡片 -->
            <div v-if="ritualResultKind === 'plan' && store.lastPlan" class="ritual-plan">
              <p v-if="store.lastPlan.rationale" class="ritual-plan-rationale">{{ store.lastPlan.rationale }}</p>
              <ol class="ritual-plan-tasks">
                <li v-for="(t, i) in store.lastPlan.tasks" :key="i" class="ritual-plan-task">
                  <div class="ritual-plan-task-head">
                    <span class="ritual-plan-task-title">{{ t.title }}</span>
                    <span class="ritual-plan-task-min"><Clock :size="12" /> {{ t.estimatedMinutes }} 分钟</span>
                  </div>
                  <p v-if="t.description" class="ritual-plan-task-desc">{{ t.description }}</p>
                  <div class="ritual-plan-task-meta">
                    <span>{{ energyLabel[t.energyRequired] }}</span>
                    <span>+{{ t.rewardPoints }} EP</span>
                  </div>
                </li>
              </ol>
              <ul v-if="store.lastPlan.risks && store.lastPlan.risks.length" class="ritual-plan-risks">
                <li v-for="(r, i) in store.lastPlan.risks" :key="i"><Flag :size="12" /> {{ r }}</li>
              </ul>
            </div>

            <!-- 日终：结构化复盘 -->
            <div v-else-if="ritualResultKind === 'review' && store.latestReview" class="ritual-review">
              <p class="ritual-review-summary">{{ reviewText(store.latestReview, 'summary') }}</p>
              <div class="ritual-review-row">
                <span class="ritual-review-label">真实偏差</span>
                <p>{{ reviewText(store.latestReview, 'honestDelta') }}</p>
              </div>
              <div class="ritual-review-row">
                <span class="ritual-review-label">明日调整</span>
                <p>{{ reviewText(store.latestReview, 'tomorrowAdjustment') }}</p>
              </div>
              <ul v-if="reviewRisks(store.latestReview).length" class="ritual-review-risks">
                <li v-for="r in reviewRisks(store.latestReview)" :key="r"><Flag :size="12" /> {{ r }}</li>
              </ul>
            </div>

            <!-- 兜底纯文本 -->
            <p v-else class="ritual-result-text">{{ ritualResult }}</p>

            <!-- #12 不满意？换模型重做 -->
            <div v-if="ritualResultKind === 'plan'" class="ritual-regen">
              <span class="ritual-regen-label">不满意？</span>
              <select v-model="selectedPlanModel" class="ritual-regen-select" :disabled="ritualLoading">
                <option v-for="o in planModelOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
              <button
                type="button"
                class="ritual-regen-btn"
                :disabled="ritualLoading || store.loading"
                @click="regeneratePlan"
              >
                <RefreshCw :size="14" /> {{ ritualLoading ? "生成中…" : "重做" }}
              </button>
            </div>

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

    <!-- ── 模块整页：点侧栏直接整屏切换（与总览/执行同级，不再用抽屉）──── -->
    <section v-if="currentModule" class="module-page">
      <header class="module-page-head">
        <component :is="currentModule.icon" :size="18" />
        <h2>{{ currentModule.title }}</h2>
      </header>
      <div class="module-page-body">

    <template v-if="mainView === 'profile'">
    <section class="dossier">
      <span class="dossier-corner tl" aria-hidden="true" />
      <span class="dossier-corner tr" aria-hidden="true" />
      <span class="dossier-corner bl" aria-hidden="true" />
      <span class="dossier-corner br" aria-hidden="true" />

      <!-- 身份核心卡 -->
      <header class="dossier-id">
        <div class="dossier-sigil">
          <span class="dossier-sigil-char">{{ profileInitial }}</span>
          <Fingerprint class="dossier-sigil-mark" :size="13" />
        </div>
        <div class="dossier-id-main">
          <span class="dossier-eyebrow">HOST DOSSIER · 宿主档案</span>
          <h2 class="dossier-codename">{{ profileDisplayName }}</h2>
          <p class="dossier-status">
            <span class="dossier-pulse" aria-hidden="true" />
            <span>档案在线</span>
            <span v-if="profileName" class="dossier-callsign">· @{{ profileCodename }}</span>
            <span class="dossier-mbti" :class="{ unset: !profileMbti }">
              <Brain :size="11" />
              {{ profileMbti || "MBTI 待评" }}<em v-if="profileMbti"> · 自评</em>
            </span>
          </p>
        </div>
        <div class="dossier-meta">
          <span class="dossier-tag lvl"><Zap :size="12" /> Lv.{{ levelInfo.level }}</span>
          <span class="dossier-tag">REV {{ String(store.profile?.version ?? 1).padStart(2, "0") }}</span>
          <span class="dossier-tag dim">SYNC {{ profileSyncedAt }}</span>
          <button
            class="dossier-edit"
            :class="{ active: showProfileForm }"
            :title="showProfileForm ? '退出编辑' : '编辑档案'"
            type="button"
            @click="toggleProfileForm"
          >
            <X v-if="showProfileForm" :size="15" />
            <Edit3 v-else :size="15" />
          </button>
        </div>
      </header>

      <!-- 顶部 hero 偏差带：一眼看懂「方向对不对、哪里在漂、要不要校准」 -->
      <div class="dossier-hero" :class="hero.statusTone">
        <div class="hero-grade">{{ hero.grade }}</div>
        <div class="hero-main">
          <div class="hero-top">
            <span class="hero-status">{{ hero.statusLabel }}</span>
            <span class="hero-verdict" :class="NET_GROWTH_VERDICT_UI[hero.verdict].cls">
              {{ NET_GROWTH_VERDICT_UI[hero.verdict].label }}
            </span>
            <span v-if="obs" class="hero-period">近 {{ obs.windowDays }} 天</span>
          </div>
          <p class="hero-headline">{{ hero.headline }}</p>
          <div class="hero-factors">
            <div class="hero-factor primary">
              <span class="hf-label">净增长</span>
              <span class="hf-track"><i :style="{ width: Math.round(hero.factors.netGrowth * 100) + '%' }" /></span>
            </div>
            <div class="hero-factor">
              <span class="hf-label">自律</span>
              <span class="hf-track"><i :style="{ width: Math.round(hero.factors.discipline * 100) + '%' }" /></span>
            </div>
            <div class="hero-factor">
              <span class="hf-label">连续</span>
              <span class="hf-track"><i :style="{ width: Math.round(hero.factors.streak * 100) + '%' }" /></span>
            </div>
            <div class="hero-factor">
              <span class="hf-label">可信</span>
              <span class="hf-track"><i :style="{ width: Math.round(hero.factors.credibility * 100) + '%' }" /></span>
            </div>
          </div>
        </div>
      </div>

      <!-- 只读视图：把档案当成数据读出来，而不是藏进表单 -->
      <div v-if="!showProfileForm" class="dossier-body">
        <article class="dfield vision">
          <div class="dfield-tag"><Sun :size="13" /> 长期愿景 <em>VISION VECTOR</em></div>
          <p v-if="profileVision" class="dfield-vision-text">{{ profileVision }}</p>
          <p v-else class="dfield-empty">
            尚未锚定长期愿景。这是日终校准时净增长的标尺——今天比昨天更近，还是更远。
          </p>
        </article>

        <div class="dossier-grid">
          <article class="dfield">
            <div class="dfield-tag"><Target :size="13" /> 当前专注 <em>DIRECTIVE</em></div>
            <p v-if="profileFocus" class="dfield-text">{{ profileFocus }}</p>
            <p v-else class="dfield-empty">未设定当前专注。</p>
          </article>
          <article class="dfield">
            <div class="dfield-tag"><Dna :size="13" /> 行为画像 <em>BEHAVIOR PROFILE</em></div>
            <p v-if="profilePersona" class="dfield-text">{{ profilePersona }}</p>
            <p v-else class="dfield-empty">尚未完成性格测评。前往「性格」模块，1 分钟生成画像。</p>
          </article>
        </div>

        <article class="dfield redlines">
          <div class="dfield-tag">
            <Shield :size="13" /> 红线协议 <em>HARD CONSTRAINTS</em>
            <span class="dfield-count">{{ profileRedLines.length }}</span>
          </div>
          <ul v-if="profileRedLines.length" class="redline-list">
            <li v-for="(line, i) in profileRedLines" :key="i" class="redline-item">
              <span class="redline-idx">{{ String(i + 1).padStart(2, "0") }}</span>
              <span class="redline-text">{{ line }}</span>
            </li>
          </ul>
          <p v-else class="dfield-empty">
            尚未设定红线。红线是系统在日终校准时对照你实际行为的底线——例如「不冲动消费」「不逃避复盘」。
          </p>
        </article>
      </div>

      <!-- 编辑模式：结构沿用，绑定与保存逻辑保持不变 -->
      <form v-else class="dossier-form" @submit.prevent="saveProfile">
        <label class="dform-row">
          <span class="dform-label"><User :size="13" /> 姓名 <em>NAME · 可空</em></span>
          <input v-model="profileDraft.name" placeholder="用于更自然的人称化称呼，可留空" />
        </label>
        <label class="dform-row">
          <span class="dform-label"><Fingerprint :size="13" /> 代号 / 称呼 <em>CALL SIGN</em></span>
          <input v-model="profileDraft.codename" placeholder="例：caoqi" />
        </label>
        <div class="dform-row">
          <span class="dform-label"><Brain :size="13" /> 人格基线 <em>MBTI · 自评，可随时校准</em></span>
          <div class="mbti-axes">
            <div v-for="ax in MBTI_AXES" :key="ax.key" class="mbti-axis">
              <button
                type="button"
                :class="['mbti-pole', { active: profileDraft[ax.key] === ax.a }]"
                @click="setMbtiAxis(ax.key, ax.a)"
              >
                <b>{{ ax.a }}</b><span>{{ ax.la }}</span>
              </button>
              <button
                type="button"
                :class="['mbti-pole', { active: profileDraft[ax.key] === ax.b }]"
                @click="setMbtiAxis(ax.key, ax.b)"
              >
                <b>{{ ax.b }}</b><span>{{ ax.lb }}</span>
              </button>
            </div>
          </div>
        </div>
        <label class="dform-row">
          <span class="dform-label"><Target :size="13" /> 当前专注 <em>DIRECTIVE</em></span>
          <input v-model="profileDraft.focus" placeholder="例：完成 NEXUS-7 Phase 0，建立每日复盘习惯" />
        </label>
        <label class="dform-row">
          <span class="dform-label"><Sun :size="13" /> 长期愿景 <em>VISION VECTOR</em></span>
          <textarea v-model="profileDraft.vision" rows="2" placeholder="例：成为能够自主生活、持续进化、深度创作的个体" />
        </label>
        <label class="dform-row">
          <span class="dform-label"><Shield :size="13" /> 红线 <em>每行一条</em></span>
          <textarea v-model="profileDraft.redLines" rows="3" placeholder="例：不要把任务系统退化成机械打卡&#10;不逃避复盘" />
        </label>
        <div class="dossier-form-actions">
          <button type="button" class="ghost" @click="showProfileForm = false">取消</button>
          <button type="submit" class="primary" :disabled="store.loading"><Check :size="14" /> 保存档案</button>
        </div>
      </form>

      <!-- 观测层 · 活体画像（规划书 §6/§9：分层展示，默认折叠可展开）-->
      <div class="observed-block">
        <button class="observed-head" type="button" @click="showObserved = !showObserved">
          <Radar :size="14" />
          <span class="observed-title">NEXUS 侧写 · 活体画像</span>
          <span v-if="obs" class="observed-verdict" :class="obsVerdict.cls">{{ obsVerdict.label }}</span>
          <span v-if="obs" class="observed-window">{{ obs.windowDays }}天窗</span>
          <ChevronDown :size="16" class="observed-chevron" :class="{ open: showObserved }" />
        </button>

        <p v-if="!obs" class="observed-empty">
          暂无画像快照。日终校准会自动生成；或点「立即分析」做一次深度侧写。
          <button class="observed-scan" type="button" :disabled="store.observationLoading" @click="store.runProfileObservation()">
            <RefreshCw :size="12" /> {{ store.observationLoading ? "分析中…" : "立即分析" }}
          </button>
        </p>

        <div v-else-if="showObserved" class="observed-body">
          <div class="observed-bar">
            <span class="observed-summary">{{ obs.summary }}</span>
            <button class="observed-scan" type="button" :disabled="store.observationLoading" @click="store.runProfileObservation()">
              <RefreshCw :size="12" /> {{ store.observationLoading ? "分析中…" : "立即分析" }}
            </button>
          </div>

          <div class="observed-grid">
            <div class="radar-wrap">
              <svg class="radar" viewBox="0 0 180 180" role="img" aria-label="六维行为画像雷达">
                <polygon v-for="(ring, i) in radar.rings" :key="'ring' + i" :points="ring" class="radar-ring" />
                <line
                  v-for="ax in radar.axes"
                  :key="'axis' + ax.key"
                  :x1="RADAR_C"
                  :y1="RADAR_C"
                  :x2="ax.x"
                  :y2="ax.y"
                  class="radar-axis"
                />
                <polygon :points="radar.polygon" class="radar-shape" />
                <text
                  v-for="ax in radar.axes"
                  :key="'lbl' + ax.key"
                  :x="ax.lx"
                  :y="ax.ly"
                  class="radar-label"
                  text-anchor="middle"
                  dominant-baseline="middle"
                >
                  {{ ax.label }}
                </text>
              </svg>
            </div>

            <ul class="dim-list">
              <li v-for="d in obsDims" :key="d.key" class="dim-row">
                <span class="dim-name">{{ d.label }}</span>
                <div class="dim-track"><div class="dim-fill" :style="{ width: Math.round(d.score * 100) + '%' }" /></div>
                <span class="dim-note" :class="{ faint: d.confidence < 0.3 }">
                  {{ d.confidence < 0.3 ? "证据不足" : d.note }}
                </span>
              </li>
            </ul>
          </div>

          <div class="mbti-evidence">
            <div class="mbti-evidence-head">
              <Brain :size="12" /> MBTI 行为证据 <em>与自评并行 · 互不覆盖</em>
            </div>
            <div v-for="row in mbtiRows" :key="row.key" class="mbti-ev-row">
              <span class="mbti-ev-axis">{{ row.axisName }}</span>
              <span class="mbti-ev-pole" :class="{ active: row.lean === row.a }">{{ row.a }}</span>
              <div class="mbti-ev-track">
                <span class="mbti-ev-dot" :class="{ faint: row.confidence < 0.3 }" :style="{ left: row.pos + '%' }" />
              </div>
              <span class="mbti-ev-pole" :class="{ active: row.lean === row.b }">{{ row.b }}</span>
              <span class="mbti-ev-meta">{{ row.confidence < 0.3 ? "观察中" : Math.round(row.confidence * 100) + "%" }}</span>
            </div>
          </div>

          <div class="observed-foot">
            <div v-if="obs.redLineFit.length" class="redfit">
              <span
                v-for="rf in obs.redLineFit"
                :key="rf.line"
                class="redfit-chip"
                :class="{ breach: rf.breaches > 0 }"
              >
                <Shield :size="11" /> {{ rf.line }} · {{ rf.breaches > 0 ? rf.breaches + " 次触碰" : "契合" }}
              </span>
            </div>
            <div v-if="disciplineTrend" class="trend-spark">
              <span class="trend-label">自律趋势</span>
              <svg class="spark" viewBox="0 0 120 26"><polyline :points="disciplineTrend" /></svg>
            </div>
          </div>
        </div>
      </div>

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
            <span class="evolution-risk" :class="proposalRisk(p).cls">{{ proposalRisk(p).label }}</span>
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

      <!-- 演化时间线（规划书 §8.3：已裁决可回滚，数据主权）-->
      <div v-if="evolutionHistory.length" class="evolution-timeline">
        <div class="evolution-head">
          <History :size="14" />
          <span>演化时间线</span>
        </div>
        <article v-for="h in evolutionHistory" :key="h.id" class="timeline-row">
          <span class="timeline-status" :class="PROFILE_STATUS_UI[h.status].cls">
            {{ PROFILE_STATUS_UI[h.status].label }}
          </span>
          <span class="timeline-field">{{ proposalFieldLabel(h) }}</span>
          <span class="timeline-reason">{{ h.reason }}</span>
          <button
            v-if="h.status === 'accepted'"
            class="timeline-rollback"
            type="button"
            :disabled="store.loading"
            title="还原到提议前"
            @click="store.rollbackProfileChange(h.id)"
          >
            <RotateCcw :size="12" /> 回滚
          </button>
        </article>
      </div>
    </section>
    </template>

    <template v-else-if="mainView === 'level'">
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
    </template>

    <template v-else-if="mainView === 'insight'">
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
    </template>

    <template v-else-if="mainView === 'decision'">
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
    </template>

    <template v-else-if="mainView === 'report'">
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
    </template>

    <template v-else-if="mainView === 'sense'">
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
    </template>

    <template v-else-if="mainView === 'sim'">
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
    </template>

    <template v-else-if="mainView === 'shop'">
    <!-- ── 能量点商城（Lv.3 解锁，§6.7.6 皮肤/特效） ─────────────────── -->
    <section :class="['shop-panel', !unlocked('shop') && 'panel-locked']">
      <div class="shop-header">
        <Zap :size="16" />
        <h2>能量点商城</h2>
        <span class="attr-energy"><Sparkles :size="13" /> {{ energyNow }} EP</span>
      </div>

      <!-- 提出心愿入口：估值后直接上架商城 -->
      <div v-if="unlocked('shop')" class="market-add">
        <button class="market-add-btn" type="button" @click="showWishForm = !showWishForm; store.clearBountyResult()">
          <Plus :size="14" /> {{ showWishForm ? '收起' : '提出心愿（自定义奖励）' }}
        </button>
        <span class="market-add-hint">说出你想要的，经济官定价后直接上架商城供你兑换。</span>
      </div>

      <form v-if="showWishForm" class="wish-form" @submit.prevent="submitWish">
        <input v-model="wishTitle" class="wish-input" type="text" maxlength="60" placeholder="想要什么？例如：一部新手机 / 周末露营 / 一杯奶茶" />
        <input v-model="wishNote" class="wish-input" type="text" maxlength="120" placeholder="补充（可选）：理由 / 链接" />
        <div class="wish-form-foot">
          <input v-model="wishReference" class="wish-input wish-ref" type="number" min="0" placeholder="参考价 ¥（可选）" />
          <button class="shop-btn buy" type="submit" :disabled="store.loading || !wishTitle.trim()">交给经济官估值</button>
        </div>
      </form>

      <!-- 估值反馈：澄清 / 婉拒 -->
      <div v-if="store.lastBountyResult?.verdict === 'clarify'" class="wish-feedback clarify">
        <strong>经济官需要再确认：</strong>
        <ul><li v-for="(q, i) in store.lastBountyResult.clarifyingQuestions" :key="i">{{ q }}</li></ul>
        <span class="wish-feedback-sub">在上面补充后再提交一次。</span>
      </div>
      <div v-else-if="store.lastBountyResult?.verdict === 'reject'" class="wish-feedback reject">
        <strong>经济官婉拒了：</strong>{{ store.lastBountyResult.rejectReason || store.lastBountyResult.companionLine }}
      </div>

      <!-- ── 商城：可兑换商品，分类陈列（京东淘宝式商品网格）─────────── -->
      <div v-if="hasMarket" class="market">
        <!-- 皮肤特效（未拥有）-->
        <section v-if="purchasableSkins.length > 0" class="cat-section">
          <header class="cat-header"><span class="cat-icon"><Palette :size="14" /></span><h4>皮肤特效</h4><span class="cat-count">{{ purchasableSkins.length }}</span></header>
          <div class="product-grid">
            <article v-for="item in purchasableSkins" :key="item.id" class="product-card">
              <div class="product-thumb"><Palette :size="26" /></div>
              <div class="product-name">{{ item.name }}</div>
              <p class="product-desc">{{ item.description }}</p>
              <div class="product-foot">
                <span class="product-price"><Sparkles :size="12" /> {{ item.cost }} <span class="price-unit">EP</span></span>
                <button
                  class="shop-btn buy"
                  type="button"
                  :disabled="store.loading || (store.shop?.energyPoints ?? 0) < item.cost || (store.shop?.credibilityScore ?? 0) < item.minCredibility"
                  :title="(store.shop?.credibilityScore ?? 0) < item.minCredibility ? `需要可信度 ≥ ${item.minCredibility}` : ((store.shop?.energyPoints ?? 0) < item.cost ? '能量点不足' : '')"
                  @click="store.purchaseShopItem(item.id)"
                >兑换</button>
              </div>
            </article>
          </div>
        </section>

        <!-- 自定义奖励，按类别 -->
        <section v-for="group in marketByCategory" :key="group.category" class="cat-section">
          <header class="cat-header"><span class="cat-icon"><component :is="categoryIcon(group.category)" :size="14" /></span><h4>{{ group.label }}</h4><span class="cat-count">{{ group.items.length }}</span></header>
          <div class="product-grid">
            <article v-for="b in group.items" :key="b.id" :class="['product-card', { ready: bountyProgress(b.price) >= 1 }]">
              <button class="product-remove" type="button" title="放弃这个心愿" :disabled="store.loading" @click="store.abandonBounty(b.id)"><X :size="12" /></button>
              <div class="product-thumb"><component :is="categoryIcon(group.category)" :size="26" /></div>
              <div class="product-name">{{ b.title }}</div>
              <div v-if="recentlyRepriced(b)" :class="['reprice-badge', { down: (b.priceBreakdown.repriceFrom ?? 0) > b.price }]">
                <ArrowUpDown :size="11" /> 已按新节奏调价 {{ b.priceBreakdown.repriceFrom }}→{{ b.price }}
              </div>
              <p class="product-line">{{ b.companionLine }}</p>
              <div class="product-progress" :title="b.priceBreakdown.keyFactors.join(' · ')">
                <div class="product-progress-fill" :style="{ width: `${Math.round(bountyProgress(b.price) * 100)}%` }"></div>
              </div>
              <div class="product-need">
                <span v-if="bountyProgress(b.price) >= 1" class="need-ok">已可兑换</span>
                <span v-else>还差 {{ b.price - energyNow }} EP</span>
              </div>
              <div class="product-foot">
                <span class="product-price"><Sparkles :size="12" /> {{ b.price }} <span class="price-unit">EP</span></span>
                <button
                  class="shop-btn buy"
                  type="button"
                  :disabled="store.loading || bountyProgress(b.price) < 1"
                  :title="bountyProgress(b.price) < 1 ? `还差 ${b.price - energyNow} 能量点` : ''"
                  @click="store.redeemBounty(b.id)"
                >兑换</button>
              </div>
            </article>
          </div>
        </section>
      </div>
      <p v-else-if="unlocked('shop') && !showWishForm" class="market-empty">商城空空如也。提出一个你真正想要的奖励，让它上架。</p>

      <!-- ── 奖励库：兑换成功的商品，分类陈列 ─────────────────────────── -->
      <div v-if="hasRewards" class="vault">
        <div class="vault-title"><Gift :size="15" /><h3>奖励库 <span class="panel-sub">·已兑换到手，按类别陈列</span></h3></div>

        <!-- 皮肤特效（已拥有）-->
        <section v-if="ownedSkins.length > 0" class="cat-section">
          <header class="cat-header"><span class="cat-icon"><Palette :size="14" /></span><h4>皮肤特效</h4><span class="cat-count">{{ ownedSkins.length }}</span></header>
          <div class="product-grid">
            <article v-for="s in ownedSkins" :key="s.id" :class="['product-card', 'owned', { equipped: s.equipped }]">
              <div class="product-thumb"><Palette :size="26" /></div>
              <div class="product-name">{{ s.name }}</div>
              <div class="product-foot">
                <span class="product-tag">{{ s.kind === 'skin' ? '皮肤' : '特效' }}</span>
                <button v-if="s.equipped" class="shop-btn equipped" type="button" disabled>已装备</button>
                <button v-else class="shop-btn equip" type="button" :disabled="store.loading" @click="store.equipSkin(s.id)">装备</button>
              </div>
            </article>
          </div>
        </section>

        <!-- 已兑换的自定义奖励，按类别 -->
        <section v-for="group in vaultByCategory" :key="group.category" class="cat-section">
          <header class="cat-header"><span class="cat-icon"><component :is="categoryIcon(group.category)" :size="14" /></span><h4>{{ group.label }}</h4><span class="cat-count">{{ group.items.length }}</span></header>
          <div class="product-grid">
            <article v-for="b in group.items" :key="b.id" class="product-card owned">
              <div class="product-thumb"><component :is="categoryIcon(group.category)" :size="26" /></div>
              <div class="product-name">{{ b.title }}</div>
              <div class="product-foot">
                <span class="product-price"><Sparkles :size="12" /> {{ b.price }} <span class="price-unit">EP</span></span>
                <button
                  v-if="b.state === 'redeemed'"
                  class="shop-btn equip"
                  type="button"
                  :disabled="store.loading"
                  title="确认已在现实中拿到"
                  @click="store.fulfillBounty(b.id)"
                >已到手</button>
                <span v-else class="product-tag done">{{ BOUNTY_STATE_LABELS[b.state] }}</span>
              </div>
            </article>
          </div>
        </section>
      </div>

      <!-- 已放弃 / 被婉拒（非奖励，折叠收纳）-->
      <details v-if="dismissedBounties.length > 0" class="wish-archive">
        <summary>已放弃 / 已婉拒（{{ dismissedBounties.length }}）</summary>
        <div v-for="b in dismissedBounties" :key="b.id" class="wish-archive-row">
          <span class="wish-archive-title">{{ b.title }}</span>
          <span :class="['wish-state', b.state]">{{ BOUNTY_STATE_LABELS[b.state] }}</span>
        </div>
      </details>

      <div v-if="!unlocked('shop')" class="lock-overlay">
        <span>{{ lockMsg('shop') }}</span>
      </div>
    </section>
    </template>

    <template v-else-if="mainView === 'goals'">
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
    </template>

    <!-- ── 已完成：按日期归档 ──────────────────────────────────────── -->
    <template v-else-if="mainView === 'archive'">
    <section class="archive-panel">
      <div class="panel-heading">
        <CalendarCheck :size="18" />
        <h2>已完成 <span class="panel-sub">·按日期归档</span></h2>
      </div>
      <p v-if="archiveByDate.length === 0" class="empty">还没有已完成的任务。完成或失败的任务会按日期归档到这里。</p>
      <div v-for="g in archiveByDate" :key="g.date" class="archive-day">
        <div class="archive-day-head">
          <span class="archive-date">{{ g.date }}</span>
          <span class="archive-count">{{ g.tasks.length }} 项</span>
        </div>
        <div class="archive-list">
          <article v-for="t in g.tasks" :key="t.id" :class="['archive-card', t.status]">
            <div class="archive-card-top">
              <span class="archive-title">{{ t.title }}</span>
              <span :class="['status-badge', t.status]">{{ statusLabel[t.status] }}</span>
            </div>
            <div class="archive-meta">
              <span v-if="t.actualMinutes"><Clock :size="13" /> {{ t.actualMinutes }} 分钟</span>
              <span><Sparkles :size="13" /> +{{ t.rewardPoints }}</span>
            </div>
            <p v-if="taskNoteOf(t)" class="archive-note">{{ taskNoteOf(t) }}</p>
          </article>
        </div>
      </div>
    </section>
    </template>

    <!-- ── 性格测试（#2）：短测评 → 写入档案，影响方案与语气 ────────── -->
    <template v-else-if="mainView === 'persona'">
    <section class="persona-panel">
      <p class="persona-intro">花 1 分钟做个小测评。系统会据此调整晨间规划的节奏、粒度与小人语气——不同的人，方案不该长一个样。</p>
      <div v-for="q in personaQuestions" :key="q.key" class="persona-q">
        <h3 class="persona-q-prompt">{{ q.prompt }}</h3>
        <div class="persona-options">
          <button
            v-for="o in q.options"
            :key="o.value"
            type="button"
            :class="['persona-option', { active: personaQuiz[q.key] === o.value }]"
            @click="personaQuiz[q.key] = o.value"
          >
            {{ o.label }}
          </button>
        </div>
      </div>
      <button class="persona-submit" type="button" :disabled="!personaComplete || store.loading" @click="submitPersona">
        <Check :size="14" /> 保存画像
      </button>
      <p v-if="personaSaved" class="persona-saved"><Sparkles :size="13" /> 当前画像：{{ personaSaved }}</p>
    </section>
    </template>

    <!-- ── 数据管理（#8）：按日期查看 / 删除 ─────────────────────────── -->
    <template v-else-if="mainView === 'data'">
    <section class="data-panel">
      <div class="data-toolbar">
        <label class="data-date-label">
          <CalendarClock :size="14" />
          <input v-model="dataDate" type="date" class="data-date" />
        </label>
        <button class="steward-btn" type="button" :disabled="store.loading" @click="loadDay">
          <RefreshCw :size="13" /> 刷新
        </button>
      </div>

      <div class="data-group">
        <h3 class="data-group-title">任务 <span>{{ store.dayData?.tasks.length ?? 0 }}</span></h3>
        <p v-if="!store.dayData?.tasks.length" class="empty">这一天没有任务。</p>
        <div v-for="t in store.dayData?.tasks ?? []" :key="t.id" class="data-row">
          <div class="data-row-main">
            <span class="data-row-title">{{ t.title }}</span>
            <span class="data-row-sub">{{ statusLabel[t.status] }} · {{ t.estimatedMinutes ?? '?' }} 分钟 · {{ t.source }}</span>
          </div>
          <button class="data-del" type="button" title="删除任务" :disabled="store.loading" @click="store.removeTask(t.id)">
            <Trash2 :size="14" />
          </button>
        </div>
      </div>

      <div class="data-group">
        <h3 class="data-group-title">复盘 <span>{{ store.dayData?.reviews.length ?? 0 }}</span></h3>
        <p v-if="!store.dayData?.reviews.length" class="empty">这一天没有复盘。</p>
        <div v-for="r in store.dayData?.reviews ?? []" :key="r.id" class="data-row">
          <div class="data-row-main">
            <span class="data-row-title">{{ r.type }} 复盘</span>
            <span class="data-row-sub">{{ formatTime(r.createdAt) }}</span>
          </div>
          <button class="data-del" type="button" title="删除复盘" :disabled="store.loading" @click="store.removeReview(r.id)">
            <Trash2 :size="14" />
          </button>
        </div>
      </div>

      <div class="data-group">
        <h3 class="data-group-title">事件 <span>{{ store.dayData?.events.length ?? 0 }}</span></h3>
        <p v-if="!store.dayData?.events.length" class="empty">这一天没有事件。</p>
        <div v-for="e in store.dayData?.events ?? []" :key="e.id" class="data-row">
          <div class="data-row-main">
            <span class="data-row-title">{{ e.category ?? e.type }}</span>
            <span class="data-row-sub">{{ e.source }} · {{ formatTime(e.occurredAt) }}</span>
          </div>
          <button class="data-del" type="button" title="删除事件" :disabled="store.loading" @click="store.removeEvent(e.id)">
            <Trash2 :size="14" />
          </button>
        </div>
      </div>
    </section>
    </template>

      </div>
    </section>

    <!-- ── 主体：左侧侧边栏 + 内容区 ──────────────────────────────────── -->
    <div class="app-body">
      <nav class="module-rail">
        <div class="brand">
          <span class="brand-mark"><Bot :size="18" /></span>
          <span class="brand-name">NEXUS-7</span>
        </div>
        <div class="rail-scroll">
          <button
            v-for="v in MAIN_VIEWS"
            :key="v.key"
            type="button"
            :class="['rail-item', 'rail-view', { active: mainView === v.key }]"
            :title="v.title"
            @click="setMainView(v.key)"
          >
            <component :is="v.icon" :size="20" />
            <span>{{ v.label }}</span>
          </button>
          <div class="rail-divider"></div>
          <button
            v-for="m in MODULES"
            :key="m.key"
            type="button"
            :class="['rail-item', { active: mainView === m.key }]"
            :title="m.title"
            @click="setMainView(m.key)"
          >
            <component :is="m.icon" :size="20" />
            <span>{{ m.label }}</span>
          </button>
        </div>
        <button
          class="rail-collapse"
          type="button"
          :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
          @click="toggleSidebar"
        >
          <component :is="sidebarCollapsed ? ChevronRight : ChevronLeft" :size="18" />
          <span>收起</span>
        </button>
      </nav>

      <div class="app-main">
        <!-- ── 首页态势总览：一进来就用图表回答「我是否在前进」 ──────────── -->
        <section v-if="mainView === 'home'" class="overview">
          <!-- KPI 卡片行 -->
          <div class="ov-kpis">
            <article class="kpi-card">
              <div class="kpi-top"><span class="kpi-label">今日完成</span><span class="kpi-ico ok"><FileText :size="16" /></span></div>
              <strong class="kpi-num">{{ store.completedToday }}</strong>
              <span class="kpi-sub">待推进 {{ store.activeTasks.length }}</span>
            </article>
            <article class="kpi-card">
              <div class="kpi-top"><span class="kpi-label">净成长 · 是否在前进</span><span class="kpi-ico hi"><Scale :size="16" /></span></div>
              <strong class="kpi-num" :style="store.netGrowth ? { color: netGrowthColor } : {}">
                {{ store.netGrowth ? (store.netGrowth.netValue >= 0 ? '+' : '') + store.netGrowth.netValue : '—' }}
              </strong>
              <span class="kpi-sub" :style="store.netGrowth ? { color: netGrowthColor } : {}">
                {{ store.netGrowth ? NET_GROWTH_VERDICT_LABELS[store.netGrowth.verdict] : (unlocked('behavior_score') ? '点右下角研判' : lockMsg('behavior_score')) }}
              </span>
            </article>
            <article class="kpi-card">
              <div class="kpi-top"><span class="kpi-label">最长连续</span><span class="kpi-ico hi"><Flame :size="16" /></span></div>
              <strong class="kpi-num">{{ longestStreak }} <span class="kpi-unit">天</span></strong>
              <span class="kpi-sub">在持习惯 {{ aliveStreakCount }} 条</span>
            </article>
            <article class="kpi-card">
              <div class="kpi-top"><span class="kpi-label">觉醒等级</span><span class="kpi-ico"><Sparkles :size="16" /></span></div>
              <strong class="kpi-num">Lv.{{ levelInfo.level }}</strong>
              <div class="kpi-bar"><div class="kpi-bar-fill" :style="{ width: levelInfo.pct + '%' }" /></div>
            </article>
          </div>

          <!-- 图表行：六维雷达 + 跨周趋势 -->
          <div class="ov-charts">
            <article class="ov-card">
              <div class="ov-card-head">
                <Zap :size="15" />
                <h3>知识/能力掌握雷达 <span class="panel-sub">·六维</span></h3>
                <span class="ov-tag">全维快照</span>
              </div>
              <template v-if="unlocked('attributes') && store.user">
                <svg viewBox="0 0 184 180" class="ov-radar">
                  <polygon v-for="(r, i) in attrRadar.rings" :key="`ring-${i}`" :points="r" class="ov-radar-ring" />
                  <line
                    v-for="(a, i) in attrRadar.axisPts"
                    :key="`axis-${i}`"
                    x1="92"
                    y1="90"
                    :x2="a.x"
                    :y2="a.y"
                    class="ov-radar-axis"
                  />
                  <polygon :points="attrRadar.polygon" class="ov-radar-area" />
                  <text
                    v-for="(a, i) in attrRadar.axisPts"
                    :key="`lbl-${i}`"
                    :x="a.lx"
                    :y="a.ly"
                    text-anchor="middle"
                    class="ov-radar-label"
                  >{{ a.label }}</text>
                </svg>
              </template>
              <p v-else class="empty">{{ lockMsg('attributes') }}</p>
            </article>

            <article class="ov-card">
              <div class="ov-card-head">
                <LineChart :size="15" />
                <h3>跨周趋势 <span class="panel-sub">·近 {{ store.deepAnalysis?.weeks ?? 12 }} 周</span></h3>
                <button
                  v-if="unlocked('deep_analysis')"
                  class="ov-mini-btn"
                  type="button"
                  title="刷新趋势"
                  :disabled="store.loading"
                  @click="store.loadDeepAnalysis()"
                >
                  <RefreshCw :size="12" />
                </button>
              </div>
              <p v-if="!unlocked('deep_analysis')" class="empty">{{ lockMsg('deep_analysis') }}</p>
              <template v-else-if="store.deepAnalysis">
                <div class="ov-trend-grid">
                  <div class="ov-trend">
                    <span class="ov-trend-label">净成长</span>
                    <svg viewBox="0 0 220 30" preserveAspectRatio="none" class="ov-spark">
                      <polyline :points="sparkline(store.deepAnalysis.netGrowthTrend, 220, 30)" class="spark-line net" />
                    </svg>
                  </div>
                  <div class="ov-trend">
                    <span class="ov-trend-label">任务完成</span>
                    <svg viewBox="0 0 220 30" preserveAspectRatio="none" class="ov-spark">
                      <polyline :points="sparkline(store.deepAnalysis.taskTrend, 220, 30)" class="spark-line task" />
                    </svg>
                  </div>
                  <div v-if="store.deepAnalysis.healthTrend.length" class="ov-trend">
                    <span class="ov-trend-label">日均步数</span>
                    <svg viewBox="0 0 220 30" preserveAspectRatio="none" class="ov-spark">
                      <polyline :points="sparkline(store.deepAnalysis.healthTrend, 220, 30)" class="spark-line health" />
                    </svg>
                  </div>
                  <div v-if="store.deepAnalysis.financeTrend.length" class="ov-trend">
                    <span class="ov-trend-label">每周支出</span>
                    <svg viewBox="0 0 220 30" preserveAspectRatio="none" class="ov-spark">
                      <polyline :points="sparkline(store.deepAnalysis.financeTrend, 220, 30)" class="spark-line finance" />
                    </svg>
                  </div>
                </div>
              </template>
              <p v-else class="empty">正在计算跨周趋势…点右上角可手动刷新。</p>
            </article>
          </div>

          <!-- Agent 建议条 -->
          <article class="ov-card ov-agent">
            <div class="ov-card-head">
              <Brain :size="15" />
              <h3>学情侦探 · 进展研判</h3>
              <span class="ov-agent-tag">Insight Agent</span>
              <button
                v-if="unlocked('behavior_score')"
                class="ov-mini-btn"
                type="button"
                title="重新研判今日净成长"
                :disabled="store.loading"
                @click="store.runNetGrowth()"
              >
                <RefreshCw :size="12" />
              </button>
            </div>
            <p class="ov-agent-text">{{ overviewInsight }}</p>
            <div
              v-if="store.netGrowth && (store.netGrowth.positives.length || store.netGrowth.negatives.length)"
              class="netgrowth-factors"
            >
              <span v-for="p in store.netGrowth.positives" :key="`p-${p.label}`" class="factor pos">+{{ p.weight }} {{ p.label }}</span>
              <span v-for="n in store.netGrowth.negatives" :key="`n-${n.label}`" class="factor neg">−{{ n.weight }} {{ n.label }}</span>
            </div>
          </article>
        </section>

        <section v-if="mainView === 'workspace'" class="workspace-grid">
      <section class="panel task-panel">
        <div class="panel-heading">
          <Activity :size="18" />
          <h2>今日执行协议 <span class="panel-sub">·行动矩阵</span></h2>
        </div>
        <div class="task-list">
          <article v-for="row in activeTaskRows" :key="row.task.id" class="task-row">
            <div class="task-main">
              <!-- #12 行内编辑 -->
              <div v-if="editingTaskId === row.task.id" class="task-edit">
                <input v-model="taskEdit.title" class="task-edit-input" placeholder="任务标题" />
                <input v-model="taskEdit.estimatedMinutes" inputmode="numeric" class="task-edit-input" placeholder="预计分钟" />
                <textarea v-model="taskEdit.description" class="task-edit-area" rows="2" placeholder="描述" />
                <textarea v-model="taskEdit.acceptanceCriteria" class="task-edit-area" rows="2" placeholder="验收标准" />
                <div class="task-edit-actions">
                  <button type="button" class="task-edit-save" :disabled="store.loading" @click="saveEditTask(row.task.id)">
                    <Check :size="14" /> 保存
                  </button>
                  <button type="button" class="task-edit-cancel" @click="cancelEditTask">
                    <X :size="14" /> 取消
                  </button>
                </div>
              </div>

              <template v-else>
                <div class="task-title-row">
                  <h3>{{ row.task.title }}</h3>
                  <div class="task-title-tools">
                    <span :class="['status-badge', row.task.status]">{{ statusLabel[row.task.status] }}</span>
                    <button class="task-tool" type="button" title="编辑任务" @click="startEditTask(row.task)">
                      <Edit3 :size="14" />
                    </button>
                    <button class="task-tool danger" type="button" title="删除任务" :disabled="store.loading" @click="store.removeTask(row.task.id)">
                      <Trash2 :size="14" />
                    </button>
                  </div>
                </div>
                <p>{{ row.task.description || row.task.acceptanceCriteria }}</p>
                <div class="task-meta">
                  <span><Zap :size="14" />{{ energyLabel[row.task.energyRequired] }}</span>
                  <span><Clock :size="14" />{{ row.task.estimatedMinutes ?? "?" }} 分钟</span>
                  <span><Sparkles :size="14" />+{{ row.task.rewardPoints }}</span>
                </div>
                <!-- 进行中：实时已进行 / 剩余 -->
                <div v-if="row.task.status === 'in_progress' && row.task.startedAt" class="task-running">
                  <span class="task-running-elapsed"><Clock :size="13" /> 已进行 {{ fmtDuration(taskElapsedSec(row.task)) }}</span>
                  <template v-if="row.task.estimatedMinutes">
                    <div class="task-running-bar">
                      <div class="task-running-fill" :class="{ over: taskOvertime(row.task) }" :style="{ width: `${Math.round(taskRunProgress(row.task) * 100)}%` }"></div>
                    </div>
                    <span class="task-running-remain" :class="{ over: taskOvertime(row.task) }">{{ taskRemainLabel(row.task) }}</span>
                  </template>
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
              </template>
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
                  <input v-model="row.draft.proofLink" placeholder="证明链接 / 上传图片" />
                </label>
              </div>
              <div class="evidence-proof">
                <label class="evidence-upload" :title="proofUploading ? '上传中…' : '上传截图作为证据'">
                  <ImageIcon :size="14" />
                  <span>{{ proofUploading ? "上传中…" : "上传图片" }}</span>
                  <input type="file" accept="image/*" hidden @change="onProofFile($event, row.draft)" />
                </label>
                <a
                  v-if="row.draft.proofLink && isImageProof(row.draft.proofLink)"
                  class="evidence-thumb"
                  :href="assetUrl(row.draft.proofLink)"
                  target="_blank"
                  rel="noopener"
                  title="点击查看大图"
                >
                  <img :src="assetUrl(row.draft.proofLink)" alt="证据图片" />
                </a>
              </div>
            </div>

            <div class="task-actions">
              <button
                class="task-focus-btn"
                title="专注（深度协议 · 番茄钟）"
                type="button"
                :disabled="row.task.status === 'completed' || (focusTimer.active.value && focusTimer.taskId.value === row.task.id)"
                @click="startFocus(row.task)"
              >
                <Timer :size="16" />
              </button>
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
          <p v-if="activeTaskRows.length === 0" class="empty">
            {{ store.tasks.length === 0 ? '启动晨间仪式后，系统将生成今日执行协议。' : '没有待办任务了——已完成的在「已完成」里按日期归档。' }}
          </p>
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
        <div v-if="store.user" class="companion-level" :title="`等级 Lv.${levelInfo.level}`">
          <span class="companion-level-tag"><Zap :size="13" /> Lv.{{ levelInfo.level }}</span>
          <div class="companion-level-track"><div class="companion-level-fill" :style="{ width: levelInfo.pct + '%' }" /></div>
          <span class="companion-level-xp">{{ levelInfo.xpProgress }}/{{ levelInfo.xpNeeded - levelInfo.level * levelInfo.level * 100 }} XP</span>
        </div>
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
        </section>
      </div>
    </div>

    <!-- 桌面悬浮小人（可拖动，任务完成弹出） -->
    <FloatingCompanion />
    <FocusTimer />

    <!-- 神经链接：可拖动浮动小窗（不固定在栅格里） -->
    <ChatWindow />

    <!-- 首次启动觉醒仪式（§7.2，未 onboarded 时全屏覆盖） -->
    <Teleport to="body">
      <OnboardingRitual v-if="showOnboarding" @done="ritualDismissed = true" />
    </Teleport>

    <!-- 新手指引（觉醒之后、首次进入主界面） -->
    <Teleport to="body">
      <GuideTour v-if="showGuide" @done="guideSeen = true" />
    </Teleport>

    <!-- 全局活动反馈：顶部进度条 + 处理中提示（任何按钮触发的异步都有反馈）-->
    <Teleport to="body">
      <div v-if="isBusy" class="global-progress"><span class="global-progress-bar" /></div>
    </Teleport>
    <Teleport to="body">
      <transition name="busy-toast">
        <div v-if="isBusy" class="busy-toast"><span class="busy-dot" /> 处理中…</div>
      </transition>
    </Teleport>

    <!-- 全局错误弹窗：顶部居中浮层，可关闭，4.5s 自动消失 -->
    <Teleport to="body">
      <transition name="toast-pop">
        <div v-if="store.error" class="app-toast error" role="alert">
          <AlertTriangle :size="15" />
          <span class="app-toast-msg">{{ store.error }}</span>
          <button class="app-toast-close" type="button" title="关闭" @click="store.error = ''"><X :size="14" /></button>
        </div>
      </transition>
    </Teleport>
  </main>
</template>
