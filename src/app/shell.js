import { THEMES, DEFAULT_THEME, normalizeTheme } from "../core/settings.js";
import { onUrlChange, isFollowPage } from "../platform/router.js";

// 打开 / 关闭生命周期：官方播放器暂停与恢复、继续播放提示、入口按钮定位、页面事件与菜单命令。
export function initShell(ctx) {
  const els = ctx.els;
  const query = (selector) => ctx.wrapper.querySelector(selector);

  ctx.setTheme = (theme) => {
    const valid = normalizeTheme(theme);
    ctx.theme = valid;
    ctx.dialog?.setAttribute("data-theme", valid);
    ctx.wrapper?.setAttribute("data-theme", valid);
    for (const el of ctx.wrapper?.querySelectorAll("[name=theme-choice]") || []) {
      el.checked = el.value === valid;
    }
  };

  ctx.pauseOfficial = () => {
    if (ctx.pausedVideo || !ctx.pauseOfficialEnabled) return;
    const candidates = [...document.querySelectorAll("video")].filter((video) => !video.paused && video.getBoundingClientRect().width > 100);
    candidates.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height);
    ctx.pausedVideo = candidates[0] || null;
    ctx.pausedVideo?.pause();
  };

  ctx.hideResumePrompt = () => {
    els.resume.hidden = true;
  };

  const showResumePrompt = () => {
    const pending = !ctx.tiles.size && (ctx.pendingTiles?.length || 0) > 0;
    const count = pending ? ctx.pendingTiles.length : ctx.tiles.size;
    query("[data-resume-title]").textContent = pending ? "是否加载上次的直播间？" : "是否加载并播放当前的房间？";
    query("[data-resume-detail]").textContent = pending ? `共 ${count} 个房间，来自上次保存的监控室` : `共 ${count} 个房间已就绪`;
    query("[data-resume-yes]").textContent = pending ? "加载上次直播间" : "全部播放";
    query("[data-resume-no]").textContent = "暂不加载";
    els.resume.hidden = false;
  };

  ctx.handleClose = () => {
    if (!ctx.opened) return;
    ctx.closeContextMenu();
    ctx.closeAdd();
    ctx.closeRoomSheet?.();
    ctx.exitReorder?.();
    const exitPrompt = ctx.wrapper.querySelector("[data-exit-prompt]");
    if (exitPrompt) exitPrompt.hidden = true;
    ctx.hideToast();
    for (const tile of ctx.tiles.values()) void tile.exitFullscreen?.();
    ctx.handleClosePip();
    ctx.opened = false;
    ctx.focused = null;
    ctx.hideResumePrompt();
    if (ctx.titleBeforeMonitor !== null) {
      document.title = ctx.titleBeforeMonitor;
      ctx.titleBeforeMonitor = null;
    }
    for (const tile of ctx.tiles.values()) ctx.stop(tile);
    ctx.save();
    ctx.handleDrawer(false, { focus: false, remember: false });
    ctx.dialog.close();
    ctx.pageScrollLock.unlock();
    query("[data-entry]").hidden = false;
    const video = ctx.pausedVideo;
    ctx.pausedVideo = null;
    if (video?.isConnected) void video.play().catch(() => ctx.log("", "官方视频未能自动恢复，请手动点击播放"));
    ctx.previousFocus?.focus?.();
  };

  ctx.handleOpen = () => {
    if (ctx.opened) return;
    ctx.previousFocus = document.activeElement;
    ctx.pageScrollLock.lock();
    try {
      ctx.dialog.showModal();
    } catch {
      ctx.pageScrollLock.unlock();
      ctx.showToast("无法打开面板，请刷新页面重试", [], 6e3);
      return;
    }
    ctx.opened = true;
    ctx.titleBeforeMonitor = document.title;
    document.title = "监控室";
    query("[data-entry]").hidden = true;
    ctx.handleDrawer(false, { focus: false, remember: false });
    ctx.pauseOfficial();
    const pending = !ctx.tiles.size && (ctx.pendingTiles?.length || 0) > 0;
    if (pending) {
      // 上次保存的房间尚未装配：只有确认加载才进墙，“暂不加载”保持空墙。
      if (ctx.resumeMode === "always") ctx.loadPendingTiles(true);
      else if (ctx.resumeMode === "never") ctx.openAdd();
      else showResumePrompt();
    } else if (ctx.tiles.size > 0) {
      if (ctx.resumeMode === "always") {
        for (const tile of ctx.tiles.values()) void ctx.handleStart(tile);
      } else if (ctx.resumeMode === "never") ctx.handleDrawer(true);
      else showResumePrompt();
    }
  };

  query("[data-entry]").addEventListener("click", ctx.handleOpen);
  ctx.dialog.addEventListener("close", ctx.handleClose);
  ctx.dialog.addEventListener("cancel", (event) => {
    // 快捷键与 Esc 分层后退已暂时移除：拦住原生 Esc 关对话框，退出只走“退出监看”确认。
    event.preventDefault();
  });
  query("[data-resume-yes]").addEventListener("click", () => {
    if (query("[data-resume-remember]").checked) {
      ctx.resumeMode = "always";
      ctx.syncControlsFromState();
      ctx.save();
    }
    ctx.hideResumePrompt();
    if (ctx.pendingTiles?.length && !ctx.tiles.size) {
      ctx.loadPendingTiles(true);
    } else {
      for (const tile of ctx.tiles.values()) void ctx.handleStart(tile);
    }
  });
  query("[data-resume-no]").addEventListener("click", () => {
    if (query("[data-resume-remember]").checked) {
      ctx.resumeMode = "never";
      ctx.syncControlsFromState();
      ctx.save();
    }
    ctx.hideResumePrompt();
    // “暂不加载”后墙上不能残留房间：已装配的画格整体收回待加载，配置保留，下次打开再问。
    if (ctx.tiles.size) ctx.parkAllTiles();
    ctx.showToast?.("已保留上次布局；点击“添加房间”或重新打开监控室即可恢复。", [], 5e3);
  });

  /* --- 入口按钮定位 --- */
  const entry = query("[data-entry]");
  let entryTitle = null, entryFrame = 0;
  const onFollowPage = () => isFollowPage();
  const positionEntry = () => {
    entryFrame = 0;
    if (!onFollowPage()) {
      if (ctx.opened) ctx.handleClose();
      entry.hidden = true;
      return;
    }
    entry.hidden = ctx.opened;
    if (ctx.opened) return;
    if (!entryTitle?.isConnected) entryTitle = [...document.querySelectorAll("h1, h2, h3, [class*='Title'], [class*='title']")].find((el) => el.textContent.trim() === "我的关注" && el.getBoundingClientRect().width > 0) || null;
    const rect = entryTitle?.getBoundingClientRect();
    if (rect && rect.right + 168 < window.innerWidth) {
      entry.style.left = rect.right + 20 + "px";
      entry.style.right = "auto";
      entry.style.top = Math.max(76, rect.top + (rect.height - 38) / 2) + "px";
    } else {
      entry.style.left = "auto";
      entry.style.right = "20px";
      entry.style.top = "80px";
    }
  };
  const scheduleEntry = () => {
    if (!entryFrame) entryFrame = requestAnimationFrame(positionEntry);
  };
  ctx.scheduleEntry = scheduleEntry;
  window.addEventListener("resize", scheduleEntry);
  window.addEventListener("scroll", scheduleEntry, { passive: true, capture: true });
  const ensureHost = () => {
    const parent = document.body || document.documentElement;
    if (parent && !ctx.host.isConnected) parent.append(ctx.host);
    scheduleEntry();
  };
  ctx.ensureHost = ensureHost;
  scheduleEntry();
  onUrlChange(ensureHost);
  const observer = new MutationObserver(ensureHost);
  const observeTarget = document.body || document.documentElement;
  if (observeTarget) observer.observe(observeTarget, { childList: true });
  try {
    GM_registerMenuCommand("打开监控室", ctx.handleOpen);
    GM_registerMenuCommand("添加房间", () => {
      ctx.handleOpen();
      if (ctx.opened) ctx.openAdd();
    });
  } catch {
  }
  window.addEventListener("pagehide", () => {
    ctx.pageScrollLock.unlock();
    ctx.handleClosePip();
    ctx.opened = false;
    ctx.pausedVideo = null;
    for (const tile of ctx.tiles.values()) ctx.stop(tile);
    els.drawer.hidden = true;
    query("[data-entry]").hidden = true;
    if (ctx.dialog.open) ctx.dialog.close();
  });
}
