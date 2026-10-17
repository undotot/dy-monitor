import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { shellMarkup } from "../src/ui/shell-markup.js";
import { createContext } from "../src/app/context.js";
import { initAddPanel } from "../src/app/add-panel.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withScene = async (searchForRooms, work) => {
  const win = new Window();
  const previous = globalThis.document;
  globalThis.document = win.document;
  const wrapper = win.document.createElement("div");
  wrapper.innerHTML = shellMarkup();
  win.document.body.append(wrapper);
  const ctx = createContext();
  Object.assign(ctx, { wrapper, opened: true, addTile: () => { throw new Error("输入不得自动添加"); } });
  for (const [key, selector] of Object.entries({ addPanel: "[data-add-panel]", addList: "[data-add-list]", addStatus: "[data-add-status]", addSearch: "[data-add-search]", defaultRate: "[data-default-rate]" })) ctx.els[key] = wrapper.querySelector(selector);
  ctx.addState.followRooms = [];
  initAddPanel(ctx, { searchForRooms, followRooms: async () => [], probeRoom: async () => ({}), searchDelay: 50 });
  ctx.openAdd();
  const input = (text) => { ctx.els.addSearch.value = text; ctx.els.addSearch.dispatchEvent(new win.Event("input", { bubbles: true })); };
  try { await work({ ctx, win, input, query: (selector) => wrapper.querySelector(selector) }); }
  finally { ctx.closeAdd(); globalThis.document = previous; win.close(); }
};
const room = (rid, name = `主播${rid}`) => ({ rid, name, liveStatus: "live" });
const page = (rooms, extra = {}) => ({ rooms, page: 1, hasMore: false, total: rooms.length, ...extra });

test("连续输入只搜索停输后的最终关键词，Enter立即搜索但不添加", async () => {
  const calls = [];
  await withScene(async (text) => { calls.push(text); return page([room("100")]); }, async ({ ctx, win, input }) => {
    input("a"); input("af"); input("阿飞");
    ctx.els.addSearch.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    assert.deepEqual(calls, ["阿飞"]);
    await sleep(70);
    assert.deepEqual(calls, ["阿飞"]);
    assert.equal(ctx.addState.rooms[0].rid, "100");
    input("84452");
    await sleep(70);
    assert.deepEqual(calls, ["阿飞", "84452"]);
    assert.equal(ctx.tiles.size, 0);
  });
});

test("中文组合输入期间不搜索，上屏后自动搜索一次，不需要Enter", async () => {
  const calls = [];
  await withScene(async (text) => { calls.push(text); return page([]); }, async ({ ctx, win, input }) => {
    ctx.els.addSearch.dispatchEvent(new win.Event("compositionstart"));
    input("afei");
    await sleep(70);
    assert.deepEqual(calls, []);
    ctx.els.addSearch.value = "阿飞";
    ctx.els.addSearch.dispatchEvent(new win.Event("compositionend"));
    input("阿飞");
    await sleep(70);
    assert.deepEqual(calls, ["阿飞"]);
  });
});

test("继续输入立即取消旧请求，忽略防抖间隔内迟到的旧响应", async () => {
  const calls = [];
  let finish;
  await withScene(async (text, signal) => {
    calls.push({ text, signal });
    if (text === "旧词") return new Promise((resolve) => { finish = resolve; });
    return page([room("200", "新结果")]);
  }, async ({ ctx, input }) => {
    input("旧词"); await sleep(70);
    input("新词");
    assert.equal(calls[0].signal.aborted, true);
    finish(page([room("100", "旧结果")]));
    await Promise.resolve(); await Promise.resolve();
    assert.equal(ctx.addState.rooms.some((item) => item.rid === "100"), false);
    await sleep(70);
    assert.equal(ctx.addState.rooms[0].name, "新结果");
  });
});

test("清空、切换标签和关闭面板均取消待执行搜索", async () => {
  const calls = [];
  await withScene(async (text) => { calls.push(text); return page([]); }, async ({ ctx, input }) => {
    input("清空前"); input(""); await sleep(70);
    input("切页前"); await ctx.loadAddTab("history"); await sleep(70);
    input("关闭前"); ctx.closeAdd(); await sleep(70);
    assert.deepEqual(calls, []);
    assert.equal(ctx.els.addPanel.hidden, true);
  });
});

test("分页按官方顺序追加去重，保留跨页选择，末页隐藏加载更多", async () => {
  const calls = [];
  await withScene(async (text, signal, probe, options) => {
    calls.push(options.page);
    return options.page === 1 ? page([room("100"), room("200")], { total: 3, hasMore: true }) : page([room("200"), room("300")], { total: 3, page: 2 });
  }, async ({ ctx, input, query }) => {
    input("主播"); await sleep(70);
    query('[data-rid="100"] [data-chk]').click();
    assert.equal(query("[data-add-search-more]").hidden, false);
    query("[data-add-search-more]").click();
    await sleep(5);
    assert.deepEqual(calls, [1, 2]);
    assert.deepEqual(ctx.addState.rooms.map((item) => item.rid), ["100", "200", "300"]);
    assert.equal(ctx.addState.selected.has("100"), true);
    assert.equal(query("[data-add-search-more]").hidden, true);
  });
});

test("失败显示重试，关闭后的迟到结果不重新打开或覆盖面板", async () => {
  let attempt = 0;
  let finish;
  await withScene(async () => {
    if (++attempt === 1) throw new Error("网络异常");
    return new Promise((resolve) => { finish = resolve; });
  }, async ({ ctx, input, query }) => {
    input("主播"); await sleep(70);
    assert.match(ctx.els.addStatus.textContent, /搜索失败.*网络异常/);
    query("[data-add-search-retry]").click();
    assert.equal(attempt, 2);
    ctx.closeAdd();
    finish(page([room("100")]));
    await sleep(5);
    assert.equal(ctx.els.addPanel.hidden, true);
    assert.equal(ctx.addState.rooms.length, 0);
  });
});
