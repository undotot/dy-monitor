import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { initLayout } from "../src/app/layout.js";
import { clearTileGeometry } from "../src/ui/tile-geometry.js";
import { calculateUniformFocusLayout } from "../src/core/focus-uniform-layout.js";

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
    assert.ok(Math.abs(ctx.focusLayout.main.height + ctx.focusLayout.bottomHeight + (ctx.focusLayout.gapY ?? ctx.focusLayout.gap) - 719.5) < 1e-4);
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

test("左右下围绕布局复用媒体与画中画占位，恢复平铺清理绝对坐标", () => {
  const win=new Window();
  try {
    const wall=win.document.createElement("main");
    win.document.body.append(wall);
    wall.getBoundingClientRect=()=>({width:2552,height:1177});
    const tiles=new Map();
    for(let index=0;index<8;index++){
      const root=win.document.createElement("article"),video=win.document.createElement("video");
      root.append(video);wall.append(root);tiles.set(String(index),{id:String(index),root,video});
    }
    const ctx={wall,tiles,wrapper:win.document.body,els:{},layoutMode:"auto",applyAudioAll:()=>{}};
    initLayout(ctx,{calculateFocusLayout:(options)=>calculateUniformFocusLayout({...options,anchor:"center"})});
    const media=[...tiles.values()].map(tile=>tile.video);
    ctx.setFocus("0");
    const main=tiles.get("0");
    assert.equal(main.root.style.position,"absolute");
    assert.ok(parseFloat(main.root.style.left)>0);
    for(const tile of tiles.values())assert.equal(tile.root.parentElement,wall);
    const placeholder=win.document.createElement("div"),pip=win.document.createElement("div");
    main.root.replaceWith(placeholder);pip.append(main.root);win.document.body.append(pip);
    clearTileGeometry(main.root);
    ctx.pipSession={tile:main,placeholder};
    ctx.handleLayout();
    assert.equal(main.root.parentElement,pip);
    assert.equal(main.root.style.width,"");
    assert.equal(placeholder.style.position,"absolute");
    ctx.setFocus("1");
    assert.equal(tiles.get("1").root.classList.contains("is-focused"),true);
    assert.deepEqual([...tiles.values()].map(tile=>tile.video),media);
    placeholder.replaceWith(main.root);ctx.pipSession=null;ctx.handleLayout();
    assert.equal(main.root.parentElement,wall);
    ctx.setFocus(null);
    for(const tile of tiles.values()) {assert.equal(tile.root.style.position,"");assert.equal(tile.root.style.left,"");assert.equal(tile.root.style.width,"");}
    assert.deepEqual([...wall.children].filter(root=>[...tiles.values()].some(tile=>tile.root===root)),[...tiles.values()].map(tile=>tile.root));
  } finally {win.close();}
});
