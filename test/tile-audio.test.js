import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { tileMarkup } from "../src/ui/tile-markup.js";
import { bindTileAudio } from "../src/app/tile-audio.js";
import { bindTileDrag } from "../src/app/tile-drag.js";

const setup = (win) => {
  const root = win.document.createElement("article");
  root.innerHTML = tileMarkup();
  win.document.body.append(root);
  const find = (selector) => root.querySelector(selector);
  const tile = { id:"a",root,vol:0.5,muted:true,volSlider:find("[data-t-vol]"),muteBtn:find("[data-t-mute]"),audioCorner:find("[data-audio-corner]") };
  const ctx = { tiles:new Map([["a",tile]]),saves:0,audioUpdates:0,paintSlider:()=>{},updateTileChrome:()=>{},applyAudio:()=>{ctx.audioUpdates++;},save:()=>{ctx.saves++;},toggleMute:()=>{tile.muted=!tile.muted;},swapTiles:()=>assert.fail("音量操作不应换位") };
  bindTileDrag(ctx,tile); bindTileAudio(ctx,tile);
  return {tile,ctx};
};

test("音量拖动隔离事件并暂时关闭画格拖拽，结束只保存一次", () => {
  const win = new Window();
  try {
    const {tile,ctx}=setup(win);
    let parentCalls=0;
    for(const type of ["pointerdown","pointermove","input","click","dblclick","contextmenu"]) tile.root.addEventListener(type,()=>parentCalls++);
    tile.volSlider.dispatchEvent(new win.PointerEvent("pointerdown",{bubbles:true,pointerId:7,button:0}));
    assert.equal(tile.root.draggable,false);
    assert.equal(tile.audioInteractionActive,true);
    tile.volSlider.value="0.26";
    tile.volSlider.dispatchEvent(new win.Event("input",{bubbles:true}));
    tile.volSlider.dispatchEvent(new win.PointerEvent("pointermove",{bubbles:true,pointerId:7}));
    tile.volSlider.dispatchEvent(new win.MouseEvent("dblclick",{bubbles:true}));
    const contextMenu=new win.MouseEvent("contextmenu",{bubbles:true,cancelable:true});
    tile.volSlider.dispatchEvent(contextMenu);
    assert.equal(contextMenu.defaultPrevented,true);
    const drag=new win.Event("dragstart",{bubbles:true,cancelable:true});
    Object.defineProperty(drag,"dataTransfer",{value:{setData:()=>{}}});
    tile.root.dispatchEvent(drag);
    assert.equal(drag.defaultPrevented,true);
    assert.equal(tile.vol,0.26);
    assert.equal(tile.muted,false);
    assert.equal(parentCalls,0);
    assert.equal(ctx.saves,0);
    win.dispatchEvent(new win.PointerEvent("pointerup",{pointerId:99}));
    assert.equal(tile.root.draggable,false);
    win.dispatchEvent(new win.PointerEvent("pointerup",{pointerId:7}));
    tile.volSlider.dispatchEvent(new win.Event("change",{bubbles:true}));
    assert.equal(tile.root.draggable,true);
    assert.equal(tile.audioInteractionActive,false);
    assert.equal(ctx.saves,1);
    tile.disconnectAudio();
  } finally {win.close();}
});

test("取消或移除结束音量拖动，键盘与滚轮只调整音量", () => {
  const win=new Window();
  try {
    const {tile,ctx}=setup(win);
    tile.volSlider.dispatchEvent(new win.PointerEvent("pointerdown",{bubbles:true,pointerId:2,button:0}));
    win.dispatchEvent(new win.PointerEvent("pointercancel",{pointerId:2}));
    assert.equal(tile.root.draggable,true);
    const wheel=new win.WheelEvent("wheel",{bubbles:true,cancelable:true,deltaY:-1,shiftKey:true});
    Object.defineProperty(wheel,"shiftKey",{value:true});
    tile.audioCorner.dispatchEvent(wheel);
    assert.equal(tile.vol,0.51);
    assert.equal(wheel.defaultPrevented,true);
    assert.equal(ctx.saves,1);
    tile.volSlider.value="0.4";
    tile.volSlider.dispatchEvent(new win.Event("input",{bubbles:true}));
    tile.volSlider.dispatchEvent(new win.Event("change",{bubbles:true}));
    assert.equal(tile.vol,0.4);
    assert.equal(ctx.saves,2);
    tile.audioCorner.dispatchEvent(new win.PointerEvent("pointerdown",{bubbles:true,pointerId:3,button:0}));
    tile.disconnectAudio();
    assert.equal(tile.root.draggable,true);
    assert.equal(tile.audioCorner.classList.contains("is-dragging-vol"),false);
  } finally {win.close();}
});

test("画格跨窗口迁移后音量结束事件绑定新窗口，返回时恢复原窗口", () => {
  const win = new Window();
  const pipWin = new Window();
  try {
    const { tile, ctx } = setup(win);
    tile.disconnectAudio();
    pipWin.document.body.append(pipWin.document.adoptNode(tile.root));
    assert.equal(tile.root.ownerDocument, pipWin.document);
    bindTileAudio(ctx, tile);
    tile.volSlider.dispatchEvent(new pipWin.PointerEvent("pointerdown", { bubbles: true, pointerId: 8, button: 0 }));
    tile.volSlider.value = "0.3";
    tile.volSlider.dispatchEvent(new pipWin.Event("input", { bubbles: true }));
    win.dispatchEvent(new win.PointerEvent("pointerup", { pointerId: 8 }));
    assert.equal(tile.audioInteractionActive, true, "旧窗口不能结束新窗口中的拖动");
    pipWin.dispatchEvent(new pipWin.PointerEvent("pointerup", { pointerId: 8 }));
    assert.equal(tile.audioInteractionActive, false);
    assert.equal(tile.root.draggable, true);
    assert.equal(ctx.saves, 1);
    tile.disconnectAudio();
    // happy-dom不支持同一节点重复adoptNode；用画中画所属节点验证返回方向。
    const restored = setup(pipWin);
    restored.tile.disconnectAudio();
    win.document.body.append(win.document.adoptNode(restored.tile.root));
    bindTileAudio(restored.ctx, restored.tile);
    restored.tile.volSlider.dispatchEvent(new win.PointerEvent("pointerdown", { bubbles: true, pointerId: 9, button: 0 }));
    pipWin.dispatchEvent(new pipWin.PointerEvent("pointerup", { pointerId: 9 }));
    assert.equal(restored.tile.audioInteractionActive, true);
    win.dispatchEvent(new win.PointerEvent("pointercancel", { pointerId: 9 }));
    assert.equal(restored.tile.audioInteractionActive, false);
    restored.tile.disconnectAudio();
  } finally { win.close(); pipWin.close(); }
});
