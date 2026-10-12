import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { initLayout } from "../src/app/layout.js";
import { clearTileGeometry } from "../src/ui/tile-geometry.js";

test("聚焦、画中画占位与平铺复用原节点并恢复位置和顺序", () => {
  const win = new Window();
  try {
    const wall = win.document.createElement("main");
    win.document.body.append(wall);
    Object.defineProperties(wall, { clientWidth: { value: 1280 }, clientHeight: { value: 720 } });
    // 浏览器可能提供小数尺寸，不能用取整后的 clientHeight 计算超出可视区的画格。
    wall.getBoundingClientRect = () => ({ width: 1280, height: 719.5 });
    const tiles = new Map();
    for (let index = 0; index < 8; index++) {
      const root = win.document.createElement("article");
      const video = win.document.createElement("video");
      root.append(video);
      wall.append(root);
      tiles.set(String(index), { id: String(index), root, video });
    }
    const ctx = { wall, tiles, wrapper: win.document.body, els: {}, layoutMode: 2, applyAudioAll: () => {} };
    initLayout(ctx);
    ctx.setFocus("0");
    assert.ok(Math.abs(ctx.focusLayout.main.height + ctx.focusLayout.bottomHeight + ctx.focusLayout.gap - 719.5) < 1e-7);
    const mainTile = tiles.get("0");
    const root = mainTile.root;
    const video = mainTile.video;
    const initialPlan = ctx.focusLayout;
    // 主视频从横屏改成竖屏，也不能挤占按小视频比例分配的区域。
    Object.defineProperties(video, { videoWidth: { value: 900 }, videoHeight: { value: 1600 } });
    ctx.handleLayout();
    assert.deepEqual(ctx.focusLayout.main, initialPlan.main);
    assert.deepEqual(ctx.focusLayout.placements, initialPlan.placements);
    assert.ok(Math.abs(ctx.focusLayout.mainVideo.width / ctx.focusLayout.mainVideo.height - 900 / 1600) < 1e-7);
    assert.ok(ctx.focusLayout.mainVideo.width <= ctx.focusLayout.main.width);
    assert.equal(root.parentElement, wall);
    assert.equal(root.style.gridColumn, "1");
    const placeholder = win.document.createElement("div");
    root.replaceWith(placeholder);
    const pipContainer = win.document.createElement("div");
    win.document.body.append(pipContainer);
    pipContainer.append(root);
    clearTileGeometry(root);
    ctx.pipSession = { tile: mainTile, placeholder };
    ctx.handleLayout();
    assert.equal(placeholder.style.gridColumn, "1");
    assert.equal(root.parentElement, pipContainer);
    assert.equal(root.style.width, "");
    ctx.setFocus("1");
    assert.notEqual(placeholder.parentElement, wall);
    assert.equal(root.parentElement, pipContainer);
    placeholder.replaceWith(root);
    ctx.pipSession = null;
    ctx.handleLayout();
    assert.equal(mainTile.video, video);
    assert.notEqual(root.parentElement, pipContainer);
    ctx.setFocus(null);
    assert.ok([...tiles.values()].every((tile) => tile.root.parentElement === wall && !tile.root.style.width && !tile.root.style.position));
    assert.deepEqual([...wall.children].filter((child) => [...tiles.values()].some((tile) => tile.root === child)), [...tiles.values()].map((tile) => tile.root));
  } finally { win.close(); }
});
