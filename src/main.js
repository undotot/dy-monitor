import mpegts from "mpegts.js";
import { API_BASE, HOST_ID, SCRIPT_VERSION } from "./core/settings.js";
import { createPageScrollLock } from "./platform/scroll-lock.js";
import { shellMarkup } from "./ui/shell-markup.js";
import { iconMarkup } from "./ui/icons.js";
import MONITOR_CSS from "./ui/styles.css";
import { createContext } from "./app/context.js";
import { initDom } from "./app/dom.js";
import { initAudio } from "./app/audio.js";
import { initLayout } from "./app/layout.js";
import { initStatus } from "./app/status.js";
import { initStream } from "./playback/stream.js";
import { initPlayback } from "./playback/playback.js";
import { initPip } from "./playback/pip.js";
import { initTile } from "./app/tile.js";
import { initContextMenu } from "./app/context-menu.js";
import { initAddPanel } from "./app/add-panel.js";
import { initDrawer } from "./app/drawer.js";
import { initPersistence } from "./app/persistence.js";
import { initKeyboard } from "./app/keyboard.js";
import { initTopbar } from "./app/topbar.js";
import { initShell } from "./app/shell.js";
import { initLiveWatcher } from "./app/live-watcher.js";

const bootstrap = () => {
  if (window.top !== window.self || location.origin !== API_BASE) return;
  if (location.pathname.replace(/\/+$/, "") !== "/directory/myFollow") {
    window.addEventListener("urlchange", () => {
      if (location.pathname.replace(/\/+$/, "") === "/directory/myFollow" && !document.getElementById(HOST_ID)) bootstrap();
    });
    return;
  }
  const existingHost = document.getElementById(HOST_ID);
  if (existingHost) {
    if (existingHost.dataset.monitorVersion !== SCRIPT_VERSION) {
      alert(`监控室 ${SCRIPT_VERSION} 检测到旧版或另一份脚本正在运行。请停用其他监控室脚本，再刷新斗鱼页面。`);
    }
    return;
  }
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.dataset.monitorVersion = SCRIPT_VERSION;
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = MONITOR_CSS;
  shadow.append(style);
  document.documentElement.append(host);
  const wrapper = document.createElement("div");
  wrapper.className = "monitor-root";
  shadow.append(wrapper);
  wrapper.innerHTML = shellMarkup();

  const query = (selector) => wrapper.querySelector(selector);
  const dialog = query("[data-dialog]"), wall = query("[data-wall]"), appShell = query(".app-shell");
  const els = {
    wall,
    count: query("[data-count]"), health: query("[data-health]"),
    drawer: query("[data-drawer]"), controlsButton: query("[data-controls-toggle]"),
    addPanel: query("[data-add-panel]"), addList: query("[data-add-list]"), addStatus: query("[data-add-status]"),
    addSearch: query("[data-add-search]"), defaultRate: query("[data-default-rate]"),
    ctx: query("[data-ctx]"), toast: query("[data-toast]"), toastText: query("[data-toast-text]"), toastActions: query("[data-toast-actions]"),
    resume: query("[data-resume-prompt]"),
    logs: query("[data-logs]"), logCount: query("[data-log-count]"),
    masterGain: query("[data-master-gain]"), masterPct: query("[data-master-pct]"), audioMode: query("[data-audio-mode]"),
  };
  const pageScrollLock = createPageScrollLock(document);
  const emptyEl = document.createElement("div");
  emptyEl.className = "empty";
  emptyEl.innerHTML = `<div>${iconMarkup("grid")}<div style="margin-top:10px">监控室是空的<br>点击右上角“添加房间”开始</div></div>`;
  wall.append(emptyEl);

  const ctx = createContext();
  Object.assign(ctx, { host, wrapper, dialog, wall, appShell, els, emptyEl, pageScrollLock });
  ctx.mseLivePlayback = Boolean(mpegts.getFeatureList?.().mseLivePlayback);

  initDom(ctx);
  initAudio(ctx);
  initLayout(ctx);
  initStatus(ctx);
  initStream(ctx);
  initPlayback(ctx);
  initPip(ctx);
  initTile(ctx);
  initContextMenu(ctx);
  initAddPanel(ctx);
  initDrawer(ctx);
  initPersistence(ctx);
  initKeyboard(ctx);
  initTopbar(ctx);
  initShell(ctx);
  initLiveWatcher(ctx);

  ctx.restoreWorkspace();
};

bootstrap();
