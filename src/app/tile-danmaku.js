import { normalizeDanmaku } from "../core/danmaku-render.js";
import { iconMarkup } from "../ui/icons.js";

export const syncDanmakuDisplay = (root, options, global = false) => {
  const attribute = global ? "data-dm-global-choice" : "data-dm-choice";
  for (const button of root.querySelectorAll(`[${attribute}]`)) {
    const choiceType = button.getAttribute(attribute);
    let matched = false;
    if (choiceType === "mode") {
      matched = options.mode === button.dataset.value;
    } else if (choiceType === "style") {
      matched = options.scrollStyle === button.dataset.value;
    } else if (choiceType === "area") {
      matched = Number(options.area || 1) === Number(button.dataset.value);
    }
    button.setAttribute("aria-pressed", String(matched));
  }
  const isScroll = options.mode !== "sidebar";
  const style = root.querySelector(global ? "[data-dm-defaults-style-wrap]" : "[data-dm-style-wrap]");
  if (style) style.hidden = !isScroll;
  const area = root.querySelector(global ? "[data-dm-defaults-area-wrap]" : "[data-dm-area-wrap]");
  if (area) area.hidden = !isScroll;
  const hint = root.querySelector("[data-dm-mode-hint]");
  if (hint) hint.textContent = isScroll ? "弹幕从画面上方飘过，弹幕栏自动收起。" : "独立右侧列，画面与所有操作按钮均完整保留。";
};

export const syncDanmakuButtons = (tile) => {
  const enabled = tile.danmaku.enabled;
  const toggle = tile.root.querySelector("[data-dm-toggle]");
  if (toggle) {
    toggle.innerHTML = `${iconMarkup(enabled ? "chat" : "chatOff")}<span>${enabled ? "关闭" : "开启"}</span>`;
    toggle.setAttribute("aria-pressed", String(enabled));
    toggle.setAttribute("aria-label", enabled ? "关闭弹幕" : "开启弹幕");
  }
  const summary = tile.root.querySelector("[data-dm-summary]");
  if (summary) summary.textContent = enabled ? `${tile.danmaku.mode === "sidebar" ? "弹幕栏" : "飘屏弹幕"} · 已开启` : "已关闭 · 保留显示偏好";
  syncDanmakuDisplay(tile.root, tile.danmaku);
};

export const syncDanmakuFields = (ctx, tile) => syncDanmakuButtons(tile);
// 保留调用方接口，旧工作区的显示细节仍可安全恢复。
export const readDanmakuFields = (tile) => normalizeDanmaku(tile.danmaku);

export const updateTileDanmaku = (ctx, tile, options, { reconnect = false } = {}) => {
  const previousEnabled = tile.danmaku.enabled;
  tile.danmaku = normalizeDanmaku({ ...tile.danmaku, ...options });
  if (reconnect || previousEnabled !== tile.danmaku.enabled) ctx.handleDanmaku(tile);
  else tile.renderer.update(tile.danmaku);
  syncDanmakuButtons(tile);
  ctx.updateTileChrome(tile);
  ctx.syncGlobalDanmakuActions?.();
};

export const clearTileDanmaku = (tile) => tile.renderer.clear();

export const applyDanmakuToAll = (ctx, options) => {
  for (const tile of ctx.tiles.values()) {
    updateTileDanmaku(ctx, tile, { ...options, enabled: tile.danmaku.enabled });
  }
};

export function bindTileDanmaku(ctx, tile) {
  const handleToggleDanmaku = () => {
    updateTileDanmaku(ctx, tile, { enabled: !tile.danmaku.enabled });
    ctx.syncGlobalDanmakuActions?.();
    ctx.save();
  };
  tile.root.querySelector("[data-t-danmaku]").addEventListener("click", handleToggleDanmaku);
  tile.root.querySelector("[data-dm-toggle]").addEventListener("click", handleToggleDanmaku);
  tile.root.querySelector("[data-dm-sidebar-close]").addEventListener("click", () => {
    updateTileDanmaku(ctx, tile, { enabled: false });
    ctx.syncGlobalDanmakuActions?.();
    ctx.save();
    tile.root.querySelector("[data-t-danmaku]").focus();
  });
  for (const button of tile.root.querySelectorAll("[data-dm-choice]")) {
    button.addEventListener("click", () => {
      const choiceType = button.dataset.dmChoice;
      let patch = {};
      if (choiceType === "mode") patch = { mode: button.dataset.value };
      else if (choiceType === "style") patch = { scrollStyle: button.dataset.value };
      else if (choiceType === "area") patch = { area: Number(button.dataset.value) };
      updateTileDanmaku(ctx, tile, patch);
      ctx.danmakuDefaults = normalizeDanmaku({ ...ctx.danmakuDefaults, ...patch, enabled: false });
      ctx.save();
    });
  }
}
