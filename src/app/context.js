import { Scheduler } from "../core/scheduler.js";
import { normalizeDanmaku } from "../core/danmaku-render.js";

// 全局上下文：跨模块共享的状态与函数都挂在这一个对象上。
// 各 init 模块把函数挂到 ctx；模块间只经 ctx 互相调用，禁止隐式闭包耦合。
export function createContext() {
  return {
    // DOM（由 main.js 注入）
    host: null, wrapper: null, dialog: null, wall: null, appShell: null, emptyEl: null,
    els: {}, pageScrollLock: null,
    // 播放与画格
    tiles: new Map(),
    scheduler: new Scheduler(8),
    logs: [],
    // 上次保存但尚未装配进墙的房间（“暂不加载”后保留，下次询问前不装配）
    pendingTiles: null,
    // 运行时状态
    opened: false, focused: null, selectedId: null, previousFocus: null, pausedVideo: null,
    restoring: false, titleBeforeMonitor: null, dragSourceId: null,
    audio: { mode: "mix", master: 0.5, followFocus: false, autoMute: true },
    layoutMode: 2,
    hevc: false, pauseOfficialEnabled: true, resumeMode: "ask",
    liveAlerts: true, liveAlertSound: false, liveAutoPlay: true,
    danmakuDefaults: normalizeDanmaku({}),
    theme: "studio",
    drawerPreference: true, topbarCollapsed: false,
    cooldownUntil: 0, pipSession: null, pipOpening: false, toastTimer: 0,
    addState: {
      tab: "all", mode: "tab", query: "", rooms: [], selected: new Map(),
      generation: 0, controller: null, followRooms: null, probeController: null,
      replaceTileId: null, replaceController: null
    },
  };
}
