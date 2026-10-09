import { clamp01, MAX_TILES, API_BASE } from "../core/settings.js";
import { parseRoom } from "../core/room.js";
import { normalizeDanmaku, DanmakuRenderer } from "../core/danmaku-render.js";
import { recordHistory } from "../api/history.js";
import { tileMarkup } from "../ui/tile-markup.js";
import { rateOptions, sizeOptions, speedOptions, areaOptions } from "../ui/options.js";
import { setIconButton } from "../ui/icons.js";

// 画格生命周期：增删换位、控件绑定、弹幕字段读写。
export function initTile(ctx) {
  ctx.swapTiles = (a, b) => {
    if (ctx.pipSession && (ctx.pipSession.tile === a || ctx.pipSession.tile === b)) return;
    const entries = [...ctx.tiles.entries()];
    const indexA = entries.findIndex(([id]) => id === a.id);
    const indexB = entries.findIndex(([id]) => id === b.id);
    if (indexA < 0 || indexB < 0) return;
    [entries[indexA][1], entries[indexB][1]] = [entries[indexB][1], entries[indexA][1]];
    ctx.tiles.clear();
    for (const [id, tile] of entries) ctx.tiles.set(id, tile);
    for (const tile of ctx.tiles.values()) {
      if (!ctx.pipSession || ctx.pipSession.tile !== tile) ctx.wall.append(tile.root);
    }
    ctx.handleLayout();
    ctx.save();
  };

  ctx.removeTile = (tile) => {
    if (ctx.pipSession?.tile === tile) ctx.handleClosePip();
    ctx.stop(tile);
    ctx.tiles.delete(tile.id);
    tile.root.remove();
    if (ctx.focused === tile.id) ctx.focused = null;
    if (ctx.selectedId === tile.id) ctx.selectedId = null;
    ctx.handleLayout();
    ctx.updateCount();
    ctx.save();
  };

  ctx.syncDanmakuFields = (tile) => {
    const find = (selector) => tile.root.querySelector(selector);
    find("[data-dm-size]").value = String(tile.danmaku.size);
    find("[data-dm-speed]").value = String(tile.danmaku.speed);
    find("[data-dm-opacity]").value = String(tile.danmaku.opacity);
    ctx.paintSlider(find("[data-dm-opacity]"));
    find("[data-dm-area]").value = String(tile.danmaku.area);
    find("[data-dm-blocked]").value = tile.danmaku.blockedWords.join("\n");
  };

  ctx.readDanmakuFields = (tile) => {
    const find = (selector) => tile.root.querySelector(selector);
    const blockedWords = find("[data-dm-blocked]").value.split(/[\n,，]/).map((word) => word.trim()).filter(Boolean);
    if (blockedWords.length > 50 || blockedWords.some((word) => word.length > 40)) {
      tile.dmStatus.textContent = "最多 50 个屏蔽词，每个不超过 40 字；本次修改未保存";
      return null;
    }
    tile.dmStatus.textContent = "";
    return normalizeDanmaku({
      enabled: tile.danmaku.enabled,
      size: Number(find("[data-dm-size]").value),
      speed: Number(find("[data-dm-speed]").value),
      opacity: Number(find("[data-dm-opacity]").value),
      area: Number(find("[data-dm-area]").value),
      blockedWords
    });
  };

  ctx.addTile = (rid, rate = 1, autoplay = true, danmaku = null, audioRestore = null) => {
    if (ctx.tiles.size >= MAX_TILES) throw new Error(`最多添加 ${MAX_TILES} 格`);
    if ([...ctx.tiles.values()].some((other) => other.rid === rid)) throw new Error("该房间已存在");
    const root = document.createElement("article");
    root.className = "tile-shell";
    root.innerHTML = tileMarkup();
    const find = (selector) => root.querySelector(selector);
    const tile = {
      id: crypto.randomUUID(), rid, rate, name: rid, liveStatus: undefined,
      root, video: root.querySelector("video"), canvas: root.querySelector("canvas"),
      player: null, request: null, generation: 0, attempt: 0, state: "stopped",
      vol: 1, muted: ctx.audio.autoMute,
      danmaku: normalizeDanmaku({ ...ctx.danmakuDefaults, ...(danmaku || {}) }),
      retrying: false, retryAt: 0, retryTimer: null, watch: null, stableTimer: null, lastProbe: 0,
      dotEl: find("[data-dot]"), nameEl: find("[data-name]"), badgeEl: find("[data-badge]"),
      noteEl: find("[data-note]"), retryEl: find("[data-retry]"), retryText: find("[data-retry-text]"),
      clockEl: find("[data-clock]"), muteBtn: find("[data-t-mute]"), volSlider: find("[data-t-vol]"),
      resumeBtn: find("[data-t-resume]"), soloBtn: find("[data-t-solo]"), danmakuBtn: find("[data-t-danmaku]"),
      rateSel: find("[data-t-rate]"), pipButton: find("[data-t-pip]"), settingsBtn: find("[data-t-settings]"),
      settingsEl: find("[data-tile-settings]"), dmStatus: find("[data-dm-status]")
    };
    if (audioRestore) {
      tile.vol = clamp01(audioRestore.volume);
      tile.muted = audioRestore.muted !== false;
    }
    tile.renderer = new DanmakuRenderer(tile.canvas, tile.danmaku);
    find("[data-t-rate]").innerHTML = rateOptions;
    find("[data-t-rate]").value = String(rate);
    find("[data-dm-size]").innerHTML = sizeOptions;
    find("[data-dm-speed]").innerHTML = speedOptions;
    find("[data-dm-area]").innerHTML = areaOptions;
    ctx.syncDanmakuFields(tile);
    for (const [selector, icon, label] of [
      ["[data-t-resume]", "play", "播放 / 暂停"], ["[data-t-reload]", "retry", "重新取流"],
      ["[data-t-solo]", "solo", "独奏该房间"], ["[data-t-danmaku]", "chat", "弹幕开关"],
      ["[data-t-settings]", "sliders", "房间设置"], ["[data-t-pip]", "pip", "弹幕画中画"],
      ["[data-t-full]", "full", "全屏"], ["[data-t-external]", "external", "去该房间发弹幕"],
      ["[data-t-remove]", "trash", "移除该房间"], ["[data-t-mute]", "muted", "静音"],
      ["[data-t-retry-now]", "retry", "立即重试"], ["[data-edit-cancel]", "close", "取消修改"],
      ["[data-edit-form] button[type=submit]", "check", "确认修改房号"]
    ]) {
      const button = find(selector);
      if (button) setIconButton(button, icon, label);
    }
    ctx.updateTileChrome(tile);
    ctx.setStatus(tile, "stopped", "待播放");

    /* --- 交互 --- */
    find("[data-t-resume]").addEventListener("click", () => {
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
    find("[data-t-reload]").addEventListener("click", () => void ctx.handleStart(tile));
    find("[data-t-retry-now]").addEventListener("click", () => {
      tile.attempt = 0;
      void ctx.handleStart(tile);
    });
    find("[data-t-stop]")?.addEventListener("click", () => ctx.stop(tile));
    tile.muteBtn.addEventListener("click", () => ctx.toggleMute(tile));
    tile.soloBtn.addEventListener("click", () => ctx.toggleSolo(tile));
    tile.volSlider.addEventListener("input", (event) => {
      tile.vol = clamp01(event.target.value, tile.vol);
      ctx.paintSlider(event.target);
      ctx.applyAudio(tile);
    });
    tile.volSlider.addEventListener("change", () => ctx.save());
    find("[data-t-danmaku]").addEventListener("click", () => {
      tile.danmaku = normalizeDanmaku({ ...tile.danmaku, enabled: !tile.danmaku.enabled });
      ctx.updateTileChrome(tile);
      ctx.handleDanmaku(tile);
      ctx.save();
    });
    tile.settingsBtn.addEventListener("click", () => {
      tile.settingsEl.hidden = !tile.settingsEl.hidden;
      tile.settingsBtn.setAttribute("aria-expanded", String(!tile.settingsEl.hidden));
    });
    find("[data-t-pip]").addEventListener("click", () => void ctx.handlePip(tile));
    find("[data-t-full]").addEventListener("click", () => {
      try {
        if (root.ownerDocument.fullscreenElement === root) void root.ownerDocument.exitFullscreen();
        else void root.requestFullscreen();
      } catch (error) {
        ctx.showToast(`全屏失败：${error.message || error}`, [], 5e3);
      }
    });
    find("[data-t-external]").addEventListener("click", () => window.open(`https://www.douyu.com/${tile.rid}`, "_blank", "noopener,noreferrer"));
    find("[data-t-remove]").addEventListener("click", () => ctx.removeTile(tile));
    tile.rateSel.addEventListener("change", (event) => {
      tile.rate = Number(event.target.value);
      ctx.save();
      if (!["stopped", "failed", "waiting"].includes(tile.state)) void ctx.handleStart(tile);
    });
    for (const selector of ["[data-dm-size]", "[data-dm-speed]", "[data-dm-area]"]) find(selector).addEventListener("change", handleDanmakuOptions);
    find("[data-dm-opacity]").addEventListener("input", handleDanmakuOptions);
    find("[data-dm-blocked]").addEventListener("change", handleDanmakuOptions);
    find("[data-dm-reset]").addEventListener("click", () => {
      tile.danmaku = normalizeDanmaku({ ...ctx.danmakuDefaults, enabled: tile.danmaku.enabled });
      ctx.syncDanmakuFields(tile);
      ctx.handleDanmaku(tile);
      ctx.save();
    });
    find("[data-dm-apply-all]").addEventListener("click", () => {
      const next = ctx.readDanmakuFields(tile);
      if (!next) return;
      tile.danmaku = next;
      ctx.danmakuDefaults = normalizeDanmaku(next);
      ctx.syncDrawerDanmaku();
      for (const other of ctx.tiles.values()) {
        other.danmaku = normalizeDanmaku({ ...ctx.danmakuDefaults, enabled: other.danmaku.enabled });
        ctx.syncDanmakuFields(other);
        ctx.handleDanmaku(other);
        ctx.updateTileChrome(other);
      }
      ctx.handleDanmaku(tile);
      ctx.save();
      ctx.showToast("弹幕设置已应用到全部房间并保存为默认", [], 4e3);
    });
    find("[data-edit-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      tile.dmStatus.textContent = "";
      try {
        const next = parseRoom(find("[data-edit-input]").value);
        if ([...ctx.tiles.values()].some((other) => other !== tile && other.rid === next)) throw new Error("该房间已存在");
        ctx.stop(tile);
        tile.rid = next;
        tile.name = next;
        ctx.updateTileChrome(tile);
        tile.settingsEl.hidden = true;
        ctx.save();
        void ctx.handleStart(tile);
      } catch (error) {
        tile.dmStatus.textContent = error.message || String(error);
      }
    });
    find("[data-edit-cancel]").addEventListener("click", () => {
      tile.settingsEl.hidden = true;
      tile.settingsBtn.setAttribute("aria-expanded", "false");
    });
    function handleDanmakuOptions() {
      const next = ctx.readDanmakuFields(tile);
      if (!next) return;
      tile.danmaku = next;
      ctx.updateTileChrome(tile);
      tile.renderer.update(tile.danmaku);
      ctx.save();
    }

    /* --- 选择 / 放大 / 右键 / 拖拽 --- */
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
    const dragHandle = find("[data-drag]");
    dragHandle.addEventListener("dragstart", (event) => {
      if (!event.dataTransfer) return;
      ctx.dragSourceId = tile.id;
      event.dataTransfer.effectAllowed = "move";
      try {
        event.dataTransfer.setData("text/plain", tile.rid);
      } catch {
      }
    });
    dragHandle.addEventListener("dragend", () => {
      ctx.dragSourceId = null;
      root.style.outline = "";
    });
    root.addEventListener("dragover", (event) => {
      if (!ctx.dragSourceId || ctx.dragSourceId === tile.id) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      root.style.outline = "2px solid #fbbf24";
    });
    root.addEventListener("dragleave", () => {
      root.style.outline = "";
    });
    root.addEventListener("drop", (event) => {
      event.preventDefault();
      root.style.outline = "";
      const source = ctx.tiles.get(ctx.dragSourceId);
      ctx.dragSourceId = null;
      if (source && source !== tile) ctx.swapTiles(source, tile);
    });
    tile.video.addEventListener("play", () => ctx.updateTileChrome(tile));
    tile.video.addEventListener("pause", () => ctx.updateTileChrome(tile));

    ctx.tiles.set(tile.id, tile);
    ctx.pendingTiles = null; // 用户亲手建墙后，墙即工作区，不再保留未装配的旧房间
    ctx.wall.append(root);
    ctx.handleLayout();
    ctx.updateCount();
    recordHistory(tile.rid);
    ctx.save();
    if (autoplay) void ctx.handleStart(tile);
    return tile;
  };
}
