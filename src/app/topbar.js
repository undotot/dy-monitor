import { clamp01 } from "../core/settings.js";

// 顶部栏：品牌/计数/健康 + 布局、声音浮层 + 添加 + 更多 + 收起。
export function initTopbar(ctx) {
  const els = ctx.els;
  const query = (selector) => ctx.wrapper.querySelector(selector);
  const queryAll = (selector) => [...ctx.wrapper.querySelectorAll(selector)];

  const topbar = query("[data-topbar]");
  const collapseButton = query("[data-topbar-collapse]");
  const expandButton = query("[data-topbar-expand]");
  const moreButton = query("[data-more-open]");
  const moreMenu = query("[data-more-menu]");
  const miniCount = query("[data-mini-count]");

  const closePopovers = (except = null) => {
    for (const panel of queryAll("[data-pop-panel]")) {
      if (panel === except) continue;
      panel.hidden = true;
    }
    for (const button of queryAll("[data-pop]")) {
      if (except && button.parentElement?.contains(except)) continue;
      button.setAttribute("aria-expanded", "false");
    }
  };
  const closeMore = () => {
    if (moreMenu) moreMenu.hidden = true;
    moreButton?.setAttribute("aria-expanded", "false");
  };
  const closeAllMenus = () => { closePopovers(); closeMore(); };

  ctx.syncMiniCount = () => {
    if (!miniCount) return;
    const count = query("[data-count]")?.textContent || "";
    miniCount.textContent = count;
  };
  ctx.syncTopbar = () => {
    const collapsed = ctx.topbarCollapsed;
    ctx.appShell.classList.toggle("is-topbar-collapsed", collapsed);
    topbar.inert = collapsed;
    topbar.setAttribute("aria-hidden", String(collapsed));
    collapseButton.hidden = collapsed;
    expandButton.hidden = !collapsed;
    collapseButton.setAttribute("aria-expanded", String(!collapsed));
    collapseButton.setAttribute("aria-controls", topbar.id);
    if (collapsed) closeAllMenus();
    ctx.syncMiniCount?.();
    ctx.scheduleLayout();
  };
  const handleTopbar = (collapsed) => {
    ctx.topbarCollapsed = collapsed;
    ctx.syncTopbar();
    (collapsed ? expandButton : collapseButton).focus();
    ctx.save();
  };
  collapseButton.addEventListener("click", () => handleTopbar(true));
  expandButton.addEventListener("click", () => handleTopbar(false));
  // 边缘悬停仍是桌面快捷方式；显式按钮始终可用，触屏不依赖悬停。
  ctx.appShell.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || !ctx.opened) return;
    const rect = ctx.appShell.getBoundingClientRect();
    const distance = event.clientY - rect.top;
    const nearCenter = Math.abs(event.clientX - (rect.left + rect.width / 2)) <= 88;
    ctx.appShell.classList.toggle("topbar-near", nearCenter && distance >= 0 && distance <= 56);
  }, { passive: true });
  ctx.appShell.addEventListener("pointerleave", () => ctx.appShell.classList.remove("topbar-near"));
  query("[data-topbar-slot]").addEventListener("transitionend", () => ctx.scheduleLayout());
  ctx.syncTopbar();

  /* --- 浮层：布局 / 声音 --- */
  for (const button of queryAll("[data-pop]")) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const name = button.dataset.pop;
      const panel = query(`[data-pop-panel="${name}"]`);
      if (!panel) return;
      const next = panel.hidden;
      closePopovers(panel);
      closeMore();
      panel.hidden = !next;
      button.setAttribute("aria-expanded", String(next));
    });
  }
  for (const panel of queryAll("[data-pop-panel]")) {
    panel.addEventListener("pointerdown", (event) => event.stopPropagation());
  }
  for (const button of queryAll("[data-more-open]")) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!moreMenu) return;
      const next = moreMenu.hidden;
      closePopovers();
      moreMenu.hidden = !next;
      button.setAttribute("aria-expanded", String(next));
    });
  }
  moreMenu?.addEventListener("pointerdown", (event) => event.stopPropagation());
  moreMenu?.addEventListener("click", (event) => {
    if (event.target.closest("button")) closeMore();
  });
  ctx.wrapper.ownerDocument.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".tb-pop-wrap")) closePopovers();
    if (!event.target.closest(".tb-more-wrap")) closeMore();
  });

  /* --- 布局与声音控件 --- */
  els.audioMode.addEventListener("change", () => ctx.setAudioMode(els.audioMode.value));
  els.masterGain.addEventListener("input", (event) => {
    ctx.audio.master = clamp01(event.target.value, ctx.audio.master);
    ctx.paintSlider(event.target);
    els.masterPct.textContent = `${Math.round(ctx.audio.master * 100)}%`;
    ctx.applyAudioAll();
  });
  els.masterGain.addEventListener("change", () => ctx.save());
  for (const input of ctx.wrapper.querySelectorAll("[name=layout-preset]")) input.addEventListener("change", () => {
    ctx.layoutMode = input.value === "auto" ? "auto" : Number(input.value);
    ctx.handleLayout();
    ctx.save();
  });

  /* --- 更多菜单 --- */
  query("[data-start-all]")?.addEventListener("click", () => {
    for (const tile of ctx.tiles.values()) if (!["playing", "connecting", "signing", "queued", "probing", "reconnecting"].includes(tile.state)) void ctx.handleStart(tile);
  });
  query("[data-stop-all]")?.addEventListener("click", () => {
    for (const tile of ctx.tiles.values()) ctx.stop(tile);
  });
  query("[data-dm-global-open]")?.addEventListener("click", () => {
    ctx.handleDrawer(true, { focus: false });
    ctx.showDrawerTab?.("danmaku");
    ctx.syncDrawerDanmaku?.();
  });
  query("[data-settings-open]")?.addEventListener("click", () => {
    ctx.handleDrawer(true);
    ctx.showDrawerTab?.("play");
  });
  query("[data-exit]")?.addEventListener("click", () => {
    closeAllMenus();
    ctx.showExitConfirm();
  });
}
