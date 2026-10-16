import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { initLayout } from "../src/app/layout.js";
import { clearTileGeometry } from "../src/ui/tile-geometry.js";
import { calculateUniformFocusLayout } from "../src/core/focus-uniform-layout.js";

const makeScene = (count) => {
  const win = new Window();
  const wall = win.document.createElement("main");
  win.document.body.append(wall);
  const dimensions = { width: 2246, height: 994 };
  wall.getBoundingClientRect = () => ({ ...dimensions });
  const tiles = new Map();
  for (let index = 0; index < count; index++) {
    const root = win.document.createElement("article");
    const video = win.document.createElement("video");
    video.volume = 0.35;
    root.append(video);
    wall.append(root);
    tiles.set(String(index), { id: String(index), root, video });
  }
  const toasts = [];
  const ctx = { wall, tiles, wrapper: win.document.body, layoutMode: "auto", applyAudioAll: () => {},
    showToast: (message) => toasts.push(message) };
  initLayout(ctx);
  return { win, ctx, tiles, wall, dimensions, toasts };
};

test("正式放大与等大回退复用同一批媒体节点，缩放和退出完整清理定位", () => {
  const { win, ctx, tiles, wall, dimensions } = makeScene(14);
  try {
    const media = [...tiles.values()].map((tile) => tile.video);
    ctx.setFocus("0");
    assert.equal(ctx.focusLayout.fallback, true);
    assert.equal(wall.dataset.focusFallback, "true");
    const roots = [...tiles.values()].map((tile) => tile.root);
    assert.equal(new Set(roots.map((root) => root.style.width)).size, 1);
    assert.equal(new Set(roots.map((root) => root.style.height)).size, 1);
    const firstWidth = roots[0].style.width;
    dimensions.width = 390;
    dimensions.height = 844;
    ctx.handleLayout();
    assert.notEqual(roots[0].style.width, firstWidth);
    ctx.setFocus("3");
    assert.equal(tiles.get("3").root.classList.contains("is-focused"), true);
    assert.deepEqual([...tiles.values()].map((tile) => tile.video), media);
    assert.ok([...tiles.values()].every((tile) => tile.root.parentElement === wall && tile.video.volume === 0.35));
    ctx.setFocus(null);
    assert.equal(wall.dataset.focusLayout, undefined);
    assert.ok(roots.every((root) => !root.style.position && !root.style.width && !root.style.left));
  } finally { win.close(); }
});

test("元数据出现副窗比例冲突时恢复平铺并说明原因，不遗留旧放大坐标", () => {
  const { win, ctx, tiles, wall, toasts } = makeScene(5);
  try {
    ctx.setFocus("0");
    const original = [...tiles.values()].map((tile) => tile.video);
    Object.defineProperties(tiles.get("2").video, { videoWidth: { value: 900 }, videoHeight: { value: 1600 } });
    ctx.handleLayout();
    assert.equal(ctx.focused, null);
    assert.equal(ctx.focusLayout, null);
    assert.equal(wall.classList.contains("is-focused"), false);
    assert.ok([...tiles.values()].every((tile) => tile.root.parentElement === wall && !tile.root.style.position && !tile.root.style.width));
    assert.equal(toasts.length, 1);
    assert.match(toasts[0], /副窗源比例不同.*恢复平铺/);
    assert.deepEqual([...tiles.values()].map((tile) => tile.video), original);
    ctx.handleLayout();
    assert.equal(toasts.length, 1);
  } finally { win.close(); }
});

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
    assert.ok(ctx.focusLayout.offsetY * 2 + ctx.focusLayout.containerH <= 719.5 + 1e-7);
    const mainTile = tiles.get("0");
    const root = mainTile.root;
    const video = mainTile.video;
    // 主视频比例变化时重新求解真实画格，避免把黑边藏到主窗内部。
    Object.defineProperties(video, { videoWidth: { configurable: true, value: 900 }, videoHeight: { configurable: true, value: 1600 } });
    ctx.handleLayout();
    assert.ok(Math.abs(ctx.focusLayout.mainVideo.width / ctx.focusLayout.mainVideo.height - 900 / 1600) < 1e-7);
    assert.equal(ctx.focusLayout.mainVideo.width, ctx.focusLayout.main.width);
    assert.equal(ctx.focusLayout.mainVideo.height, ctx.focusLayout.main.height);
    assert.equal(root.parentElement, wall);
    assert.equal(root.style.position, "absolute");
    // 换主窗前恢复同向视频，否则旧主窗会成为比例冲突的副窗。
    Object.defineProperties(video, { videoWidth: { value: 1280 }, videoHeight: { value: 720 } });
    const placeholder = win.document.createElement("div");
    root.replaceWith(placeholder);
    const pipContainer = win.document.createElement("div");
    win.document.body.append(pipContainer);
    pipContainer.append(root);
    clearTileGeometry(root);
    ctx.pipSession = { tile: mainTile, placeholder };
    ctx.handleLayout();
    assert.equal(placeholder.style.position, "absolute");
    assert.equal(root.parentElement, pipContainer);
    assert.equal(root.style.width, "");
    ctx.setFocus("1");
    assert.equal(placeholder.parentElement, wall);
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
