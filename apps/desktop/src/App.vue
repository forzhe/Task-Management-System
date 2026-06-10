<script setup lang="ts">
import { toVisualState } from "@nexus/companion";
import type { AttributeKey, FeatureKey, GoalLevel, NexusEvent, Review, Task, TaskStatus, TaskStatusUpdateEvidence } from "@nexus/shared";
import { ATTRIBUTE_LABELS, UNLOCK_LABELS, UNLOCK_LEVELS, isFeatureUnlocked, xpToNextLevel } from "@nexus/shared";
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
  Link as LinkIcon,
  MessageSquare,
  Moon,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  User,
  X,
  Zap,
} from "lucide-vue-next";
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";

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

const visual = computed(() => toVisualState(store.companion?.currentState ?? "idle"));
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

    <!-- ── 商城占位（Lv.3 解锁） ─────────────────────────────────────── -->
    <section :class="['shop-panel', !unlocked('shop') && 'panel-locked']">
      <div class="shop-header">
        <Zap :size="16" />
        <h2>能量点商城</h2>
        <span class="attr-energy"><Sparkles :size="13" /> {{ store.user?.energyPoints ?? 0 }} EP</span>
      </div>
      <div v-if="!unlocked('shop')" class="lock-overlay">
        <span>{{ lockMsg('shop') }}</span>
      </div>
      <p v-else class="shop-hint">商城兑换功能将在后续版本开放。当前能量点正在积累中。</p>
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

      <section class="panel companion-panel">
        <div class="panel-heading">
          <Bot :size="18" />
          <h2>系统核心 <span class="panel-sub">·意识接口</span></h2>
        </div>
        <div :class="['companion-core', visual.expression, visual.motion]">
          <div class="orbital-ring"></div>
          <div class="avatar">
            <span></span>
          </div>
        </div>
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
  </main>
</template>
