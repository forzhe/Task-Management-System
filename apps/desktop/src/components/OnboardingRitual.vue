<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useNexusStore } from "../store";

const store = useNexusStore();
const emit = defineEmits<{ done: [] }>();

// ── 状态机：§7.2 BOOT → SCAN → DECODE → DIALOGUE → ANALYSIS → PROFILE_GEN → COMPANION_BORN ──
type Phase = "entry" | "boot" | "scan" | "decode" | "dialogue" | "analysis" | "profile" | "companion";
const phase = ref<Phase>("entry");

// 解码文字
const decodeTarget = "检测到未绑定生命体";
const decodeText = ref("");
const GLYPHS = "⠁⠂⠄⡀⢀⠐⠠⠈⣿⠿⡇⢸▚▞░▒▓";

// 八题引导问卷
interface Question {
  key: string;
  prompt: string;
  type: "text" | "textarea" | "choice" | "number";
  placeholder?: string;
  choices?: Array<{ label: string; value: string }>;
  /** #4：这道题为什么问——直接显示给宿主，透明化 */
  hint?: string;
  /** #1：预设气泡胶囊，点一下即可填入，减少手写 */
  presets?: string[];
  /** #3：软上限字数，防止一大段堆砌 */
  maxLen?: number;
}
const questions: Question[] = [
  {
    key: "codename",
    prompt: "你叫什么？",
    type: "text",
    placeholder: "你的代号或称呼",
    hint: "用来称呼你；之后系统所有对话都会用它。",
    maxLen: 24,
  },
  {
    key: "primaryChange",
    prompt: "此刻，你最想改变自己的哪一件事？",
    type: "textarea",
    placeholder: "选一个，或自己写",
    hint: "这会成为晨间规划的锚点——系统每天据此判断你有没有靠近它。",
    presets: ["早睡早起、规律作息", "坚持运动、改善体力", "专注学习/备考、减少分心", "减少刷手机和拖延", "推进一个长期项目"],
    maxLen: 200,
  },
  {
    key: "idealDay",
    prompt: "你理想中的一天，是什么样的？",
    type: "textarea",
    placeholder: "选一个，或具体描述",
    hint: "净成长值与人生路线模拟都以「理想的一天」为参照系。",
    presets: ["早起 → 专注工作 → 运动 → 早睡", "学习为主、张弛有度", "创作输出 + 留白思考", "稳定节律、少而精"],
    maxLen: 200,
  },
  {
    key: "failureHistory",
    prompt: "过去你尝试改变却没坚持下来，通常卡在哪？",
    type: "textarea",
    placeholder: "选一个最像的，或补充",
    hint: "失败模式帮系统提前预判你的卡点；这是数据，不是评判。",
    presets: ["三分钟热度，撑不过一周", "计划太满，做不到就放弃", "靠意志硬扛，累了就垮", "没有反馈，看不到变化就停"],
    maxLen: 200,
  },
  {
    key: "redLine",
    prompt: "有没有一条你绝对不想触碰的红线？",
    type: "text",
    placeholder: "可留空",
    hint: "系统会在复盘/决策时对照红线提醒你；可留空。",
    presets: ["不熬夜到凌晨", "不冲动消费", "不把任务变成机械打卡", "不逃避复盘"],
    maxLen: 40,
  },
  {
    key: "personalityPreference",
    prompt: "你懈怠时，希望 NEXUS-7 怎么对你？",
    type: "choice",
    hint: "决定系统对你的语气——之后可在设置里调整。",
    choices: [
      { label: "温和陪伴", value: "gentle" },
      { label: "直接克制", value: "strict" },
    ],
  },
  {
    key: "yearGoal",
    prompt: "今年最重要的一个目标是什么？",
    type: "text",
    placeholder: "选一个，或自己写",
    hint: "会自动建成你的第一个阶段目标。",
    presets: ["考上研究生", "养成稳定运动习惯", "完成一个作品/项目", "存下一笔钱"],
    maxLen: 40,
  },
  {
    key: "dailyCommitmentMinutes",
    prompt: "你愿意每天花多少分钟和 NEXUS-7 互动？",
    type: "choice",
    hint: "用于把控每日任务量，不贪多。",
    choices: [
      { label: "10 分钟", value: "10" },
      { label: "20 分钟", value: "20" },
      { label: "30 分钟", value: "30" },
      { label: "60 分钟", value: "60" },
    ],
  },
];
const qIndex = ref(0);
const answers = ref<Record<string, string>>({});
const currentInput = ref("");
const currentQuestion = computed(() => questions[qIndex.value]);

const analysisProgress = ref(0);
const hostId = ref("");

const timers: ReturnType<typeof setTimeout>[] = [];
function later(fn: () => void, ms: number) {
  timers.push(setTimeout(fn, ms));
}

// ── 心跳音效（Web Audio，需用户手势后才能播放）──
let audioCtx: AudioContext | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
function startHeartbeat() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new Ctx();
    const beat = () => {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = 58;
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.35, audioCtx.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    };
    beat();
    heartbeatTimer = setInterval(beat, 1100);
  } catch {
    /* 音频不可用则静默 */
  }
}
function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
}

// ── 环境氛围音（Web Audio 合成的低频和声 pad，循环、可静音）#1 ──
let ambientCtx: AudioContext | null = null;
let ambientMaster: GainNode | null = null;
let ambientOscs: OscillatorNode[] = [];
const AMBIENT_VOL = 0.05;
const muted = ref(localStorage.getItem("nexus-ritual-muted") === "1");

function startAmbient() {
  if (ambientCtx) return;
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ambientCtx = new Ctx();
    ambientMaster = ambientCtx.createGain();
    ambientMaster.gain.value = muted.value ? 0 : AMBIENT_VOL;
    ambientMaster.connect(ambientCtx.destination);
    ambientOscs = [110, 165, 220].map((f, i) => {
      const osc = ambientCtx!.createOscillator();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.value = f;
      osc.detune.value = (i - 1) * 5;
      const g = ambientCtx!.createGain();
      g.gain.value = 0.4;
      osc.connect(g);
      g.connect(ambientMaster!);
      osc.start();
      return osc;
    });
  } catch {
    /* 音频不可用则静默 */
  }
}

function stopAmbient() {
  for (const o of ambientOscs) {
    try {
      o.stop();
    } catch {
      /* already stopped */
    }
  }
  ambientOscs = [];
  if (ambientCtx) {
    ambientCtx.close().catch(() => {});
    ambientCtx = null;
    ambientMaster = null;
  }
}

function toggleMute() {
  muted.value = !muted.value;
  localStorage.setItem("nexus-ritual-muted", muted.value ? "1" : "0");
  if (ambientCtx && ambientMaster) {
    ambientMaster.gain.setValueAtTime(muted.value ? 0 : AMBIENT_VOL, ambientCtx.currentTime);
  }
}

// #1：点预设胶囊直接填入答案，减少手写
function applyPreset(text: string) {
  currentInput.value = text;
}

// ── 流程驱动 ──
function begin() {
  phase.value = "boot";
  startHeartbeat();
  startAmbient();
  later(() => {
    phase.value = "scan";
    later(() => runDecode(), 2600);
  }, 2400);
}

function runDecode() {
  phase.value = "decode";
  stopHeartbeat();
  let frame = 0;
  const total = decodeTarget.length;
  const tick = () => {
    frame += 1;
    const revealed = Math.floor(frame / 3);
    let out = "";
    for (let i = 0; i < total; i += 1) {
      out += i < revealed ? decodeTarget[i] : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    }
    decodeText.value = out;
    if (revealed >= total) {
      decodeText.value = decodeTarget;
      later(() => {
        phase.value = "dialogue";
      }, 1400);
      return;
    }
    timers.push(setTimeout(tick, 70));
  };
  tick();
}

function submitAnswer() {
  const q = currentQuestion.value;
  if (!q) return;
  // #3：去首尾空白 + 折叠多余空行，避免一大段堆砌
  const val = currentInput.value.trim().replace(/\n{3,}/g, "\n\n");
  // 选择题在点击时已写入；其余必填校验从宽（红线可空）
  if (q.type !== "choice" && !val && q.key !== "redLine") return;
  if (q.type !== "choice") answers.value[q.key] = val;
  advance();
}

function chooseOption(value: string) {
  const q = currentQuestion.value;
  if (!q) return;
  answers.value[q.key] = value;
  advance();
}

function advance() {
  currentInput.value = "";
  if (qIndex.value < questions.length - 1) {
    qIndex.value += 1;
  } else {
    runAnalysis();
  }
}

function runAnalysis() {
  phase.value = "analysis";
  analysisProgress.value = 0;
  const step = () => {
    analysisProgress.value = Math.min(100, analysisProgress.value + Math.random() * 14 + 4);
    if (analysisProgress.value >= 100) {
      later(() => runProfileGen(), 600);
    } else {
      timers.push(setTimeout(step, 180));
    }
  };
  step();
}

function runProfileGen() {
  hostId.value = `NX-2026-${String(Math.floor(1000 + Math.random() * 8999))}`;
  phase.value = "profile";
  later(() => {
    phase.value = "companion";
  }, 2600);
}

const companionFirstWords = computed(() => {
  const name = answers.value.codename || "宿主";
  const change = answers.value.primaryChange || "成为更好的自己";
  return `${name}，我记下了。你说想改变的是「${change}」——从今天起，我会陪你看每一天有没有真的朝它靠近，并如实告诉你进展。`;
});

async function finish() {
  stopHeartbeat();
  await store.completeOnboarding({
    codename: answers.value.codename || "宿主",
    primaryChange: answers.value.primaryChange || "",
    idealDay: answers.value.idealDay || "",
    failureHistory: answers.value.failureHistory || "",
    redLine: answers.value.redLine || "",
    personalityPreference: (answers.value.personalityPreference as "strict" | "gentle") || "gentle",
    yearGoal: answers.value.yearGoal || "",
    dailyCommitmentMinutes: Number(answers.value.dailyCommitmentMinutes || "20"),
    hostId: hostId.value,
  });
  emit("done");
}

function skip() {
  stopHeartbeat();
  store.completeOnboarding({
    codename: store.profile?.basicInfo?.codename ? String(store.profile.basicInfo.codename) : "宿主",
    primaryChange: "",
    idealDay: "",
    failureHistory: "",
    redLine: "",
    personalityPreference: "gentle",
    yearGoal: "",
    dailyCommitmentMinutes: 20,
    hostId: `NX-2026-${String(Math.floor(1000 + Math.random() * 8999))}`,
  });
  emit("done");
}

onMounted(() => {
  // 粒子点阵
});
onBeforeUnmount(() => {
  for (const t of timers) clearTimeout(t);
  stopHeartbeat();
  stopAmbient();
});
</script>

<template>
  <div class="ritual-root" :class="phase">
    <!-- 星空银河背景（#1）-->
    <div class="ritual-starfield"></div>
    <!-- 氛围音开关（#1）-->
    <button
      v-if="phase !== 'entry'"
      class="ritual-mute"
      type="button"
      :title="muted ? '开启氛围音' : '静音'"
      @click="toggleMute"
    >
      {{ muted ? "🔇" : "🔊" }}
    </button>

    <!-- 扫描线 / 粒子背景 -->
    <div v-if="phase === 'scan' || phase === 'decode'" class="ritual-grid"></div>
    <div v-if="phase === 'scan'" class="ritual-scanline"></div>

    <!-- 入口 -->
    <div v-if="phase === 'entry'" class="ritual-center">
      <div class="ritual-pulse-orb"></div>
      <h1 class="ritual-title">NEXUS-7</h1>
      <p class="ritual-sub">一个未绑定的系统核心，正在等待宿主。</p>
      <button class="ritual-primary" type="button" @click="begin">建立神经链接</button>
      <button class="ritual-skip" type="button" @click="skip">跳过觉醒仪式</button>
    </div>

    <!-- 启动黑屏 + 心跳 -->
    <div v-else-if="phase === 'boot'" class="ritual-center">
      <div class="ritual-heart"></div>
      <p class="ritual-faint">侦测生命信号…</p>
    </div>

    <!-- 扫描 -->
    <div v-else-if="phase === 'scan'" class="ritual-center">
      <p class="ritual-faint">扫描认知层…</p>
    </div>

    <!-- 解码 -->
    <div v-else-if="phase === 'decode'" class="ritual-center">
      <p class="ritual-decode">{{ decodeText }}</p>
    </div>

    <!-- 八题问卷 -->
    <div v-else-if="phase === 'dialogue'" class="ritual-center ritual-dialogue">
      <p class="ritual-progress-text">初始化档案 {{ qIndex + 1 }} / {{ questions.length }}</p>
      <h2 class="ritual-question">{{ currentQuestion?.prompt }}</h2>
      <p v-if="currentQuestion?.hint" class="ritual-qhint">{{ currentQuestion.hint }}</p>

      <template v-if="currentQuestion?.type === 'choice'">
        <div class="ritual-choices">
          <button
            v-for="c in currentQuestion.choices"
            :key="c.value"
            type="button"
            class="ritual-choice"
            @click="chooseOption(c.value)"
          >
            {{ c.label }}
          </button>
        </div>
      </template>
      <template v-else>
        <div v-if="currentQuestion?.presets?.length" class="ritual-presets">
          <button
            v-for="p in currentQuestion.presets"
            :key="p"
            type="button"
            :class="['ritual-preset', { active: currentInput === p }]"
            @click="applyPreset(p)"
          >
            {{ p }}
          </button>
        </div>
        <textarea
          v-if="currentQuestion?.type === 'textarea'"
          v-model="currentInput"
          class="ritual-input"
          rows="3"
          :maxlength="currentQuestion?.maxLen"
          :placeholder="currentQuestion?.placeholder"
          @keydown.ctrl.enter="submitAnswer"
        />
        <input
          v-else
          v-model="currentInput"
          class="ritual-input"
          :maxlength="currentQuestion?.maxLen"
          :placeholder="currentQuestion?.placeholder"
          @keyup.enter="submitAnswer"
        />
        <div class="ritual-actions-row">
          <span v-if="currentQuestion?.maxLen" class="ritual-count">{{ currentInput.length }} / {{ currentQuestion.maxLen }}</span>
          <button class="ritual-skip-q" type="button" @click="advance">跳过这题</button>
          <button class="ritual-primary" type="button" @click="submitAnswer">
            {{ qIndex < questions.length - 1 ? "下一题" : "提交" }}
          </button>
        </div>
      </template>
    </div>

    <!-- 分析进度 -->
    <div v-else-if="phase === 'analysis'" class="ritual-center">
      <p class="ritual-faint">正在分析认知模式…</p>
      <div class="ritual-bar-wrap">
        <div class="ritual-bar" :style="{ width: analysisProgress + '%' }"></div>
      </div>
      <p class="ritual-percent">{{ Math.floor(analysisProgress) }}%</p>
    </div>

    <!-- 档案生成 -->
    <div v-else-if="phase === 'profile'" class="ritual-center">
      <p class="ritual-faint">宿主档案已生成</p>
      <p class="ritual-hostid">{{ hostId }}</p>
      <p class="ritual-faint">编号已分配 · 绑定完成</p>
    </div>

    <!-- 小人诞生 + 第一段话 -->
    <div v-else-if="phase === 'companion'" class="ritual-center">
      <div class="ritual-companion">
        <div class="ritual-orbital"></div>
        <div class="ritual-avatar"><span></span></div>
      </div>
      <p class="ritual-companion-words">{{ companionFirstWords }}</p>
      <button class="ritual-primary" type="button" :disabled="store.loading" @click="finish">
        已解锁第一层权限 · 进入系统
      </button>
    </div>
  </div>
</template>

<style scoped>
.ritual-root {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: #04060a;
  color: #eef5ff;
  display: grid;
  place-items: center;
  overflow: hidden;
  font-family: inherit;
}
.ritual-center {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
  max-width: 560px;
  padding: 24px;
  animation: ritual-fade 0.8s ease;
}
@keyframes ritual-fade {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.ritual-title {
  font-size: 40px;
  font-weight: 800;
  letter-spacing: 0.3em;
  margin: 0;
  color: #8fd8cf;
}
.ritual-sub { color: #9cb8bc; font-size: 14px; margin: 0; }

/* 星空银河背景（#1）*/
.ritual-starfield {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 38%, rgba(143, 216, 207, 0.1), transparent 45%),
    radial-gradient(circle at 82% 78%, rgba(120, 160, 255, 0.08), transparent 42%);
}
.ritual-starfield::before,
.ritual-starfield::after {
  content: "";
  position: absolute;
  inset: -50%;
  background-image:
    radial-gradient(1.5px 1.5px at 10% 20%, #ffffff, transparent),
    radial-gradient(1px 1px at 30% 70%, rgba(255, 255, 255, 0.8), transparent),
    radial-gradient(1.5px 1.5px at 60% 40%, #ffffff, transparent),
    radial-gradient(1px 1px at 80% 12%, rgba(255, 255, 255, 0.7), transparent),
    radial-gradient(1px 1px at 90% 60%, #ffffff, transparent),
    radial-gradient(1px 1px at 45% 85%, rgba(255, 255, 255, 0.7), transparent),
    radial-gradient(1.5px 1.5px at 22% 55%, #ffffff, transparent),
    radial-gradient(1px 1px at 68% 78%, rgba(255, 255, 255, 0.65), transparent);
  background-repeat: repeat;
  background-size: 320px 320px;
  animation: ritual-drift 60s linear infinite, ritual-twinkle 5s ease-in-out infinite alternate;
}
.ritual-starfield::after {
  background-size: 520px 520px;
  opacity: 0.55;
  animation-duration: 95s, 7s;
}
@keyframes ritual-drift {
  from { transform: translateY(0); }
  to { transform: translateY(-160px); }
}
@keyframes ritual-twinkle {
  from { opacity: 0.5; }
  to { opacity: 1; }
}

/* 氛围音开关 */
.ritual-mute {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 3;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid rgba(143, 216, 207, 0.3);
  background: rgba(13, 25, 30, 0.7);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.ritual-mute:hover { border-color: #8fd8cf; }

/* 题目 hint（#4）*/
.ritual-qhint {
  font-size: 12px;
  color: #7faaa5;
  line-height: 1.6;
  margin: -4px 0 4px;
  max-width: 460px;
}

/* 预设气泡胶囊（#1）*/
.ritual-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  max-width: 520px;
}
.ritual-preset {
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid rgba(143, 216, 207, 0.28);
  background: rgba(13, 25, 30, 0.7);
  color: #c6d4d8;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.18s;
}
.ritual-preset:hover { border-color: #8fd8cf; color: #eef5ff; }
.ritual-preset.active {
  border-color: #ffcf75;
  color: #ffcf75;
  background: rgba(255, 207, 117, 0.12);
}

/* 提交行：字数 + 跳过 + 主按钮 */
.ritual-actions-row {
  display: flex;
  align-items: center;
  gap: 14px;
}
.ritual-count {
  font-size: 11px;
  color: #4f6468;
  font-variant-numeric: tabular-nums;
}
.ritual-skip-q {
  background: none;
  border: none;
  color: #4f6468;
  font-size: 12px;
  cursor: pointer;
}
.ritual-skip-q:hover { color: #9cb8bc; }
.ritual-faint { color: #6f8a8e; font-size: 14px; letter-spacing: 0.1em; margin: 0; }

.ritual-pulse-orb,
.ritual-heart {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 40%, rgba(255, 207, 117, 0.9), transparent 18px),
    radial-gradient(circle, rgba(23, 72, 72, 0.9), rgba(12, 18, 27, 0.95));
  border: 1px solid rgba(143, 216, 207, 0.4);
}
.ritual-pulse-orb { animation: ritual-pulse 2s ease-in-out infinite; }
.ritual-heart { animation: ritual-beat 1.1s ease-in-out infinite; }
@keyframes ritual-pulse {
  50% { transform: scale(1.08); box-shadow: 0 0 50px rgba(143, 216, 207, 0.35); }
}
@keyframes ritual-beat {
  0%, 100% { transform: scale(1); }
  15% { transform: scale(1.16); }
  30% { transform: scale(1); }
  45% { transform: scale(1.1); }
}

.ritual-grid {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(143, 216, 207, 0.25) 1px, transparent 1px);
  background-size: 22px 22px;
  opacity: 0.5;
  animation: ritual-grid-fade 3s ease;
}
@keyframes ritual-grid-fade { from { opacity: 0; } to { opacity: 0.5; } }
.ritual-scanline {
  position: absolute;
  left: 0;
  right: 0;
  height: 120px;
  background: linear-gradient(to bottom, transparent, rgba(143, 216, 207, 0.18), transparent);
  animation: ritual-scan 2.6s linear;
}
@keyframes ritual-scan {
  from { top: 100%; }
  to { top: -120px; }
}

.ritual-decode {
  font-size: 30px;
  letter-spacing: 0.18em;
  font-weight: 700;
  color: #ffcf75;
  font-family: "Cascadia Code", "Consolas", monospace;
}

.ritual-dialogue { width: 100%; }
.ritual-progress-text { font-size: 12px; color: #6f8a8e; letter-spacing: 0.14em; margin: 0; }
.ritual-question { font-size: 22px; font-weight: 600; margin: 0 0 6px; line-height: 1.5; }
.ritual-input {
  width: 100%;
  background: rgba(6, 13, 17, 0.85);
  border: 1px solid rgba(143, 216, 207, 0.28);
  border-radius: 10px;
  color: #eef5ff;
  font-size: 15px;
  padding: 12px 14px;
  font-family: inherit;
  line-height: 1.5;
  resize: vertical;
}
.ritual-input:focus { outline: none; border-color: #8fd8cf; }
.ritual-choices { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
.ritual-choice {
  padding: 12px 24px;
  border-radius: 10px;
  border: 1px solid rgba(143, 216, 207, 0.3);
  background: rgba(13, 25, 30, 0.8);
  color: #eef5ff;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s;
}
.ritual-choice:hover { background: rgba(25, 53, 58, 0.95); border-color: #8fd8cf; transform: translateY(-2px); }

.ritual-primary {
  padding: 12px 32px;
  border-radius: 10px;
  border: 1px solid rgba(143, 216, 207, 0.45);
  background: rgba(143, 216, 207, 0.12);
  color: #8fd8cf;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.ritual-primary:hover:not(:disabled) { background: rgba(143, 216, 207, 0.2); }
.ritual-skip {
  background: none;
  border: none;
  color: #4f6468;
  font-size: 12px;
  cursor: pointer;
  margin-top: 4px;
}
.ritual-skip:hover { color: #9cb8bc; }

.ritual-bar-wrap {
  width: 320px;
  height: 6px;
  background: rgba(143, 216, 207, 0.12);
  border-radius: 999px;
  overflow: hidden;
}
.ritual-bar {
  height: 100%;
  background: linear-gradient(90deg, #8fd8cf, #ffcf75);
  border-radius: 999px;
  transition: width 0.18s ease;
}
.ritual-percent { font-family: monospace; color: #8fd8cf; font-size: 13px; margin: 0; }

.ritual-hostid {
  font-family: monospace;
  font-size: 30px;
  letter-spacing: 0.12em;
  color: #ffcf75;
  font-weight: 700;
  margin: 0;
  animation: ritual-pulse 2s ease-in-out infinite;
}

.ritual-companion {
  position: relative;
  display: grid;
  place-items: center;
  height: 140px;
  width: 140px;
}
.ritual-orbital {
  position: absolute;
  width: 130px;
  height: 130px;
  border: 1px solid rgba(143, 216, 207, 0.5);
  border-radius: 50%;
  animation: ritual-spin 8s linear infinite;
}
@keyframes ritual-spin { to { transform: rotate(360deg); } }
.ritual-avatar {
  display: grid;
  place-items: center;
  width: 84px;
  height: 84px;
  border: 1px solid rgba(143, 216, 207, 0.4);
  border-radius: 50%;
  background: radial-gradient(circle at 50% 38%, rgba(255, 207, 117, 0.85), transparent 7px),
    radial-gradient(circle, rgba(23, 72, 72, 0.9), rgba(12, 18, 27, 0.95));
  animation: ritual-avatar-born 1s ease;
}
@keyframes ritual-avatar-born {
  from { transform: scale(0.2); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.ritual-avatar span {
  width: 32px;
  height: 12px;
  border-bottom: 2px solid #d8fffa;
  border-radius: 50%;
}
.ritual-companion-words {
  font-size: 15px;
  line-height: 1.7;
  color: #c6d4d8;
  max-width: 460px;
}
</style>
