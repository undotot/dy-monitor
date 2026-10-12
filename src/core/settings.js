export const KEY = "douyu-monitor.workspace.v2";

export const LEGACY_KEY = "douyu-monitor.workspace.v1";

export const PRESET_KEY = "douyu-monitor.presets.v1";

export const HISTORY_KEY = "douyu-monitor.history.v1";

export const DEFAULT_THEME = "studio";

export const THEMES = ["studio", "titanium", "stealth"];

const LEGACY_THEME_MAP = {
  cyber: "studio",
  glass: "titanium"
};

export const normalizeTheme = (theme) => {
  const mapped = LEGACY_THEME_MAP[theme] || theme;
  return THEMES.includes(mapped) ? mapped : DEFAULT_THEME;
};

export const CLIENT_DID_KEY = "douyu-monitor.client-did.v1";

export const HOST_ID = "douyu-monitor-userscript";

export const SCRIPT_VERSION = typeof __VERSION__ === "string" ? __VERSION__ : "1.7.0-dev";

export const MAX_TILES = 16;

export const CAPACITIES = [4, 6, 8, 12, 16];

export const RATES = [
  [0, "原画"],
  [8, "蓝光 8M"],
  [4, "蓝光 4M"],
  [3, "超清"],
  [2, "高清"],
  [1, "流畅"]
];

export function parseMultirates(rawList) {
  if (!Array.isArray(rawList) || rawList.length === 0) return null;
  const list = [];
  for (const item of rawList) {
    if (!item) continue;
    const type = item.type != null ? Number(item.type) : (item.rate != null ? Number(item.rate) : null);
    if (type == null || !Number.isFinite(type)) continue;
    const name = String(item.name || "").trim() || (RATES.find(([r]) => r === type)?.[1] ?? `清晰度 ${type}`);
    list.push({ rate: type, name });
  }
  return list.length > 0 ? list : null;
}

export const AUDIO_MODES = ["mix", "solo", "mute"];

export const clamp01 = (value, fallback = 1) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.min(1, Math.max(0, num)) : fallback;
};

export const safeMessage = (error) => String(error?.message || error).replace(/https?:\/\/\S+/g, "[地址已隐藏]").slice(0, 180);

export const API_BASE = "https://www.douyu.com";

export const DEFAULT_DID = "10000000000000000000000000001501";

export const UPDATE_META_URL = "https://raw.githubusercontent.com/undotot/monitor-js/main/douyu-monitor.meta.js";

export const UPDATE_META_FALLBACK_URLS = [
  "https://raw.githubusercontent.com/undotot/monitor-js/main/douyu-monitor.meta.js",
  "https://cdn.jsdelivr.net/gh/undotot/monitor-js@main/douyu-monitor.meta.js",
  "https://fastly.jsdelivr.net/gh/undotot/monitor-js@main/douyu-monitor.meta.js"
];

export const DOWNLOAD_USER_URL = "https://raw.githubusercontent.com/undotot/monitor-js/main/douyu-monitor.user.js";
