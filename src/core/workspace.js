import { clamp01 } from "./settings.js";
import { normalizeDanmaku } from "./danmaku-render.js";

// v1 工作区 → v2 纯迁移：布局列数→布局模式、主音量→主增益（默认 0.5）、自动静音归位。
export function migrateLegacyWorkspace(old) {
  return {
    schemaVersion: 2,
    layoutMode: [1, 2, 3, 4].includes(old.columns) ? old.columns : 2,
    capacity: old.capacity,
    hevc: old.hevc === true,
    pauseOfficial: old.pause !== false,
    clock: old.clock !== false,
    resumeMode: ["always", "never"].includes(old.resumeMode) ? old.resumeMode : "ask",
    audio: { mode: "mix", master: clamp01(old.masterVolume, 0.5), followFocus: false, autoMute: old.autoMute !== false },
    danmakuDefaults: normalizeDanmaku({}),
    liveAlerts: true, liveAlertSound: false, liveAutoPlay: true,
    drawerVisible: old.controlsVisible !== false,
    tiles: Array.isArray(old.tiles) ? old.tiles : []
  };
}
