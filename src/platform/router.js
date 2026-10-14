// 跨平台路由与页面切换感知：兼容 Tampermonkey (urlchange) 与 Safari / Stay (history hook + popstate)
const getTargetWindow = () => (typeof unsafeWindow !== "undefined" && unsafeWindow) ? unsafeWindow : window;

export const isFollowPage = () => location.pathname.replace(/\/+$/, "") === "/directory/myFollow";

let installed = false;
const listeners = new Set();

const notify = () => {
  for (const listener of listeners) {
    try {
      listener(location.href);
    } catch {
      // 容灾：单个监听异常不阻断其他生命周期
    }
  }
};

export const onUrlChange = (callback) => {
  listeners.add(callback);
  if (!installed) {
    installed = true;
    const targetWin = getTargetWindow();

    // 1. 原生 popstate 监听（前进 / 后退）
    window.addEventListener("popstate", notify, { passive: true });

    // 2. 针对 SPA 的 history.pushState / history.replaceState Hook
    const wrapHistoryMethod = (method) => {
      try {
        const original = targetWin.history?.[method];
        if (typeof original === "function") {
          targetWin.history[method] = function (...args) {
            const result = original.apply(this, args);
            notify();
            return result;
          };
        }
      } catch {
        // 部分极端沙箱禁止修改 history，静默降级
      }
    };
    wrapHistoryMethod("pushState");
    wrapHistoryMethod("replaceState");

    // 3. 兼容 Tampermonkey 的原生 urlchange 事件
    window.addEventListener("urlchange", notify, { passive: true });
  }

  return () => listeners.delete(callback);
};
