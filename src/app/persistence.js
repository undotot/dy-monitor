import { KEY, LEGACY_KEY, MAX_TILES, CAPACITIES, RATES, AUDIO_MODES, clamp01 } from "../core/settings.js";
import { normalizeDanmaku } from "../core/danmaku-render.js";
import { migrateLegacyWorkspace } from "../core/workspace.js";
import { parseRoom } from "../core/room.js";
import { storage } from "../platform/storage.js";

// 工作区持久化：schema v2 序列化 / 应用 / 控件回显，启动时兼容读取 v1。
export function initPersistence(ctx) {
  const els = ctx.els;
  const query = (selector) => ctx.wrapper.querySelector(selector);

  ctx.serializeWorkspace = () => ({
    schemaVersion: 2,
    layoutMode: ctx.layoutMode,
    capacity: ctx.scheduler.capacity,
    hevc: ctx.hevc,
    pauseOfficial: ctx.pauseOfficialEnabled,
    clock: ctx.clockEnabled,
    resumeMode: ctx.resumeMode,
    audio: { mode: ctx.audio.mode, master: ctx.audio.master, followFocus: ctx.audio.followFocus, autoMute: ctx.audio.autoMute },
    danmakuDefaults: ctx.danmakuDefaults,
    liveAlerts: ctx.liveAlerts, liveAlertSound: ctx.liveAlertSound, liveAutoPlay: ctx.liveAutoPlay,
    drawerVisible: ctx.drawerPreference,
    tiles: [...ctx.tiles.values()].map((tile) => ({ rid: tile.rid, rate: tile.rate, danmaku: tile.danmaku, audio: { muted: tile.muted, volume: tile.vol } }))
  });

  ctx.save = () => {
    if (ctx.restoring) return;
    try {
      const data = ctx.serializeWorkspace();
      // 墙为空但存在未装配的上次房间时，保留它们，避免“暂不加载”后被空工作区覆盖。
      if (!data.tiles.length && ctx.pendingTiles?.length) data.tiles = ctx.pendingTiles;
      storage.set(KEY, data);
    } catch {
      ctx.showToast("保存配置失败；本次观看仍可继续。", [], 5e3);
    }
  };

  ctx.syncControlsFromState = () => {
    els.audioMode.value = ctx.audio.mode;
    els.masterGain.value = String(ctx.audio.master);
    ctx.paintSlider(els.masterGain);
    els.masterPct.textContent = `${Math.round(ctx.audio.master * 100)}%`;
    query("[data-capacity]").value = String(ctx.scheduler.capacity);
    query("[data-hevc]").checked = ctx.hevc;
    query("[data-pause]").checked = ctx.pauseOfficialEnabled;
    query("[data-automute]").checked = ctx.audio.autoMute;
    query("[data-follow-focus]").checked = ctx.audio.followFocus;
    query("[data-live-alerts]").checked = ctx.liveAlerts;
    query("[data-live-sound]").checked = ctx.liveAlertSound;
    query("[data-live-autoplay]").checked = ctx.liveAutoPlay;
    query("[data-clock-toggle]").checked = ctx.clockEnabled;
    for (const el of ctx.wrapper.querySelectorAll("[name=resume-mode]")) el.checked = el.value === ctx.resumeMode;
    ctx.syncDrawerDanmaku();
    ctx.syncLayoutRadios();
  };

  ctx.applyWorkspace = (data, autoplay = false) => {
    ctx.restoring = true;
    ctx.pendingTiles = null;
    try {
      for (const tile of [...ctx.tiles.values()]) ctx.removeTile(tile);
      ctx.focused = null;
      ctx.selectedId = null;
      ctx.layoutMode = ["auto", 1, 2, 3, 4].includes(data.layoutMode === "auto" ? "auto" : Number(data.layoutMode)) ? data.layoutMode : 2;
      ctx.scheduler.capacity = CAPACITIES.includes(data.capacity) ? data.capacity : 8;
      ctx.hevc = data.hevc === true;
      ctx.pauseOfficialEnabled = data.pauseOfficial !== false;
      ctx.clockEnabled = data.clock !== false;
      ctx.resumeMode = ["always", "never"].includes(data.resumeMode) ? data.resumeMode : "ask";
      ctx.audio = {
        mode: AUDIO_MODES.includes(data.audio?.mode) ? data.audio.mode : "mix",
        master: clamp01(data.audio?.master, 0.5),
        followFocus: data.audio?.followFocus === true,
        autoMute: data.audio?.autoMute !== false
      };
      ctx.danmakuDefaults = normalizeDanmaku(data.danmakuDefaults || {});
      ctx.liveAlerts = data.liveAlerts !== false;
      ctx.liveAlertSound = data.liveAlertSound === true;
      ctx.liveAutoPlay = data.liveAutoPlay !== false;
      ctx.drawerPreference = data.drawerVisible !== false;
      ctx.syncControlsFromState();
      for (const entry of (Array.isArray(data.tiles) ? data.tiles : []).slice(0, MAX_TILES)) {
        try {
          ctx.addTile(parseRoom(String(entry.rid)), RATES.some(([rate]) => rate === entry.rate) ? entry.rate : 1, autoplay, entry.danmaku || null, entry.audio || null);
        } catch {
          ctx.log("", "跳过无效或重复的保存房间");
        }
      }
    } finally {
      ctx.restoring = false;
    }
    ctx.handleDrawer(ctx.drawerPreference, { focus: false, remember: false });
    ctx.handleLayout();
    ctx.applyAudioAll();
    ctx.updateCount();
    ctx.save();
  };

  // 把上次保存的房间装配进墙（用户确认加载或自动加载时调用）。
  ctx.loadPendingTiles = (autoplay = true) => {
    const entries = ctx.pendingTiles || [];
    ctx.pendingTiles = null;
    ctx.restoring = true;
    try {
      for (const entryData of entries) {
        try {
          ctx.addTile(parseRoom(String(entryData.rid)), RATES.some(([rate]) => rate === entryData.rate) ? entryData.rate : 1, autoplay, entryData.danmaku || null, entryData.audio || null);
        } catch {
          ctx.log("", "跳过无效或重复的保存房间");
        }
      }
    } finally {
      ctx.restoring = false;
    }
    ctx.handleLayout();
    ctx.applyAudioAll();
    ctx.updateCount();
  };

  // 把墙上全部画格收回为“待加载”（拒绝继续播放 / 暂不加载时调用）：
  // 墙清空、房间配置原样保留，下次打开重新询问 —— 否则拒绝后房间仍留在墙上。
  ctx.parkAllTiles = () => {
    const entries = [...ctx.tiles.values()].map((tile) => ({ rid: tile.rid, rate: tile.rate, danmaku: tile.danmaku, audio: { muted: tile.muted, volume: tile.vol } }));
    if (!entries.length) return;
    ctx.pendingTiles = entries;
    for (const tile of [...ctx.tiles.values()]) ctx.removeTile(tile);
    ctx.updateCount();
    ctx.save();
  };

  // 启动恢复：优先 v2，v1 走纯函数迁移。
  // 房间仅在“自动加载”时装配进墙；“每次询问 / 直接面板”先放入 pendingTiles，
  // 由打开时的确认（或显式加载）决定是否装配 —— 否则“暂不加载”会形同虚设。
  ctx.restoreWorkspace = () => {
    ctx.paintSlider(els.masterGain);
    try {
      let saved = storage.get(KEY, null);
      if (!saved || saved.schemaVersion !== 2) {
        const legacy = storage.get(LEGACY_KEY, null);
        if (legacy?.schemaVersion === 1) saved = migrateLegacyWorkspace(legacy);
      }
      if (saved && saved.schemaVersion === 2) {
        ctx.restoring = true;
        ctx.layoutMode = saved.layoutMode === "auto" || [1, 2, 3, 4].includes(saved.layoutMode) ? saved.layoutMode : 2;
        ctx.scheduler.capacity = CAPACITIES.includes(saved.capacity) ? saved.capacity : 8;
        ctx.hevc = saved.hevc === true;
        ctx.pauseOfficialEnabled = saved.pauseOfficial !== false;
        ctx.clockEnabled = saved.clock !== false;
        ctx.resumeMode = ["always", "never"].includes(saved.resumeMode) ? saved.resumeMode : "ask";
        ctx.audio = {
          mode: AUDIO_MODES.includes(saved.audio?.mode) ? saved.audio.mode : "mix",
          master: clamp01(saved.audio?.master, 0.5),
          followFocus: saved.audio?.followFocus === true,
          autoMute: saved.audio?.autoMute !== false
        };
        ctx.danmakuDefaults = normalizeDanmaku(saved.danmakuDefaults || {});
        ctx.liveAlerts = saved.liveAlerts !== false;
        ctx.liveAlertSound = saved.liveAlertSound === true;
        ctx.liveAutoPlay = saved.liveAutoPlay !== false;
        ctx.drawerPreference = saved.drawerVisible !== false;
        ctx.pendingTiles = (Array.isArray(saved.tiles) ? saved.tiles : []).slice(0, MAX_TILES);
      }
    } catch {
      ctx.log("", "工作区读取失败");
    } finally {
      ctx.restoring = false;
    }
    if (ctx.resumeMode === "always") ctx.loadPendingTiles(false);
    ctx.syncControlsFromState();
    ctx.handleDrawer(ctx.drawerPreference, { focus: false, remember: false });
    ctx.handleLayout();
    ctx.applyAudioAll();
    ctx.updateCount();
    ctx.log("", `就绪；MSE 直播=${ctx.mseLivePlayback}；主增益 × 每路音量；不会在打开前取流`);
  };
}
