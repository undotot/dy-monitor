import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { getTileScale, observeTileControls } from "../src/core/tile-scale.js";
import { DanmakuRenderer, normalizeDanmaku } from "../src/core/danmaku-render.js";
import { tileMarkup } from "../src/ui/tile-markup.js";

test("小窗口缩放有下限，放大恢复正常尺寸", () => {
  assert.equal(getTileScale(320, 180), 0.55);
  assert.equal(getTileScale(480, 270), 0.75);
  assert.equal(getTileScale(1920, 1080), 1);
});

test("工具条按宽度收纳而不缩小点击区，画质节点往返保留，删除断开观察", () => {
  const win = new Window();
  try {
    let handleResize, disconnected = false;
    win.ResizeObserver = class {
      constructor(callback) { handleResize = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    };
    const root = win.document.createElement("article");
    root.innerHTML = tileMarkup();
    let width = 320, height = 180;
    Object.defineProperties(root.querySelector(".tile-viewport"), {
      clientWidth: { get: () => width }, clientHeight: { get: () => height }
    });
    const disconnect = observeTileControls(root);
    const header = root.querySelector(".tile-status");
    const audioCorner = root.querySelector(".tile-audio-corner");
    const tools = root.querySelector(".tile-tools");
    // 胶囊宽度随直播间名收缩（CSS width:auto），JS 只做 transform 缩放，不得写内联 width/right 固定值。
    assert.equal(header.style.width, "", "胶囊不写内联 width 固定值");
    assert.equal(header.style.right, "", "胶囊不写内联 right");
    assert.equal(header.style.transform, "scale(0.8)");
    assert.equal(audioCorner.style.transform, "scale(0.8)");
    const quality = root.querySelector(".tool-quality");
    const select = quality.querySelector("select");
    select.innerHTML = '<option value="2">高清</option><option value="3">流畅</option>';
    select.value = "3";
    assert.equal(tools.style.transform, "");
    assert.equal(root.classList.contains("tools-compact"), true);
    assert.ok(parseFloat(tools.style.maxWidth) <= width);
    width = 200; height = 112;
    handleResize();
    assert.equal(root.classList.contains("tools-mini"), true);
    assert.equal(quality.parentElement, root.querySelector("[data-tool-quality-slot]"));
    assert.equal(root.querySelector("[data-tool-quality-slot]").hidden, false);
    assert.equal(root.querySelector("[data-t-more-menu]").classList.contains("is-tool-flyout"), true);
    width = 96; height = 180;
    handleResize();
    assert.equal(root.classList.contains("tools-narrow"), true);
    assert.equal(root.classList.contains("tools-micro"), false);
    width = 70;
    handleResize();
    assert.equal(root.classList.contains("tools-micro"), true);
    width = 1280; height = 720;
    handleResize();
    assert.equal(header.style.width, "", "缩放后仍不写内联 width");
    assert.equal(header.style.transform, "scale(1)");
    assert.equal(audioCorner.style.transform, "scale(1)");
    assert.equal(tools.style.transform, "");
    assert.equal(root.classList.contains("tools-compact"), false);
    assert.equal(root.classList.contains("tools-mini"), false);
    assert.equal(root.classList.contains("tools-narrow"), false);
    assert.equal(root.classList.contains("tools-micro"), false);
    assert.equal(quality.parentElement, root.querySelector("[data-tool-quality-anchor]"));
    assert.equal(select.value, "3");
    disconnect();
    assert.equal(disconnected, true);
  } finally { win.close(); }
});

test("弹幕测量字号随画面改变，修改字号立即生效并清空旧轨道", () => {
  const context = { font: "", measureText: () => ({ width: 60 }) };
  const canvas = { clientWidth: 320, clientHeight: 180, getContext: () => context };
  const options = normalizeDanmaku({ enabled: true, size: 20 });
  const renderer = new DanmakuRenderer(canvas, options);
  renderer.frame = 1;
  renderer.add({ txt: "测试弹幕" });
  assert.equal(context.font, "11px sans-serif");
  assert.equal(renderer.items.length, 1);
  canvas.clientWidth = 1280; canvas.clientHeight = 720;
  renderer.add({ txt: "放大弹幕" });
  assert.equal(context.font, "20px sans-serif");
  assert.equal(renderer.items.length, 1);
  renderer.update({ ...options, size: 30 });
  assert.equal(renderer.items.length, 0);
  renderer.add({ txt: "更改字号" });
  assert.equal(context.font, "30px sans-serif");
  renderer.stop();
});
