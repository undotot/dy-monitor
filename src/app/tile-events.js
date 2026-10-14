import { bindTileAudio } from "./tile-audio.js";
import { bindTileTools, closeTileMore } from "./tile-tools.js";

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
  const entry = tile.root.querySelector("[data-t-dm-settings]");
  entry?.setAttribute("aria-expanded", String(visible));
  (visible ? tile.root.querySelector("[data-dm-toggle]") : tile.root.querySelector("[data-t-more]") || entry)?.focus();
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

  find("[data-t-reload]")?.addEventListener("click", () => void ctx.handleStart(tile));

  find("[data-t-retry-now]")?.addEventListener("click", () => {
    tile.attempt = 0;
    void ctx.handleStart(tile);
  });

  find("[data-t-stop]")?.addEventListener("click", () => ctx.stop(tile));

  bindTileAudio(ctx, tile);
  bindTileTools(tile);
  tile.soloBtn?.addEventListener("click", () => ctx.toggleSolo(tile));
  find("[data-t-dm-settings]")?.addEventListener("click", () => setTileDanmakuSettings(tile, tile.settingsEl.hidden));
  find("[data-settings-close]")?.addEventListener("click", () => setTileDanmakuSettings(tile, false));

  find("[data-t-pip]")?.addEventListener("click", () => void ctx.handlePip(tile));

  find("[data-t-full]")?.addEventListener("click", () => {
    try {
      if (root.ownerDocument.fullscreenElement === root) void root.ownerDocument.exitFullscreen();
      else void root.requestFullscreen();
    } catch (error) {
      ctx.showToast(`全屏失败：${error.message || error}`, [], 5e3);
    }
  });

  find("[data-t-external]")?.addEventListener("click", () => {
    window.open(`https://www.douyu.com/${tile.rid}`, "_blank", "noopener,noreferrer");
  });

  find("[data-t-remove]")?.addEventListener("click", () => ctx.removeTile(tile));

  tile.rateSel?.addEventListener("change", (event) => {
    tile.rate = Number(event.target.value);
    ctx.save();
    if (!["stopped", "failed", "waiting"].includes(tile.state)) void ctx.handleStart(tile);
  });

  /* --- 点击选择 / 放大 / 右键 --- */
  root.addEventListener("click", (event) => {
    if (event.target.closest("button, input, select, textarea, label, a")) return;
    ctx.select(tile);
  });

  root.addEventListener("dblclick", (event) => {
    if (event.target.closest("button, input, select, textarea, label, a, [data-dm-sidebar]")) return;
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
