// 动态可选加载 Live2D 运行时（§10）。
// 设计：Cubism Core 与模型资源是闭源/有版权的，不打进仓库也不强制依赖。
// 只有当 VITE_LIVE2D_MODEL 配置了模型地址时，才从 CDN 动态拉取 PIXI + Cubism Core
// + pixi-live2d-display 三件套并渲染真模型；否则前端回退到 CSS 小人。

const PIXI_SRC = "https://cdn.jsdelivr.net/npm/pixi.js@6.5.10/dist/browser/pixi.min.js";
const CUBISM_CORE_SRC = "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js";
const LIVE2D_DISPLAY_SRC = "https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/cubism4.min.js";

/** 模型地址（.model3.json）。空字符串表示未配置 → 走 CSS 回退 */
export const LIVE2D_MODEL_URL: string = import.meta.env.VITE_LIVE2D_MODEL ?? "";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`无法加载脚本：${src}`));
    document.head.appendChild(script);
  });
}

let runtimePromise: Promise<boolean> | null = null;

/** 确保 Live2D 运行时就绪。失败（离线/CDN 不可达）时返回 false，调用方应回退。 */
export function ensureLive2DRuntime(): Promise<boolean> {
  if (!LIVE2D_MODEL_URL) return Promise.resolve(false);
  if (runtimePromise) return runtimePromise;
  runtimePromise = (async () => {
    try {
      // 顺序加载：PIXI → Cubism Core → pixi-live2d-display（后者依赖前两者全局变量）
      await loadScript(PIXI_SRC);
      await loadScript(CUBISM_CORE_SRC);
      await loadScript(LIVE2D_DISPLAY_SRC);
      const w = window as unknown as { PIXI?: { live2d?: unknown }; Live2DCubismCore?: unknown };
      return Boolean(w.PIXI?.live2d && w.Live2DCubismCore);
    } catch {
      return false;
    }
  })();
  return runtimePromise;
}

/** 把系统小人状态映射到 Live2D 动作组名（需模型自带对应 motion，否则忽略）*/
export function stateToMotion(state: string): string {
  switch (state) {
    case "celebrating":
      return "celebrate";
    case "focus":
      return "focus";
    case "strict":
    case "disappointed":
      return "strict";
    case "caring":
    case "reminding":
      return "care";
    default:
      return "idle";
  }
}
