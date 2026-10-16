import { setIconButton } from "../ui/icons.js";
import { safeMessage } from "../core/settings.js";

// Document 返回 Shadow DOM 宿主，必须优先读取画格所在树里的真实全屏元素。
export const isTileFullscreen = (root) => {
  const scope = root.getRootNode();
  const doc = root.ownerDocument;
  let element = scope.fullscreenElement || scope.webkitFullscreenElement
    || doc.fullscreenElement || doc.webkitFullscreenElement || doc.webkitCurrentFullScreenElement;
  while (element?.shadowRoot) {
    const inner = element.shadowRoot.fullscreenElement || element.shadowRoot.webkitFullscreenElement;
    if (!inner || inner === element) break;
    element = inner;
  }
  if (!element) return false;
  if (element === root || root.contains(element)) return true;
  // 旧版 WebKit 未暴露 ShadowRoot 全屏 getter 时，以原生伪类识别真实画格。
  for (const selector of [":fullscreen", ":-webkit-full-screen"]) {
    try { if (root.matches(selector)) return true; } catch { /* 当前浏览器不支持此伪类，继续检查另一接口。 */ }
  }
  return false;
};

// 迁入/迁出画中画后重新绑定 ownerDocument；按钮、更多代理与浏览器退出共用一份状态。
export const bindTileFullscreen = (ctx, tile) => {
  tile.disconnectFullscreen?.();
  const { root } = tile;
  const doc = root.ownerDocument;
  const button = root.querySelector("[data-t-full]");
  if (!button) return;
  let pending = false;
  let disposed = false;
  let active = false;
  let failureNotified = false;
  const controls = () => [...root.querySelectorAll("[data-t-full], [data-tool-action=full]")];
  const handleSync = () => {
    if (disposed) return;
    const next = isTileFullscreen(root);
    const label = next ? "退出全屏" : "全屏";
    root.classList.toggle("is-room-fullscreen", next);
    setIconButton(button, next ? "fullExit" : "full", label);
    button.setAttribute("aria-pressed", String(next));
    for (const proxy of root.querySelectorAll("[data-tool-action=full]")) {
      proxy.dataset.toolLabel = label;
      proxy.setAttribute("aria-label", label);
    }
    if (next === active) return;
    active = next;
    ctx.closeContextMenu?.();
    ctx.scheduleLayout?.();
    if (!next && root.isConnected) button.focus({ preventScroll: true });
  };
  const handleFailure = (error) => {
    if (disposed || failureNotified) return;
    failureNotified = true;
    ctx.showToast?.(`全屏操作失败：${safeMessage(error)}`, [], 5000);
    handleSync();
  };
  const handleExit = async () => {
    if (!isTileFullscreen(root)) return;
    const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.webkitCancelFullScreen;
    if (!exit) throw new Error("当前浏览器无法退出全屏，请使用浏览器的退出全屏入口");
    await exit.call(doc);
  };
  const handleToggle = async () => {
    if (pending || disposed) return;
    pending = true;
    failureNotified = false;
    for (const control of controls()) { control.disabled = true; control.setAttribute("aria-busy", "true"); }
    try {
      if (isTileFullscreen(root)) await handleExit();
      else {
        const request = root.requestFullscreen || root.webkitRequestFullscreen || root.webkitRequestFullScreen;
        if (!request) throw new Error("当前浏览器不支持画格全屏，可使用放大模式观看");
        // 在原始点击链中立即调用，保留浏览器要求的用户激活。
        await request.call(root);
      }
      handleSync();
    } catch (error) { handleFailure(error); }
    finally {
      pending = false;
      if (!disposed) for (const control of controls()) { control.disabled = false; control.removeAttribute("aria-busy"); }
    }
  };
  const handleFullscreenError = () => handleFailure(new Error("浏览器拒绝了全屏请求，请重试"));
  button.addEventListener("click", handleToggle);
  for (const type of ["fullscreenchange", "webkitfullscreenchange"]) doc.addEventListener(type, handleSync);
  for (const type of ["fullscreenerror", "webkitfullscreenerror"]) root.addEventListener(type, handleFullscreenError);
  tile.exitFullscreen = async () => {
    failureNotified = false;
    try { await handleExit(); } catch (error) { handleFailure(error); }
  };
  tile.disconnectFullscreen = () => {
    disposed = true;
    button.removeEventListener("click", handleToggle);
    for (const type of ["fullscreenchange", "webkitfullscreenchange"]) doc.removeEventListener(type, handleSync);
    for (const type of ["fullscreenerror", "webkitfullscreenerror"]) root.removeEventListener(type, handleFullscreenError);
    root.classList.remove("is-room-fullscreen");
    for (const control of controls()) { control.disabled = false; control.removeAttribute("aria-busy"); }
  };
  handleSync();
};
