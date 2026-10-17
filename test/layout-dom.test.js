import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { initLayout } from "../src/app/layout.js";
import { initAudio } from "../src/app/audio.js";
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

test("副窗元数据出现异比例时保留所选主窗，小窗等大并以黑边适配", () => {
  const { win, ctx, tiles, wall, toasts } = makeScene(5);
  try {
    ctx.setFocus("0");
    const original = [...tiles.values()].map((tile) => tile.video);
    ctx.selectedId = "0";
    Object.defineProperties(tiles.get("2").video, { videoWidth: { value: 900 }, videoHeight: { value: 1600 } });
    ctx.handleLayout();
    assert.equal(ctx.focused, "0");
    assert.equal(ctx.selectedId, "0");
    assert.equal(ctx.focusLayout.status, "ready");
    assert.equal(ctx.focusLayout.containSecondary, true);
    assert.equal(wall.classList.contains("is-focused"), true);
    assert.equal(tiles.get("0").root.classList.contains("is-focused"), true);
    assert.equal(tiles.get("2").root.classList.contains("is-focused"), false);
    assert.ok(Math.abs(ctx.focusLayout.main.width / ctx.focusLayout.main.height - 16 / 9) < 1e-7);
    const smallRoots = [...tiles.values()].filter((tile) => tile.id !== "0").map((tile) => tile.root);
    assert.equal(new Set(smallRoots.map((root) => root.style.width)).size, 1);
    assert.equal(new Set(smallRoots.map((root) => root.style.height)).size, 1);
    const hint = wall.querySelector("[data-focus-hint]");
    assert.equal(hint.hidden, false);
    assert.match(hint.textContent, /副窗源比例不同/);
    assert.equal(toasts.length, 0);
    assert.deepEqual([...tiles.values()].map((tile) => tile.video), original);
    // 用户点另一路时，必须保留新的主窗，而不是回到第一次放大的房间。
    ctx.setFocus("1");
    assert.equal(ctx.focused, "1");
    assert.equal(tiles.get("1").root.classList.contains("is-focused"), true);
    assert.equal(tiles.get("0").root.classList.contains("is-focused"), false);
    assert.equal(ctx.focusLayout.containSecondary, true);
    ctx.toggleFocus(tiles.get("1"));
    assert.equal(ctx.focused, null);
    assert.equal(ctx.focusLayout, null);
    assert.equal(wall.classList.contains("is-focused"), false);
    assert.ok([...tiles.values()].every((tile) => tile.root.parentElement === wall && !tile.root.style.position && !tile.root.style.width));
    assert.deepEqual([...tiles.values()].map((tile) => tile.video), original);
  } finally { win.close(); }
});

test("多路混合比例副窗仍保留主窗，不会退回平铺", () => {
  const { win, ctx, tiles, wall, toasts } = makeScene(5);
  try {
    ctx.setFocus("0");
    for (const id of ["2", "3"]) Object.defineProperties(tiles.get(id).video, { videoWidth: { value: 900 }, videoHeight: { value: 1600 } });
    ctx.handleLayout();
    assert.equal(ctx.focused, "0");
    assert.equal(ctx.focusLayout.status, "ready");
    assert.equal(ctx.focusLayout.containSecondary, true);
    assert.equal(wall.classList.contains("is-focused"), true);
    assert.equal(tiles.get("0").root.classList.contains("is-focused"), true);
    assert.ok([...tiles.values()].every((tile) => tile.root.parentElement === wall));
    assert.equal(toasts.length, 0);
    const hint = wall.querySelector("[data-focus-hint]");
    assert.equal(hint.hidden, false);
  } finally { win.close(); }
});

test("混合比例副窗进入画中画时占位仍被定位，不移动原播放器", () => {
  const { win, ctx, tiles, wall } = makeScene(5);
  try {
    ctx.setFocus("0");
    const tile = tiles.get("3");
    Object.defineProperties(tile.video, { videoWidth: { value: 900 }, videoHeight: { value: 1600 } });
    const placeholder = win.document.createElement("div");
    tile.root.replaceWith(placeholder);
    const pip = win.document.createElement("div");
    win.document.body.append(pip);
    pip.append(tile.root);
    clearTileGeometry(tile.root);
    ctx.pipSession = { tile, placeholder };
    ctx.handleLayout();
    assert.equal(ctx.focused, "0");
    const placement = ctx.focusLayout.placements.find((room) => room.index === 2);
    assert.ok(placement);
    assert.equal(placeholder.parentElement, wall);
    assert.ok(Math.abs(parseFloat(placeholder.style.width) - placement.width) < 0.001);
    assert.equal(tile.root.parentElement, pip);
    assert.equal(tile.root.style.width, "");
    assert.equal(tile.video.volume, 0.35);
    assert.equal(tile.root.classList.contains("is-focused"), false);
    assert.equal(tiles.get("0").root.classList.contains("is-focused"), true);
  } finally { win.close(); }
});

test("混合比例副窗不改变主窗与听音对象，保留每路音量", () => {
  for (const followFocus of [false, true]) {
    const { win, ctx, tiles } = makeScene(5);
    try {
      ctx.selectedId = "0";
      ctx.audio = { mode: "solo", master: 0.5, followFocus };
      for (const tile of tiles.values()) { tile.muted = false; tile.vol = 0.7; }
      initAudio(ctx);
      ctx.setFocus("0");
      Object.defineProperties(tiles.get("2").video, { videoWidth: { value: 900 }, videoHeight: { value: 1600 } });
      ctx.handleLayout();
      assert.equal(ctx.focused, "0");
      assert.equal(ctx.selectedId, "0");
      for (const tile of tiles.values()) {
        assert.equal(tile.video.muted, tile.id !== "0");
        assert.equal(tile.video.volume, 0.35);
      }
    } finally { win.close(); }
  }
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

test("混合比例下换位、恢复平铺后仍可放大任意房间", () => {
  const { win, ctx, tiles, wall } = makeScene(5);
  try {
    Object.defineProperties(tiles.get("2").video, { videoWidth: { value: 900 }, videoHeight: { value: 1600 } });
    ctx.setFocus("0");
    assert.equal(ctx.focused, "0");
    assert.equal(ctx.focusLayout.containSecondary, true);
    // 模拟真实画格的换位：Map 顺序交换，主区域身份跟随目标房间。
    const entries = [...ctx.tiles.entries()];
    [entries[0], entries[1]] = [entries[1], entries[0]];
    ctx.tiles.clear();
    for (const [id, tile] of entries) ctx.tiles.set(id, tile);
    if (ctx.focused === "0") ctx.focused = "1";
    else if (ctx.focused === "1") ctx.focused = "0";
    ctx.handleLayout();
    assert.equal(ctx.focused, "1");
    assert.equal(tiles.get("1").root.classList.contains("is-focused"), true);
    ctx.setFocus(null);
    assert.equal(wall.classList.contains("is-focused"), false);
    ctx.setFocus("3");
    assert.equal(ctx.focused, "3");
    assert.equal(tiles.get("3").root.classList.contains("is-focused"), true);
    assert.equal(tiles.get("1").root.classList.contains("is-focused"), false);
    assert.equal(ctx.focusLayout.containSecondary, true);
  } finally { win.close(); }
});
