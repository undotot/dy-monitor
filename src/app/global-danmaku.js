import { normalizeDanmaku } from "../core/danmaku-render.js";
import { iconMarkup } from "../ui/icons.js";
import { applyDanmakuToAll, syncDanmakuDisplay, updateTileDanmaku } from "./tile-danmaku.js";

export function bindGlobalDanmaku(ctx) {
  const section = ctx.wrapper.querySelector("[data-dm-global]");
  const query = (selector) => section.querySelector(selector);
  ctx.syncGlobalDanmakuActions = () => {
    const rooms = [...ctx.tiles.values()];
    const enabled = rooms.filter((tile) => tile.danmaku.enabled).length;
    const allEnabled = rooms.length > 0 && enabled === rooms.length;
    query("[data-dm-global-summary]").textContent = rooms.length ? `${enabled} / ${rooms.length} 个房间已开启` : "暂无房间";
    const toggle = query("[data-dm-global-toggle]");
    toggle.disabled = !rooms.length;
    toggle.setAttribute("aria-pressed", String(allEnabled));
    toggle.setAttribute("aria-label", allEnabled ? "关闭全部弹幕" : "开启全部弹幕");
    toggle.innerHTML = `${iconMarkup(allEnabled ? "chat" : "chatOff")}<span>${allEnabled ? "关闭" : "开启"}</span>`;
    syncDanmakuDisplay(section, ctx.danmakuDefaults, true);
    if (!rooms.length) return;
    const scrolling = rooms.filter((tile) => tile.danmaku.mode === "scroll");
    // 单房覆盖全局后显示真实的混合状态，不把默认值误呈现为全部房间状态。
    for (const button of section.querySelectorAll("[data-dm-global-choice]")) {
      const choiceType = button.dataset.dmGlobalChoice;
      const targets = choiceType === "mode" ? rooms : scrolling;
      let matched = false;
      if (choiceType === "mode") {
        matched = targets.length > 0 && targets.every((tile) => tile.danmaku.mode === button.dataset.value);
      } else if (choiceType === "style") {
        matched = targets.length > 0 && targets.every((tile) => tile.danmaku.scrollStyle === button.dataset.value);
      } else if (choiceType === "area") {
        matched = targets.length > 0 && targets.every((tile) => Number(tile.danmaku.area || 1) === Number(button.dataset.value));
      }
      button.setAttribute("aria-pressed", String(matched));
    }
    const areaWrap = query("[data-dm-defaults-area-wrap]");
    if (areaWrap) areaWrap.hidden = !scrolling.length;
    const styleWrap = query("[data-dm-defaults-style-wrap]");
    if (styleWrap) styleWrap.hidden = !scrolling.length;
    if (scrolling.length && scrolling.length !== rooms.length) query("[data-dm-mode-hint]").textContent = "各房间显示方式不同，可在此统一切换。";
  };
  ctx.syncDrawerDanmaku = () => {
    ctx.syncGlobalDanmakuActions();
  };
  // 全局只有显示字段会被同步，不覆盖房间过滤、开关等旧工作区偏好。
  for (const button of section.querySelectorAll("[data-dm-global-choice]")) {
    button.addEventListener("click", () => {
      const choiceType = button.dataset.dmGlobalChoice;
      let patch = {};
      if (choiceType === "mode") patch = { mode: button.dataset.value };
      else if (choiceType === "style") patch = { scrollStyle: button.dataset.value };
      else if (choiceType === "area") patch = { area: Number(button.dataset.value) };
      ctx.danmakuDefaults = normalizeDanmaku({ ...ctx.danmakuDefaults, ...patch, enabled: false });
      applyDanmakuToAll(ctx, patch);
      ctx.syncDrawerDanmaku();
      ctx.save();
      query("[data-dm-global-status]").textContent = ctx.tiles.size ? `已更新 ${ctx.tiles.size} 个房间；单房开关保持不变。` : "已保存显示偏好，新房间默认关闭弹幕。";
    });
  }
  query("[data-dm-global-toggle]").addEventListener("click", () => {
    if (!ctx.tiles.size) return;
    const enabled = [...ctx.tiles.values()].some((tile) => !tile.danmaku.enabled);
    for (const tile of ctx.tiles.values()) updateTileDanmaku(ctx, tile, { enabled });
    ctx.syncGlobalDanmakuActions();
    ctx.save();
    query("[data-dm-global-status]").textContent = enabled ? "全部弹幕已开启；播放中的房间立即连接。" : "全部弹幕已关闭，显示偏好已保留。";
  });
  ctx.syncDrawerDanmaku();
}
