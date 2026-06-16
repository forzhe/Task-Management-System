// 运行环境检测：区分浏览器（Vite 开发壳）与 Tauri 原生窗口。
// Tauri 2 会在 window 上注入 __TAURI_INTERNALS__；浏览器中不存在。

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
