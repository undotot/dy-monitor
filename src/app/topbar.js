import { clamp01 } from "../core/settings.js";

// 顶部栏：声音模式 / 主增益 / 布局预设 / 全部播放停止 / 退出 / 帮助。
export function initTopbar(ctx) {
  const els = ctx.els;
  const query = (selector) => ctx.wrapper.querySelector(selector);

  const topbar = query("[data-topbar]");
  const collapseButton = query("[data-topbar-collapse]");
  const expandButton = query("[data-topbar-expand]");
  ctx.syncTopbar = () => {
    const collapsed = ctx.topbarCollapsed;
    ctx.appShell.classList.toggle("is-topbar-collapsed", collapsed);
    topbar.inert = collapsed;
    topbar.setAttribute("aria-hidden", String(collapsed));
    collapseButton.hidden = collapsed;
    expandButton.hidden = !collapsed;
    collapseButton.setAttribute("aria-expanded", String(!collapsed));
    collapseButton.setAttribute("aria-controls", topbar.id);
    ctx.scheduleLayout();
  };
  const handleTopbar = (collapsed) => {
    ctx.topbarCollapsed = collapsed;
    ctx.syncTopbar();
    (collapsed ? expandButton : collapseButton).focus();
    ctx.save();
  };
  collapseButton.addEventListener("click", () => handleTopbar(true));
  expandButton.addEventListener("click", () => handleTopbar(false));
  // 与右侧设置把手一致：边缘区域唤起，鼠标离开隐藏；键盘和触屏由样式兜底。
  ctx.appShell.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || !ctx.opened) return;
    const rect = ctx.appShell.getBoundingClientRect();
    const distance = event.clientY - rect.top;
    const nearCenter = Math.abs(event.clientX - (rect.left + rect.width / 2)) <= 88;
    ctx.appShell.classList.toggle("topbar-near", nearCenter && distance >= 0 && distance <= 56);
  }, { passive: true });
  ctx.appShell.addEventListener("pointerleave", () => ctx.appShell.classList.remove("topbar-near"));
  query("[data-topbar-slot]").addEventListener("transitionend", () => ctx.scheduleLayout());
  ctx.syncTopbar();

  els.audioMode.addEventListener("change", () => ctx.setAudioMode(els.audioMode.value));
  els.masterGain.addEventListener("input", (event) => {
    ctx.audio.master = clamp01(event.target.value, ctx.audio.master);
    ctx.paintSlider(event.target);
    els.masterPct.textContent = `${Math.round(ctx.audio.master * 100)}%`;
    ctx.applyAudioAll();
  });
  els.masterGain.addEventListener("change", () => ctx.save());
  for (const input of ctx.wrapper.querySelectorAll("[name=layout-preset]")) input.addEventListener("change", () => {
    ctx.layoutMode = input.value === "auto" ? "auto" : Number(input.value);
    ctx.handleLayout();
    ctx.save();
  });
  query("[data-start-all]").addEventListener("click", () => {
    for (const tile of ctx.tiles.values()) if (!["playing", "connecting", "signing", "queued", "probing", "reconnecting"].includes(tile.state)) void ctx.handleStart(tile);
  });
  query("[data-stop-all]").addEventListener("click", () => {
    for (const tile of ctx.tiles.values()) ctx.stop(tile);
  });
  query("[data-exit]").addEventListener("click", ctx.showExitConfirm);
}
