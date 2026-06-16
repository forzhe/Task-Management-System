<script setup lang="ts">
import { toVisualState } from "@nexus/companion";
import type { CompanionState } from "@nexus/shared";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { LIVE2D_MODEL_URL, ensureLive2DRuntime, stateToMotion } from "../live2d-loader";

const props = withDefaults(
  defineProps<{ state?: CompanionState; size?: number }>(),
  { state: "idle", size: 168 },
);

const visual = computed(() => toVisualState(props.state));
const canvasEl = ref<HTMLCanvasElement | null>(null);
const live2dActive = ref(false);

// PIXI/Live2D 实例（运行时类型，避免引入闭源类型依赖）
let app: { destroy: (a?: boolean, b?: boolean) => void } | null = null;
// biome-ignore lint/suspicious/noExplicitAny: Live2D 运行时为 CDN 动态加载，无类型
let model: any = null;

async function tryInitLive2D() {
  if (!LIVE2D_MODEL_URL) return;
  const ready = await ensureLive2DRuntime();
  if (!ready || !canvasEl.value) return;
  try {
    // biome-ignore lint/suspicious/noExplicitAny: 运行时全局
    const PIXI = (window as any).PIXI;
    app = new PIXI.Application({
      view: canvasEl.value,
      width: props.size,
      height: props.size,
      backgroundAlpha: 0,
      antialias: true,
    });
    model = await PIXI.live2d.Live2DModel.from(LIVE2D_MODEL_URL);
    const scale = (props.size / model.height) * 0.9;
    model.scale.set(scale);
    model.anchor.set(0.5, 0.5);
    model.position.set(props.size / 2, props.size / 2);
    // biome-ignore lint/suspicious/noExplicitAny: PIXI stage
    (app as any).stage.addChild(model);
    live2dActive.value = true;
    applyMotion(props.state);
  } catch {
    // 模型加载失败 → 保持 CSS 回退
    live2dActive.value = false;
  }
}

function applyMotion(state: CompanionState) {
  if (!model) return;
  try {
    model.motion(stateToMotion(state));
  } catch {
    // 模型未提供该动作组，忽略
  }
}

watch(
  () => props.state,
  (s) => {
    if (live2dActive.value) applyMotion(s);
  },
);

onMounted(() => {
  void tryInitLive2D();
});

onBeforeUnmount(() => {
  if (model) {
    try {
      model.destroy();
    } catch {
      /* noop */
    }
    model = null;
  }
  if (app) {
    try {
      app.destroy(false, true);
    } catch {
      /* noop */
    }
    app = null;
  }
});
</script>

<template>
  <div class="live2d-stage" :style="{ height: `${size}px` }">
    <!-- Live2D 画布（仅在配置并加载成功后显示）-->
    <canvas v-show="live2dActive" ref="canvasEl" class="live2d-canvas" :width="size" :height="size" />
    <!-- CSS 小人回退（未配置模型或加载失败时显示）-->
    <div v-if="!live2dActive" :class="['companion-core', visual.expression, visual.motion]">
      <div class="orbital-ring"></div>
      <div class="avatar"><span></span></div>
    </div>
  </div>
</template>

<style scoped>
.live2d-stage {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
}
.live2d-canvas {
  display: block;
}
.live2d-stage .companion-core {
  margin: 0;
}
</style>
