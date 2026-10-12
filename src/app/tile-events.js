import { clamp01 } from "../core/settings.js";
import { parseRoom } from "../core/room.js";

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

  tile.muteBtn?.addEventListener("click", () => ctx.toggleMute(tile));

  tile.audioCorner?.addEventListener("wheel", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const delta = event.deltaY < 0 ? 0.05 : -0.05;
    tile.vol = clamp01(Number((tile.vol + delta).toFixed(2)));
    if (tile.muted && delta > 0) tile.muted = false;
    tile.volSlider.value = String(tile.vol);
    ctx.paintSlider(tile.volSlider);
    ctx.applyAudio(tile);
    ctx.updateTileChrome(tile);
    ctx.save();
  }, { passive: false });

  tile.soloBtn?.addEventListener("click", () => ctx.toggleSolo(tile));

  tile.volSlider?.addEventListener("input", (event) => {
    tile.vol = clamp01(event.target.value, tile.vol);
    ctx.paintSlider(event.target);
    ctx.applyAudio(tile);
  });

  tile.volSlider?.addEventListener("change", () => ctx.save());

  tile.settingsBtn?.addEventListener("click", () => {
    tile.settingsEl.hidden = !tile.settingsEl.hidden;
    tile.settingsBtn.setAttribute("aria-expanded", String(!tile.settingsEl.hidden));
  });

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

  /* --- 房号修改表单 --- */
  find("[data-edit-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    tile.dmStatus.textContent = "";
    try {
      const next = parseRoom(find("[data-edit-input]").value);
      if ([...ctx.tiles.values()].some((other) => other !== tile && other.rid === next)) {
        throw new Error("该房间已存在");
      }
      ctx.stop(tile);
      tile.rid = next;
      tile.nameRequest?.abort();
      tile.name = "";
      tile.nameStatus = "loading";
      ctx.updateTileChrome(tile);
      tile.settingsEl.hidden = true;
      ctx.save();
      void ctx.handleStart(tile);
    } catch (error) {
      tile.dmStatus.textContent = error.message || String(error);
    }
  });

  find("[data-edit-cancel]")?.addEventListener("click", () => {
    tile.settingsEl.hidden = true;
    tile.settingsBtn.setAttribute("aria-expanded", "false");
  });

  /* --- 点击选择 / 放大 / 右键 --- */
  root.addEventListener("click", (event) => {
    if (event.target.closest("button, input, select, textarea, label, a")) return;
    ctx.select(tile);
  });

  root.addEventListener("dblclick", (event) => {
    if (event.target.closest("button, input, select, textarea, label, a")) return;
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
