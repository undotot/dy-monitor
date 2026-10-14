import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { tileMarkup } from "../src/ui/tile-markup.js";
import { shellMarkup } from "../src/ui/shell-markup.js";
import { DanmakuRenderer, normalizeDanmaku } from "../src/core/danmaku-render.js";
import { bindTileDanmaku, syncDanmakuFields } from "../src/app/tile-danmaku.js";
import { bindGlobalDanmaku } from "../src/app/global-danmaku.js";

const createControls = (win) => {
  const wrapper = win.document.createElement("div");
  wrapper.innerHTML = shellMarkup();
  const ctx = {
    wrapper, tiles: new Map(), danmakuDefaults: normalizeDanmaku({}), saves: 0, reconnects: 0,
    save: () => { ctx.saves++; }, updateTileChrome: () => {},
    handleDanmaku: (tile) => { ctx.reconnects++; tile.renderer.update(tile.danmaku); }
  };
  for (const [id, enabled] of [["a", true], ["b", false]]) {
    const root = win.document.createElement("article");
    root.className = "tile-shell";
    root.innerHTML = tileMarkup();
    const tile = { id, root, player: {}, danmaku: normalizeDanmaku({ enabled, blockedWords: ["广告"], size: 18 }), renderer: { update() {} } };
    ctx.tiles.set(id, tile);
    bindTileDanmaku(ctx, tile);
    syncDanmakuFields(ctx, tile);
  }
  bindGlobalDanmaku(ctx);
  return ctx;
};

test("单房仅三类控制，模式切换不重连且侧栏无版式设置", () => {
  const win = new Window();
  try {
    const ctx = createControls(win);
    const tile = ctx.tiles.get("a");
    assert.equal(tile.root.querySelectorAll("[data-dm-choice]").length, 4);
    assert.equal(tile.root.querySelector("[data-dm-blocked]"), null);
    assert.equal(tile.root.querySelector("[data-dm-size]"), null);
    tile.root.querySelector('[data-dm-choice="style"][data-value="normal"]').click();
    tile.root.querySelector('[data-dm-choice="mode"][data-value="sidebar"]').click();
    assert.equal(tile.danmaku.enabled, true);
    assert.equal(tile.danmaku.mode, "sidebar");
    assert.equal(tile.root.querySelector("[data-dm-style-wrap]").hidden, true);
    tile.root.querySelector('[data-dm-choice="mode"][data-value="scroll"]').click();
    assert.equal(tile.danmaku.scrollStyle, "normal");
    assert.equal(ctx.reconnects, 0);
    tile.root.querySelector("[data-dm-toggle]").click();
    assert.equal(tile.danmaku.enabled, false);
    tile.root.querySelector("[data-t-danmaku]").click();
    assert.equal(tile.danmaku.enabled, true);
    assert.equal(ctx.reconnects, 2);
    assert.deepEqual(tile.danmaku.blockedWords, ["广告"]);
  } finally { win.close(); }
});

test("全局即时同步显示字段，保留单房开关与过滤偏好并反馈混合状态", () => {
  const win = new Window();
  try {
    const ctx = createControls(win);
    const section = ctx.wrapper.querySelector("[data-dm-global]");
    section.querySelector('[data-dm-global-choice="mode"][data-value="sidebar"]').click();
    assert.equal(ctx.tiles.get("a").danmaku.enabled, true);
    assert.equal(ctx.tiles.get("b").danmaku.enabled, false);
    assert.equal(ctx.reconnects, 0);
    for (const tile of ctx.tiles.values()) {
      assert.equal(tile.danmaku.mode, "sidebar");
      assert.deepEqual(tile.danmaku.blockedWords, ["广告"]);
      assert.equal(tile.danmaku.size, 18);
    }
    ctx.tiles.get("a").root.querySelector('[data-dm-choice="mode"][data-value="scroll"]').click();
    for (const button of section.querySelectorAll('[data-dm-global-choice="mode"]')) assert.equal(button.getAttribute("aria-pressed"), "false");
    assert.equal(section.querySelector("[data-dm-defaults-style-wrap]").hidden, false);
    section.querySelector("[data-dm-global-toggle]").click();
    assert.equal(ctx.reconnects, 1);
    assert.ok([...ctx.tiles.values()].every((tile) => tile.danmaku.enabled));
    section.querySelector("[data-dm-global-toggle]").click();
    assert.equal(ctx.reconnects, 3);
    assert.ok([...ctx.tiles.values()].every((tile) => !tile.danmaku.enabled));
    ctx.tiles.clear();
    ctx.syncGlobalDanmakuActions();
    assert.equal(section.querySelector("[data-dm-global-toggle]").disabled, true);
  } finally { win.close(); }
});

test("弹幕栏是视频视口的兄弟节点，互斥切换和关闭完整恢复布局", () => {
  const win = new Window();
  try {
    const root = win.document.createElement("article");
    root.className = "tile-shell";
    root.innerHTML = tileMarkup();
    const viewport = root.querySelector(".tile-viewport");
    const sidebar = root.querySelector("[data-dm-sidebar]");
    assert.equal(sidebar.parentElement, root);
    for (const selector of ["video", "[data-audio-corner]", "[data-tools]", "[data-tile-settings]"]) assert.ok(viewport.contains(root.querySelector(selector)));
    const renderer = new DanmakuRenderer(root.querySelector("canvas"), normalizeDanmaku({ enabled: true, mode: "sidebar" }), { stageEl: root.querySelector("[data-dm-stage]"), sidebarEl: sidebar, sidebarListEl: root.querySelector("[data-dm-sb-list]") });
    assert.equal(root.classList.contains("dm-sidebar-open"), true);
    assert.equal(renderer.stageEl.hidden, true);
    renderer.update({ mode: "scroll" });
    assert.equal(root.classList.contains("dm-sidebar-open"), false);
    assert.equal(sidebar.hidden, true);
    renderer.update({ mode: "sidebar" });
    renderer.frame = true;
    renderer.add({ nn: "用户", txt: "<img src=x onerror=alert(1)>" });
    assert.equal(renderer.sidebarListEl.children.length, 1);
    assert.equal(renderer.sidebarListEl.querySelector("img"), null);
    assert.equal(sidebar.querySelector("[data-dm-sb-empty]").hidden, true);
    renderer.stop();
    assert.equal(root.classList.contains("dm-sidebar-open"), false);
    assert.equal(sidebar.hidden, true);
    assert.equal(renderer.sidebarListEl.children.length, 0);
    assert.equal(sidebar.querySelector("[data-dm-sb-empty]").hidden, false);
  } finally { win.close(); }
});
