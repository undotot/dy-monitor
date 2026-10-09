export const KEY = "douyu-monitor.workspace.v2";

export const LEGACY_KEY = "douyu-monitor.workspace.v1";

export const PRESET_KEY = "douyu-monitor.presets.v1";

export const HISTORY_KEY = "douyu-monitor.history.v1";

export const HOST_ID = "douyu-monitor-userscript";

export const SCRIPT_VERSION = typeof __VERSION__ === "string" ? __VERSION__ : "1.7.0-dev";

export const MAX_TILES = 16;

export const CAPACITIES = [4, 6, 8, 12, 16];

export const RATES = [[1, "流畅 · rate 1"], [2, "高清 · rate 2"], [3, "超清 · rate 3"], [0, "原画"], [4, "rate 4"], [8, "rate 8"]];

export const AUDIO_MODES = ["mix", "solo", "mute"];

export const clamp01 = (value, fallback = 1) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.min(1, Math.max(0, num)) : fallback;
};

export const safeMessage = (error) => String(error?.message || error).replace(/https?:\/\/\S+/g, "[地址已隐藏]").slice(0, 180);

export const API_BASE = "https://www.douyu.com";

export const DEFAULT_DID = "10000000000000000000000000001501";
