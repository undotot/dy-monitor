import { clamp01 } from "../core/settings.js";

// 顶部栏：声音模式 / 主增益 / 布局预设 / 全部播放停止 / 退出 / 帮助。
export function initTopbar(ctx) {
  const els = ctx.els;
  const query = (selector) => ctx.wrapper.querySelector(selector);

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
