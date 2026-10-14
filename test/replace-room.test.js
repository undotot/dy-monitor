import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { shellMarkup } from "../src/ui/shell-markup.js";
import { tileMarkup } from "../src/ui/tile-markup.js";
import { rateOptions } from "../src/ui/options.js";
import { initAddPanel } from "../src/app/add-panel.js";
import { replaceTileRoom } from "../src/app/replace-room.js";

const setup = (win, probeRoom, count=2) => {
  const wrapper=win.document.createElement("div");
  wrapper.innerHTML=shellMarkup();
  win.document.body.append(wrapper);
  const ctx={wrapper,tiles:new Map(),opened:true,stops:0,starts:0,saves:0,updateTileChrome:()=>{},save:()=>{ctx.saves++;},stop:()=>{ctx.stops++;},handleStart:async()=>{ctx.starts++;},showToast:()=>{},addState:{tab:"all",mode:"tab",rooms:[],selected:new Map(),generation:0,followRooms:[]},els:{}};
  for(const [key,selector] of Object.entries({addPanel:"[data-add-panel]",addList:"[data-add-list]",addStatus:"[data-add-status]",addSearch:"[data-add-search]",defaultRate:"[data-default-rate]"}))ctx.els[key]=wrapper.querySelector(selector);
  for(let index=0;index<count;index++){
    const root=win.document.createElement("article");root.innerHTML=tileMarkup();
    const tile={id:String(index),rid:String(1001+index),name:`主播${index}`,root,video:root.querySelector("video"),rate:3,vol:0.26,muted:false,danmaku:{enabled:true,mode:"sidebar",scrollStyle:"normal"},rateSel:root.querySelector("[data-t-rate]")};
    tile.rateSel.innerHTML=rateOptions;
    wrapper.querySelector("[data-wall]").append(root);
    ctx.tiles.set(tile.id,tile);
  }
  initAddPanel(ctx,{probeRoom,followRooms:async()=>[],searchForRooms:async()=>[]});
  return ctx;
};

const withWindow = async (work) => {
  const win=new Window();
  const previousDocument=globalThis.document;
  globalThis.document=win.document;
  try {await work(win);} finally {globalThis.document=previousDocument;win.close();}
};

test("原位替换保留画格身份、视频节点、音量和弹幕偏好", async()=>withWindow(async(win)=>{
  const ctx=setup(win,async()=>({rid:"2001",name:"新主播",liveStatus:"live"}));
  const tile=ctx.tiles.get("0"), parent=tile.root.parentElement,video=tile.video,options=tile.danmaku;
  ctx.openAdd(tile);
  assert.equal(ctx.wrapper.querySelector("[data-add-selected]").hidden,true);
  assert.equal(ctx.wrapper.querySelector("[data-add-rate-wrap]").hidden,true);
  await ctx.replaceRoomFromPanel({rid:"2001"});
  assert.equal(ctx.tiles.size,2);
  assert.equal(ctx.tiles.get("0"),tile);
  assert.equal(tile.root.parentElement,parent);
  assert.equal(tile.video,video);
  assert.equal(tile.rid,"2001");
  assert.equal(tile.vol,0.26);
  assert.equal(tile.muted,false);
  assert.equal(tile.rate,3);
  assert.equal(tile.danmaku,options);
  assert.equal(ctx.stops,1);assert.equal(ctx.starts,1);
  assert.equal(ctx.els.addPanel.hidden,true);
}));

test("探测失败或重复房间不停止原直播，满16格仍允许替换", async()=>withWindow(async(win)=>{
  const ctx=setup(win,async()=>{throw new Error("未找到房间");},16);
  const tile=ctx.tiles.get("0");
  ctx.openAdd(tile);
  assert.equal(ctx.roomStateFor({rid:"2001",liveStatus:"live"}).disabled,false);
  await ctx.replaceRoomFromPanel({rid:"2001"});
  assert.equal(tile.rid,"1001");assert.equal(ctx.stops,0);
  assert.match(ctx.els.addStatus.textContent,/原直播未改变/);
  await ctx.replaceRoomFromPanel({rid:"1002"});
  assert.equal(ctx.stops,0);
  assert.match(ctx.els.addStatus.textContent,/已在监控室/);
  assert.equal(ctx.els.addList.inert,false);
  assert.throws(()=>replaceTileRoom(ctx,tile,{rid:"1002"}),/已在监控室/);
  ctx.closeAdd();
  ctx.openAdd();
  assert.equal(ctx.wrapper.querySelector("[data-add-selected]").hidden,false);
  assert.equal(ctx.wrapper.querySelector("[data-add-rate-wrap]").hidden,false);
  assert.equal(ctx.roomStateFor({rid:"2001",liveStatus:"live"}).disabled,true);
}));

test("取消或移除原画格后丢弃迟到的换房结果", async()=>withWindow(async(win)=>{
  let resolveProbe;
  const ctx=setup(win,()=>new Promise((resolve)=>{resolveProbe=resolve;}));
  const tile=ctx.tiles.get("0");
  ctx.openAdd(tile);
  const task=ctx.replaceRoomFromPanel({rid:"2001"});
  assert.equal(ctx.els.addSearch.disabled,true);
  ctx.closeAdd();
  resolveProbe({rid:"2001",name:"迟到的主播",liveStatus:"live"});
  await task;
  assert.equal(tile.rid,"1001");assert.equal(ctx.stops,0);
  assert.equal(ctx.els.addSearch.disabled,false);
  ctx.tiles.delete(tile.id);
  assert.throws(()=>replaceTileRoom(ctx,tile,{rid:"2001"}),/已移除/);
}));
