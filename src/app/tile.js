import { clamp01, MAX_TILES } from "../core/settings.js";
import { normalizeDanmaku, DanmakuRenderer } from "../core/danmaku-render.js";
import { recordHistory, loadHistory } from "../api/history.js";
import { fetchProbe } from "../api/probe.js";
import { normalizeRoomName } from "../core/room-name.js";
import { tileMarkup } from "../ui/tile-markup.js";
import { rateOptions, sizeOptions, speedOptions, areaOptions } from "../ui/options.js";
import { setIconButton } from "../ui/icons.js";
import { observeTileControls } from "../core/tile-scale.js";
import { syncDanmakuFields, readDanmakuFields, bindTileDanmaku } from "./tile-danmaku.js";
import { bindTileDrag } from "./tile-drag.js";
import { bindTileEvents } from "./tile-events.js";

// 画格生命周期：增删换位、控件装配、状态流转。
export function initTile(ctx) {
  ctx.swapTiles = (a, b) => {
    if (ctx.pipSession && (ctx.pipSession.tile === a || ctx.pipSession.tile === b)) return;
    const entries = [...ctx.tiles.entries()];
    const indexA = entries.findIndex(([id]) => id === a.id);
    const indexB = entries.findIndex(([id]) => id === b.id);
    if (indexA < 0 || indexB < 0) return;
    [entries[indexA], entries[indexB]] = [entries[indexB], entries[indexA]];
    // 放大布局的主区域也是一个位置：交换时让目标房间接替该位置。
    if (ctx.focused === a.id) ctx.focused = b.id;
    else if (ctx.focused === b.id) ctx.focused = a.id;
    ctx.tiles.clear();
    for (const [id, tile] of entries) ctx.tiles.set(id, tile);
    ctx.handleLayout();
    ctx.save();
  };

  ctx.removeTile = (tile) => {
    if (ctx.pipSession?.tile === tile) ctx.handleClosePip();
    ctx.stop(tile);
    tile.nameRequest?.abort();
    tile.disconnectControls?.();
    ctx.tiles.delete(tile.id);
    tile.root.remove();
    if (ctx.focused === tile.id) ctx.focused = null;
    if (ctx.selectedId === tile.id) ctx.selectedId = null;
    ctx.handleLayout();
    ctx.updateCount();
    ctx.save();
  };

  ctx.syncDanmakuFields = (tile) => syncDanmakuFields(ctx, tile);
  ctx.readDanmakuFields = (tile) => readDanmakuFields(tile);

  ctx.updateTileRates = (tile, multirates, currentRate) => {
    if (!tile.rateSel) return;
    if (Array.isArray(multirates) && multirates.length > 0) {
      tile.availableRates = multirates;
      tile.rateSel.innerHTML = multirates
        .map((item) => `<option value="${item.rate}">${item.name}</option>`)
        .join("");
    }
    if (currentRate != null && Number.isFinite(Number(currentRate))) {
      const numRate = Number(currentRate);
      if (tile.rate !== numRate) {
        const match = tile.availableRates?.find((m) => m.rate === numRate);
        ctx.log(tile.rid, `清晰度自动对齐：平台实际生效为 ${match?.name || numRate}`);
        tile.rate = numRate;
        ctx.save();
      }
    }
    tile.rateSel.value = String(tile.rate);
  };

  ctx.addTile = (rid, rate = 1, autoplay = true, danmaku = null, audioRestore = null, name = "") => {
    if (ctx.tiles.size >= MAX_TILES) throw new Error(`最多添加 ${MAX_TILES} 格`);
    if ([...ctx.tiles.values()].some((other) => other.rid === rid)) throw new Error("该房间已存在");
    const root = document.createElement("article");
    root.className = "tile-shell";
    root.tabIndex = 0;
    root.setAttribute("role", "group");
    root.innerHTML = tileMarkup();
    const find = (selector) => root.querySelector(selector);
    const tile = {
      id: crypto.randomUUID(), rid, rate, name: normalizeRoomName(name, rid) || normalizeRoomName(loadHistory().find((entry) => String(entry.rid) === String(rid))?.name, rid), nameStatus: "loading", liveStatus: undefined,
      root, video: root.querySelector("video"), canvas: root.querySelector("canvas"),
      player: null, request: null, generation: 0, attempt: 0, state: "stopped",
      vol: 1, muted: ctx.audio.autoMute,
      danmaku: normalizeDanmaku({ ...ctx.danmakuDefaults, ...(danmaku || {}), enabled: false }),
      retrying: false, retryAt: 0, retryTimer: null, watch: null, stableTimer: null, lastProbe: 0,
      dotEl: find("[data-dot]"), nameEl: find("[data-name]"),
      noteEl: find("[data-note]"), retryEl: find("[data-retry]"), retryText: find("[data-retry-text]"),
      muteBtn: find("[data-t-mute]"), volSlider: find("[data-t-vol]"), audioCorner: find("[data-audio-corner]"),
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
    ctx.applyAudio(tile);
    ctx.setStatus(tile, "stopped", "待播放");

    bindTileEvents(ctx, tile);
    bindTileDanmaku(ctx, tile);
    bindTileDrag(ctx, tile);

    ctx.tiles.set(tile.id, tile);
    ctx.pendingTiles = null; // 用户亲手建墙后，墙即工作区，不再保留未装配的旧房间
    ctx.wall.append(root);
    tile.disconnectControls = observeTileControls(root);
    ctx.handleLayout();
    ctx.updateCount();
    recordHistory(tile.rid, tile.name);
    ctx.save();
    if (autoplay) void ctx.handleStart(tile);
    if (!tile.name && (!autoplay || !ctx.opened)) {
      const controller = new AbortController();
      tile.nameRequest = controller;
      void ctx.scheduler.sign(() => fetchProbe(rid, controller.signal), controller.signal).then((probe) => {
        if (controller.signal.aborted || ctx.tiles.get(tile.id) !== tile || tile.rid !== rid) return;
        tile.name = normalizeRoomName(probe.name, probe.rid);
        tile.nameStatus = tile.name ? "ready" : "error";
        ctx.updateTileChrome(tile);
        recordHistory(tile.rid, tile.name, probe.avatar);
        ctx.save();
      }).catch(() => {
        if (controller.signal.aborted || ctx.tiles.get(tile.id) !== tile || tile.rid !== rid) return;
        tile.nameStatus = "error";
        ctx.updateTileChrome(tile);
      }).finally(() => { if (tile.nameRequest === controller) tile.nameRequest = null; });
    }
    return tile;
  };
}
