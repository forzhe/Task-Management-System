<script setup lang="ts">
import { Maximize2, Minimize2, Pause, Play, RotateCcw, Settings2, X } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { useFocusTimer } from "../focus-timer";

const {
  phase,
  taskTitle,
  running,
  focusLen,
  breakLen,
  active,
  progress,
  mmss,
  pause,
  resume,
  stop,
  again,
  setDurations,
} = useFocusTimer();

// 展开（沉浸界面）/ 最小化（底部胶囊）。每次新会话开始默认展开。
const minimized = ref(false);
watch(active, (a) => {
  if (a) minimized.value = false;
});

const showSettings = ref(false);
const focusDraft = ref(focusLen.value);
const breakDraft = ref(breakLen.value);
function toggleSettings() {
  focusDraft.value = focusLen.value;
  breakDraft.value = breakLen.value;
  showSettings.value = !showSettings.value;
}
function applySettings() {
  setDurations(Number(focusDraft.value), Number(breakDraft.value));
  showSettings.value = false;
}

const DIAL_R = 96;
const DIAL_C = 2 * Math.PI * DIAL_R;
const dialOffset = computed(() => DIAL_C * (1 - progress.value));
</script>

<template>
  <!-- 展开：沉浸式专注界面 -->
  <Teleport to="body">
    <transition name="focus-fade">
      <div v-if="active && !minimized" :class="['focus-overlay', phase]">
        <div class="focus-overlay-tools">
          <button class="fo-tool" type="button" title="时长设置" @click="toggleSettings"><Settings2 :size="18" /></button>
          <button class="fo-tool" type="button" title="最小化" @click="minimized = true"><Minimize2 :size="18" /></button>
          <button class="fo-tool danger" type="button" title="结束" @click="stop()"><X :size="18" /></button>
        </div>

        <div class="focus-overlay-body">
          <div class="fo-phase">{{ phase === 'break' ? '缓冲 · 休息一下' : '深度协议 · 专注中' }}</div>
          <div class="fo-task" :title="taskTitle">{{ taskTitle }}</div>

          <div class="fo-dial-wrap">
            <svg class="fo-dial" viewBox="0 0 220 220" aria-hidden="true">
              <circle class="fo-dial-track" cx="110" cy="110" :r="DIAL_R" />
              <circle class="fo-dial-arc" cx="110" cy="110" :r="DIAL_R" :stroke-dasharray="DIAL_C" :stroke-dashoffset="dialOffset" />
            </svg>
            <div class="fo-dial-center">
              <span class="fo-time">{{ mmss }}</span>
              <span class="fo-unit">{{ phase === 'break' ? '缓冲' : '专注' }}</span>
            </div>
          </div>

          <div class="fo-controls">
            <button v-if="phase === 'focus' && running" class="fo-primary" type="button" @click="pause()"><Pause :size="19" /> 暂停</button>
            <button v-else-if="phase === 'focus'" class="fo-primary" type="button" @click="resume()"><Play :size="19" /> 继续</button>
            <button v-if="phase === 'break'" class="fo-primary" type="button" @click="again()"><RotateCcw :size="19" /> 再来一个</button>
          </div>

          <div v-if="showSettings" class="fo-settings">
            <label>专注 <input v-model="focusDraft" type="number" min="1" max="120" /> 分</label>
            <label>缓冲 <input v-model="breakDraft" type="number" min="1" max="60" /> 分</label>
            <button class="fo-apply" type="button" @click="applySettings">保存</button>
            <span class="fo-settings-hint">下个番茄钟生效</span>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>

  <!-- 最小化：底部小胶囊 -->
  <Teleport to="body">
    <transition name="focus-pop">
      <div v-if="active && minimized" :class="['focus-widget', phase]">
        <div class="focus-row">
          <div class="focus-ring" :style="{ '--p': progress }">
            <span class="focus-time">{{ mmss }}</span>
          </div>
          <div class="focus-body">
            <div class="focus-phase">{{ phase === 'break' ? '缓冲中' : '专注中' }}</div>
            <div class="focus-task" :title="taskTitle">{{ taskTitle }}</div>
          </div>
          <div class="focus-controls">
            <button v-if="phase === 'focus' && running" class="focus-btn" type="button" title="暂停" @click="pause()"><Pause :size="16" /></button>
            <button v-else-if="phase === 'focus'" class="focus-btn" type="button" title="继续" @click="resume()"><Play :size="16" /></button>
            <button v-if="phase === 'break'" class="focus-btn" type="button" title="再来一个" @click="again()"><RotateCcw :size="16" /></button>
            <button class="focus-btn" type="button" title="展开" @click="minimized = false"><Maximize2 :size="16" /></button>
            <button class="focus-btn danger" type="button" title="结束" @click="stop()"><X :size="16" /></button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>
