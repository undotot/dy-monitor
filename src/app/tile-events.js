import { bindTileAudio } from "./tile-audio.js";
import { bindTileTools, closeTileMore } from "./tile-tools.js";
import { bindTileFullscreen, isTileFullscreen } from "./tile-fullscreen.js";

export const closeTileSettingsPanels = (scope, except = null) => {
  for (const panel of scope.querySelectorAll("[data-tile-settings]")) {
    if (panel === except || panel.hidden) continue;
    panel.hidden = true;
    panel.classList.remove("is-room-flyout");
    const root = panel.closest(".tile-shell");
    root?.classList.remove("dm-settings-open");
    for (const button of root?.querySelectorAll("[data-t-dm-settings]") || []) button.setAttribute("aria-expanded", "false");
  }
};

export const setTileDanmakuSettings = (tile, visible = true) => {
  if (visible) closeTileSettingsPanels(tile.root.getRootNode(), tile.settingsEl);
  if (visible) closeTileMore(tile.root);
  tile.settingsEl.hidden = !visible;
  tile.settingsEl.classList.toggle("is-room-flyout", visible && (tile.root.clientWidth < 420 || tile.root.clientHeight < 340));
  tile.root.classList.toggle("dm-settings-open", visible);
  for (const entry of tile.root.querySelectorAll("[data-t-dm-settings], [data-t-dm-settings-bar], [data-t-dm-settings-sidebar]")) {
    entry.setAttribute("aria-expanded", String(visible));
  }
  (visible ? tile.root.querySelector("[data-dm-toggle]") : tile.root.querySelector("[data-t-dm-settings-bar]") || tile.root.querySelector("[data-t-dm-settings]") || tile.root.querySelector("[data-t-more]"))?.focus();
};

export function bindTileEvents(ctx, tile) {
  const root = tile.root;
  const find = (selector) => root.querySelector(selector);

  /* --- 控制按钮 --- */
  find("[data-t-resume]")?.addEventListener("click", () => {
    if (!tile.player) {
      void ctx.handleStart(tile);
      return;
    }
    if (!tile.video.paused) {
      tile.video.pause();
      return;
    }
    void tile.video.play().catch(() => ctx.setStatus(tile, "blocked", "浏览器仍阻止播放，请再次点击播放"));
  });

  for (const btn of root.querySelectorAll("[data-t-reload], [data-t-reload-bar]")) {
    btn.addEventListener("click", () => void ctx.handleStart(tile));
  }

  find("[data-t-retry-now]")?.addEventListener("click", () => {
    tile.attempt = 0;
    void ctx.handleStart(tile);
  });

  find("[data-t-stop]")?.addEventListener("click", () => ctx.stop(tile));

  bindTileAudio(ctx, tile);
  bindTileTools(tile);
  tile.soloBtn?.addEventListener("click", () => ctx.toggleSolo(tile));
  for (const btn of root.querySelectorAll("[data-t-dm-settings], [data-t-dm-settings-bar], [data-t-dm-settings-sidebar]")) {
    btn.addEventListener("click", () => setTileDanmakuSettings(tile, tile.settingsEl.hidden));
  }
  find("[data-settings-close]")?.addEventListener("click", () => setTileDanmakuSettings(tile, false));

  find("[data-t-pip]")?.addEventListener("click", () => void ctx.handlePip(tile));

  bindTileFullscreen(ctx, tile);

  find("[data-t-external]")?.addEventListener("click", () => {
    window.open(`https://www.douyu.com/${tile.rid}`, "_blank", "noopener,noreferrer");
  });

  for (const btn of root.querySelectorAll("[data-t-remove], [data-t-remove-bar]")) {
    btn.addEventListener("click", () => ctx.removeTile(tile));
  }

  tile.rateSel?.addEventListener("change", (event) => {
    tile.rate = Number(event.target.value);
    ctx.save();
    if (!["stopped", "failed", "waiting"].includes(tile.state)) void ctx.handleStart(tile);
  });

  /* --- 点击选择 / 放大 / 右键 --- */
  root.addEventListener("click", (event) => {
    if (event.target.closest("button, input, select, textarea, label, a")) return;
    ctx.select(tile);
    // 移动端/触屏适配：轻点画格唤出控制条，3.5 秒后自动淡出
    root.classList.add("tools-visible");
    clearTimeout(tile.toolsTimer);
    tile.toolsTimer = setTimeout(() => root.classList.remove("tools-visible"), 3500);
  });

  root.addEventListener("dblclick", (event) => {
    if (event.target.closest("button, input, select, textarea, label, a, [data-dm-sidebar]")) return;
    if (isTileFullscreen(root)) return;
    ctx.toggleFocus(tile);
  });

  root.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    ctx.select(tile);
    ctx.openContextMenu(tile, event.clientX, event.clientY);
  });

  /* --- 视频事件 --- */
  tile.video.addEventListener("play", () => ctx.updateTileChrome(tile));
  tile.video.addEventListener("pause", () => ctx.updateTileChrome(tile));
  tile.video.addEventListener("loadedmetadata", () => ctx.scheduleLayout());
  tile.video.addEventListener("resize", () => ctx.scheduleLayout());
}
