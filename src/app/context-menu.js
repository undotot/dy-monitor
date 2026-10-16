import { API_BASE } from "../core/settings.js";
import { iconMarkup } from "../ui/icons.js";
import { closeTileSettingsPanels, setTileDanmakuSettings } from "./tile-events.js";
import { closeTileMore } from "./tile-tools.js";
import { isTileFullscreen } from "./tile-fullscreen.js";

// 右键菜单：画格快捷操作 + 弹幕设置 + 分隔线 + 移除；点击外部关闭菜单与画格设置浮层。
export function initContextMenu(ctx) {
  ctx.closeContextMenu = () => {
    ctx.els.ctx.hidden = true;
    ctx.els.ctx.replaceChildren();
    if (ctx.els.ctx.parentElement !== ctx.appShell) ctx.appShell.append(ctx.els.ctx);
  };

  ctx.openContextMenu = (tile, clientX, clientY) => {
    const menu = ctx.els.ctx;
    // 原生全屏只显示目标及其后代，不能把右键菜单留在外面的 app-shell。
    const menuParent = isTileFullscreen(tile.root) ? tile.root : ctx.appShell;
    if (menu.parentElement !== menuParent) menuParent.append(menu);
    menu.replaceChildren();
    const items = [
      [tile.video.paused ? "play" : "pause", tile.video.paused ? "播放 / 重试" : "暂停", () => ctx.findAction(tile, "resume")],
      ["retry", "重新取流", () => void ctx.handleStart(tile)],
      ["solo", ctx.audio.mode === "solo" && ctx.soloTargetId() === tile.id ? "取消独奏" : "独奏该房间", () => ctx.toggleSolo(tile)],
      [tile.muted ? "volume" : "muted", tile.muted ? "开启声音" : "静音", () => ctx.toggleMute(tile)],
      [tile.danmaku.enabled ? "chatOff" : "chat", tile.danmaku.enabled ? "关闭弹幕" : "开启弹幕", () => ctx.findAction(tile, "danmaku")],
      ["settings", "弹幕设置 (飘屏范围/版式)…", () => setTileDanmakuSettings(tile, true)],
      ["pip", "弹幕画中画", () => void ctx.handlePip(tile)],
      ["full", isTileFullscreen(tile.root) ? "退出全屏" : "全屏", () => ctx.findAction(tile, "full")],
      ["external", "去该房间发弹幕", () => window.open(`${API_BASE}/${tile.rid}`, "_blank", "noopener,noreferrer")],
      ["edit", "修改房号", () => ctx.openAdd(tile)],
      ["layers", ctx.focused === tile.id ? "恢复平铺" : "放大该房间", () => ctx.toggleFocus(tile)]
    ];
    for (const [icon, label, onClick] of items) {
      const button = document.createElement("button");
      button.className = "ctx-item";
      button.innerHTML = `${iconMarkup(icon)}<span>${label}</span>`;
      button.addEventListener("click", () => {
        ctx.closeContextMenu();
        onClick();
      });
      menu.append(button);
    }
    const sep = document.createElement("div");
    sep.className = "ctx-sep";
    menu.append(sep);
    const remove = document.createElement("button");
    remove.className = "ctx-item del";
    remove.innerHTML = `${iconMarkup("trash")}<span>移除该房间</span>`;
    remove.addEventListener("click", () => {
      ctx.closeContextMenu();
      ctx.removeTile(tile);
    });
    menu.append(remove);
    menu.hidden = false;
    const rect = menuParent.getBoundingClientRect();
    const x = Math.min(clientX - rect.left, rect.width - menu.offsetWidth - 8);
    const y = Math.min(clientY - rect.top, rect.height - menu.offsetHeight - 8);
    menu.style.left = `${Math.max(8, x)}px`;
    menu.style.top = `${Math.max(8, y)}px`;
  };

  ctx.findAction = (tile, kind) => {
    const map = { resume: "[data-t-resume]", danmaku: "[data-t-danmaku]", full: "[data-t-full]" };
    tile.root.querySelector(map[kind])?.click();
  };

  // 点击空白处：先收右键菜单，再收所有打开的画格设置浮层。
  ctx.wrapper.addEventListener("pointerdown", (event) => {
    const path = event.composedPath();
    if (!ctx.els.ctx.hidden && !path.includes(ctx.els.ctx)) ctx.closeContextMenu();
    for (const tile of ctx.tiles.values()) {
      if (!path.includes(tile.root.querySelector("[data-t-more-menu]")) && !path.includes(tile.root.querySelector("[data-t-more]"))) closeTileMore(tile.root);
    }
    if (path.some((node) => node?.matches?.("[data-tile-settings], [data-t-dm-settings], [data-t-dm-settings-bar], [data-t-dm-settings-sidebar], [data-audio-corner]"))) return;
    closeTileSettingsPanels(ctx.wrapper);
  });
}
