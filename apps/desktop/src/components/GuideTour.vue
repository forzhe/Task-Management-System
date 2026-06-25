<script setup lang="ts">
import { computed, ref } from "vue";

const emit = defineEmits<{ done: [] }>();

interface Step {
  icon: string;
  title: string;
  desc: string;
}

const steps: Step[] = [
  {
    icon: "☀️",
    title: "每天先做晨间规划",
    desc: "点顶部「启动晨间仪式」，系统会按你的目标生成今天 1–3 个可验证的小任务。一天一次，不贪多。",
  },
  {
    icon: "✅",
    title: "完成任务要留证据",
    desc: "任务做完后，在证据框写一句话、贴链接或填实际用时。系统靠客观证据校准，而不只看你说「做完了」。",
  },
  {
    icon: "▦",
    title: "左栏是各功能模块",
    desc: "左侧竖栏点开 档案 / 等级 / 洞察 / 决策 / 感知 / 推演 / 商城 / 目标——从右侧滑出抽屉，一次只开一个。",
  },
  {
    icon: "🌙",
    title: "晚上做日终校准",
    desc: "点「日终校准协议」，如实说说今天发生了什么。系统会对照客观数据，给你具体而不冷硬的复盘。",
  },
];

const index = ref(0);
const current = computed(() => steps[index.value] ?? steps[0]!);
const isLast = () => index.value === steps.length - 1;

function next() {
  if (isLast()) finish();
  else index.value += 1;
}
function prev() {
  if (index.value > 0) index.value -= 1;
}
function finish() {
  localStorage.setItem("nexus-guide-seen", "1");
  emit("done");
}
</script>

<template>
  <div class="guide-backdrop" @click.self="finish">
    <div class="guide-card">
      <button class="guide-skip" type="button" @click="finish">跳过</button>
      <div class="guide-icon">{{ current.icon }}</div>
      <p class="guide-eyebrow">新手指引 · {{ index + 1 }} / {{ steps.length }}</p>
      <h2 class="guide-title">{{ current.title }}</h2>
      <p class="guide-desc">{{ current.desc }}</p>

      <div class="guide-dots">
        <span v-for="(s, i) in steps" :key="i" :class="['guide-dot', { active: i === index }]" />
      </div>

      <div class="guide-actions">
        <button v-if="index > 0" class="guide-btn ghost" type="button" @click="prev">上一步</button>
        <button class="guide-btn primary" type="button" @click="next">
          {{ isLast() ? "开始使用" : "下一步" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.guide-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(7, 9, 13, 0.82);
  backdrop-filter: blur(6px);
}

.guide-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 90vw;
  max-width: 440px;
  padding: 36px 34px 28px;
  text-align: center;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--bg-panel);
  box-shadow: var(--panel-shadow);
}

.guide-skip {
  position: absolute;
  top: 14px;
  right: 16px;
  min-height: auto;
  padding: 2px 6px;
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
}
.guide-skip:hover {
  color: var(--text-base);
  background: none;
}

.guide-icon {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 30px;
  background: var(--bg-goal-level);
  border: 1px solid var(--border-tag);
}

.guide-eyebrow {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.1em;
  color: var(--text-accent);
}

.guide-title {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  color: var(--text-base);
}

.guide-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-sub);
}

.guide-dots {
  display: flex;
  gap: 6px;
  margin: 4px 0;
}
.guide-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--border);
}
.guide-dot.active {
  background: var(--text-hi);
}

.guide-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}

.guide-btn {
  min-height: 40px;
  padding: 0 22px;
  border-radius: 8px;
  border: 1px solid var(--border-btn);
  background: var(--bg-btn);
  color: var(--text-base);
  font-size: 14px;
  cursor: pointer;
}
.guide-btn.primary {
  border-color: var(--btn-primary-border);
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
}
.guide-btn.ghost {
  background: transparent;
  color: var(--text-muted);
}
.guide-btn:hover {
  border-color: var(--border-btn-hover);
}
</style>
