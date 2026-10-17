import { roomDisplayName } from "../core/room-name.js";
import { iconMarkup } from "../ui/icons.js";
import {
  bindRoomPanelActions,
  selectedTile,
  tileMeta,
  tileStatusKind,
  tileStatusText,
  canPiP,
  canFullscreen,
  isAppleTouch,
  removeTileWithUndo,
  runRoomAction,
  setTileVolume
} from "./room-commands.js";

const setActionIcon = (button, name) => {
  const holder = button?.querySelector(".ic");
  if (holder) holder.innerHTML = iconMarkup(name);
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

const setButtonLabel = (root, selector, text) => {
  const el = root.querySelector(selector);
  if (el) el.textContent = text;
};

const setPressed = (button, value) => {
  if (!button) return;
  button.classList.toggle("is-on", Boolean(value));
  button.setAttribute("aria-pressed", String(Boolean(value)));
};

const rateTextOf = (tile) => {
  if (!tile) return "—";
  const select = tile.root.querySelector("[data-t-rate]");
  const option = select?.options?.[select.selectedIndex];
  return option?.textContent || "—";
};

const syncRateSelect = (panel, tile) => {
  const select = panel.querySelector("[data-room-rate]");
  if (!select) return;
  const source = tile?.root?.querySelector("[data-t-rate]");
  if (source && source.innerHTML !== select.innerHTML) select.innerHTML = source.innerHTML;
  if (source) select.value = source.value;
  select.disabled = !tile;
};

const syncRoomPanel = (ctx, panel) => {
  const tile = selectedTile(ctx);
  panel.classList.toggle("is-empty", !tile);
  const name = tile ? roomDisplayName(tile) : "未选择房间";
  const meta = tileMeta(tile);
  const kind = tileStatusKind(tile);
  const status = tileStatusText(tile);
  const quality = rateTextOf(tile);
  panel.querySelectorAll("[data-room-name]").forEach((el) => { el.textContent = name; });
  panel.querySelectorAll("[data-room-meta]").forEach((el) => { el.textContent = meta; });
  panel.querySelectorAll("[data-room-avatar]").forEach((el) => { el.textContent = tile ? (name.slice(0, 1).toUpperCase() || "?") : "?"; });
  panel.querySelectorAll("[data-room-dot]").forEach((el) => { el.className = `dot ${kind}`; });
  panel.querySelectorAll("[data-room-status]").forEach((el) => { el.textContent = status; });
  panel.querySelectorAll("[data-room-quality]").forEach((el) => { el.textContent = quality; });

  const volume = panel.querySelector("[data-room-volume]");
  const pct = panel.querySelector("[data-room-volume-pct]");
  if (volume) {
    volume.value = tile ? String(tile.vol) : "0";
    volume.disabled = !tile;
  }
  if (pct) pct.textContent = `${Math.round((tile?.vol || 0) * 100)}%`;
  const hint = panel.querySelector("[data-room-volume-hint]");
  if (hint) hint.hidden = !tile || !isAppleTouch();

  const playLabel = !tile ? "播放" : (!tile.player || tile.video.paused) ? "播放" : "暂停";
  panel.querySelectorAll("[data-room-act='play']").forEach((btn) => {
    setActionIcon(btn, playLabel === "暂停" ? "pause" : "play");
    setButtonLabel(btn, "[data-room-play-label]", playLabel);
  });
  panel.querySelectorAll("[data-room-act='mute']").forEach((btn) => {
    setActionIcon(btn, tile?.muted ? "muted" : "volume");
    setButtonLabel(btn, "[data-room-mute-label]", tile?.muted ? "取消静音" : "静音");
    btn.classList.toggle("is-on", Boolean(tile?.muted));
  });
  const soloOn = Boolean(tile && ctx.audio.mode === "solo" && ctx.soloTargetId() === tile.id);
  panel.querySelectorAll("[data-room-act='solo']").forEach((btn) => setPressed(btn, soloOn));
  const focused = Boolean(tile && ctx.focused === tile.id);
  panel.querySelectorAll("[data-room-act='focus']").forEach((btn) => {
    setButtonLabel(btn, "[data-room-focus-label]", focused ? "恢复" : "放大");
    btn.classList.toggle("is-on", focused);
  });

  const dmState = panel.querySelector("[data-room-dm-state]");
  if (dmState) {
    dmState.textContent = tile?.danmaku.enabled ? "已开启" : "已关闭";
    dmState.classList.toggle("is-on", Boolean(tile?.danmaku.enabled));
  }
  const dmSummary = panel.querySelector("[data-room-dm-summary]");
  if (dmSummary) {
    if (!tile) dmSummary.textContent = "未选择房间";
    else if (!tile.danmaku.enabled) dmSummary.textContent = "已关闭 · 显示偏好保留";
    else dmSummary.textContent = `${tile.danmaku.mode === "sidebar" ? "弹幕栏" : "飘屏"} · ${Math.round(Number(tile.danmaku.area || 1) * 100)}% 屏 · ${tile.danmaku.scrollStyle === "simple" ? "简单" : "正常"}`;
  }
  syncRateSelect(panel, tile);

  panel.querySelectorAll("[data-room-act]").forEach((btn) => {
    btn.disabled = !tile;
  });
  panel.querySelectorAll("[data-capability='fullscreen']").forEach((btn) => { btn.hidden = !tile || !canFullscreen(tile); });
  panel.querySelectorAll("[data-capability='pip']").forEach((btn) => { btn.hidden = !tile || !canPiP(); });
};

const syncCommandBar = (ctx) => {
  const bar = ctx.wrapper.querySelector("[data-command-bar]");
  if (!bar) return;
  const tile = selectedTile(ctx);
  const empty = bar.querySelector("[data-cb-empty]");
  const selected = bar.querySelector("[data-cb-selected]");
  if (empty) empty.hidden = Boolean(tile);
  if (selected) selected.hidden = !tile;
  if (!tile) return;
  const name = roomDisplayName(tile);
  const status = tileStatusText(tile);
  const kind = tileStatusKind(tile);
  setButtonLabel(bar, "[data-cb-name]", name);
  setButtonLabel(bar, "[data-cb-status]", status);
  const dot = bar.querySelector("[data-cb-dot]");
  if (dot) dot.className = `dot ${kind}`;
  const playLabel = (!tile.player || tile.video.paused) ? "播放" : "暂停";
  bar.querySelectorAll("[data-cb-act='play']").forEach((btn) => {
    setActionIcon(btn, playLabel === "暂停" ? "pause" : "play");
    setButtonLabel(btn, "[data-cb-play-label]", playLabel);
  });
  bar.querySelectorAll("[data-cb-act='mute']").forEach((btn) => {
    setActionIcon(btn, tile.muted ? "muted" : "volume");
    setButtonLabel(btn, "[data-cb-mute-label]", tile.muted ? "取消静音" : "静音");
    btn.classList.toggle("is-on", tile.muted);
  });
  const soloOn = ctx.audio.mode === "solo" && ctx.soloTargetId() === tile.id;
  bar.querySelectorAll("[data-cb-act='solo']").forEach((btn) => setPressed(btn, soloOn));
  const focused = ctx.focused === tile.id;
  bar.querySelectorAll("[data-cb-act='focus']").forEach((btn) => {
    setButtonLabel(btn, "[data-cb-focus-label]", focused ? "恢复" : "放大");
    btn.classList.toggle("is-on", focused);
  });
  bar.querySelectorAll("[data-cb-act='danmaku']").forEach((btn) => setPressed(btn, tile.danmaku.enabled));
};

const syncLibrary = (ctx) => {
  const list = ctx.wrapper.querySelector("[data-insp-library]");
  if (!list) return;
  const tiles = [...ctx.tiles.values()];
  if (!tiles.length) {
    list.innerHTML = '<p class="library-empty">监控室是空的<br><span>点击上方“添加房间”开始</span></p>';
    return;
  }
  list.innerHTML = tiles.map((tile) => {
    const active = ctx.selectedId === tile.id;
    return `<button class="library-row${active ? " is-active" : ""}" type="button" data-insp-room-id="${tile.id}">
      <i class="dot ${tileStatusKind(tile)}"></i>
      <span class="library-row-copy"><b>${escapeHtml(roomDisplayName(tile))}</b><span>房间号 ${tile.rid}</span></span>
      <span class="library-row-state">${tileStatusText(tile)}</span>
    </button>`;
  }).join("");
};

export function initInspector(ctx) {
  ctx.removeTileWithUndo = (tile) => removeTileWithUndo(ctx, tile);
  ctx.renderRoomChrome = () => {
    const tile = selectedTile(ctx);
    if (!tile) ctx.showInspectorTab?.("library");
    ctx.wrapper.querySelectorAll("[data-room-panel]").forEach((panel) => syncRoomPanel(ctx, panel));
    syncCommandBar(ctx);
    syncLibrary(ctx);
    const focusedTile = ctx.focused ? ctx.tiles.get(ctx.focused) : null;
    const banner = ctx.wrapper.querySelector("[data-focus-banner]");
    if (banner) {
      banner.hidden = !focusedTile;
      const focusedName = banner.querySelector("[data-focus-name]");
      if (focusedName) focusedName.textContent = focusedTile ? roomDisplayName(focusedTile) : "";
    }
    const name = tile ? roomDisplayName(tile) : "当前房间";
    const status = tileStatusText(tile);
    const quality = rateTextOf(tile);
    ctx.wrapper.querySelectorAll("[data-sheet-name]").forEach((el) => { el.textContent = name; });
    ctx.wrapper.querySelectorAll("[data-sheet-status]").forEach((el) => { el.textContent = tile ? `${status} · ${quality}` : status; });
  };
  ctx.showInspectorTab = (tab) => {
    const next = tab === "library" ? "library" : "room";
    ctx.wrapper.querySelectorAll("[data-insp-tab]").forEach((button) => {
      const on = button.dataset.inspTab === next;
      button.classList.toggle("is-active", on);
      button.setAttribute("aria-selected", String(on));
    });
    ctx.wrapper.querySelectorAll("[data-insp-pane]").forEach((pane) => {
      pane.hidden = pane.dataset.inspPane !== next;
    });
  };
  ctx.setInspectorVisible = (visible) => {
    ctx.appShell.classList.toggle("is-inspector-collapsed", !visible);
    const toggle = ctx.wrapper.querySelector("[data-inspector-toggle]");
    if (toggle) toggle.setAttribute("aria-expanded", String(visible));
  };
  ctx.openRoomPanel = (tile) => {
    if (!tile) return;
    ctx.select(tile);
    const toggle = ctx.wrapper.querySelector("[data-inspector-toggle]");
    if (toggle) ctx.setInspectorVisible(true);
    ctx.showInspectorTab("room");
    const inspector = ctx.wrapper.querySelector("[data-inspector]");
    inspector?.querySelector("[data-insp-tab='room']")?.focus?.({ preventScroll: true });
  };
  let sheetTrigger = null;
  ctx.openRoomSheet = (tile, trigger = null) => {
    if (!tile) return;
    ctx.select(tile);
    sheetTrigger = trigger || ctx.wrapper.querySelector("[data-cb-act='more']");
    const sheet = ctx.wrapper.querySelector("[data-room-sheet]");
    const backdrop = ctx.wrapper.querySelector("[data-room-sheet-backdrop]");
    if (sheet) sheet.hidden = false;
    if (backdrop) backdrop.hidden = false;
    ctx.renderRoomChrome();
    sheet?.querySelector("[data-room-sheet-close]")?.focus?.({ preventScroll: true });
  };
  ctx.closeRoomSheet = () => {
    const sheet = ctx.wrapper.querySelector("[data-room-sheet]");
    const backdrop = ctx.wrapper.querySelector("[data-room-sheet-backdrop]");
    if (sheet) sheet.hidden = true;
    if (backdrop) backdrop.hidden = true;
    sheetTrigger?.focus?.({ preventScroll: true });
    sheetTrigger = null;
  };
  ctx.openRoomFromTile = (tile) => {
    const compact = (() => {
      try { return ctx.wrapper.ownerDocument.defaultView.matchMedia("(max-width: 1100px)").matches; } catch { return false; }
    })();
    if (compact) ctx.openRoomSheet(tile);
    else ctx.openRoomPanel(tile);
  };

  const inspector = ctx.wrapper.querySelector("[data-inspector]");
  bindRoomPanelActions(ctx, inspector);
  bindRoomPanelActions(ctx, ctx.wrapper.querySelector("[data-room-sheet]"));
  bindRoomPanelActions(ctx, ctx.wrapper.querySelector("[data-command-bar]"));

  ctx.wrapper.querySelectorAll("[data-insp-tab]").forEach((button) => {
    button.addEventListener("click", () => ctx.showInspectorTab(button.dataset.inspTab));
  });
  ctx.wrapper.querySelector("[data-inspector-close]")?.addEventListener("click", () => {
    ctx.setInspectorVisible(false);
    ctx.wrapper.querySelector("[data-inspector-toggle]")?.focus?.({ preventScroll: true });
  });
  ctx.wrapper.querySelector("[data-inspector-toggle]")?.addEventListener("click", () => {
    const visible = ctx.appShell.classList.contains("is-inspector-collapsed");
    ctx.setInspectorVisible(visible);
  });
  ctx.wrapper.querySelector("[data-insp-add]")?.addEventListener("click", () => ctx.openAdd());
  ctx.wrapper.querySelector("[data-focus-exit]")?.addEventListener("click", () => ctx.setFocus(null));
  ctx.wrapper.querySelector("[data-cb-add]")?.addEventListener("click", () => ctx.openAdd());
  ctx.wrapper.querySelector("[data-insp-library]")?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-insp-room-id]");
    if (!row) return;
    const tile = ctx.tiles.get(row.dataset.inspRoomId);
    if (tile) ctx.select(tile);
  });
  ctx.wrapper.querySelectorAll("[data-room-sheet-close]").forEach((el) => {
    el.addEventListener("click", () => ctx.closeRoomSheet());
  });

  const bar = ctx.wrapper.querySelector("[data-command-bar]");
  bar?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-cb-act]");
    if (!button) return;
    const tile = selectedTile(ctx);
    if (!tile) return;
    const action = button.dataset.cbAct;
    if (action === "more") {
      ctx.openRoomSheet(tile, button);
      return;
    }
    if (action === "danmaku") {
      runRoomAction(ctx, tile, "dm-toggle");
      return;
    }
    runRoomAction(ctx, tile, action);
  });

  ctx.renderRoomChrome();
}
