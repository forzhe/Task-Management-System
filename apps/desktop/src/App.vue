<script setup lang="ts">
import { toVisualState } from "@nexus/companion";
import type { NexusEvent, Review, Task, TaskStatus, TaskStatusUpdateEvidence } from "@nexus/shared";
import {
  Activity,
  Bot,
  Check,
  CircleDot,
  Clock,
  FileText,
  Flag,
  Link as LinkIcon,
  MessageSquare,
  Moon,
  Pause,
  Play,
  RefreshCw,
  Send,
  Sparkles,
  Sun,
  X,
  Zap,
} from "lucide-vue-next";
import { computed, onMounted, reactive, ref, watch } from "vue";
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
          {{ store.offlineLlm ? "离线模拟" : "Claude 在线" }}
        </span>
        <button class="icon-button" title="刷新" type="button" :disabled="store.loading" @click="store.refresh">
          <RefreshCw :size="18" />
        </button>
      </div>
    </header>

    <p v-if="store.error" class="error-line">{{ store.error }}</p>

    <section class="command-band">
      <button type="button" :disabled="store.loading" @click="store.morningPlan">
        <Sun :size="18" />
        晨间规划
      </button>
      <button type="button" :disabled="store.loading" @click="runDailyReview">
        <Moon :size="18" />
        日终校准
      </button>
      <label class="review-input">
        <span>校准备注</span>
        <input v-model="reviewNote" placeholder="今天真实发生了什么？" />
      </label>
    </section>

    <section class="workspace-grid">
      <section class="panel task-panel">
        <div class="panel-heading">
          <Activity :size="18" />
          <h2>今日执行协议</h2>
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
          <p v-if="store.tasks.length === 0" class="empty">运行晨间规划后生成第一条协议。</p>
        </div>
      </section>

      <section class="panel companion-panel">
        <div class="panel-heading">
          <Bot :size="18" />
          <h2>主系统小人</h2>
        </div>
        <div :class="['companion-core', visual.expression, visual.motion]">
          <div class="orbital-ring"></div>
          <div class="avatar">
            <span></span>
          </div>
        </div>
        <p class="companion-dialogue">
          {{ store.companion?.currentDialogue ?? "NEXUS-7 已待命。" }}
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
          <h2>最近日终复盘</h2>
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
        <p v-else class="empty">完成日终校准后，这里会显示结构化复盘。</p>
      </section>

      <section class="panel events-panel">
        <div class="panel-heading">
          <Flag :size="18" />
          <h2>事件流</h2>
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
          <p v-if="store.events.length === 0" class="empty">事件流尚未写入。</p>
        </div>
      </section>

      <section class="panel chat-panel">
        <div class="panel-heading">
          <MessageSquare :size="18" />
          <h2>对话流</h2>
        </div>
        <div class="chat-log">
          <p v-if="store.chat.length === 0" class="empty">协议已待命。</p>
          <article v-for="line in store.chat" :key="`${line.at}-${line.text}`" :class="['chat-line', line.role]">
            <span>{{ line.role === "host" ? "宿主" : "NEXUS" }}</span>
            <p>{{ line.text }}</p>
          </article>
        </div>
        <form class="composer" @submit.prevent="submitMessage">
          <input v-model="message" placeholder="记录一个想法、行动或偏离..." />
          <button class="icon-button primary" title="发送" type="submit" :disabled="store.loading">
            <Send :size="18" />
          </button>
        </form>
      </section>
    </section>
  </main>
</template>
