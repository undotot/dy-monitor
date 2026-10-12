import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadHistory, recordHistory, clearHistory } from "../src/api/history.js";

const store = new Map();
globalThis.GM_getValue = (key, fallback) => (store.has(key) ? store.get(key) : fallback);
globalThis.GM_setValue = (key, value) => store.set(key, value);

beforeEach(() => store.clear());

test("recordHistory / loadHistory 往返与去重", () => {
  recordHistory("7788", "丁", "https://x/p.png");
  recordHistory("7788", "丁2");
  const list = loadHistory();
  assert.equal(list[0].rid, "7788");
  assert.equal(list[0].name, "丁2");
  assert.equal(list.filter((e) => e.rid === "7788").length, 1);
});

test("loadHistory 过滤非法房号", () => {
  store.set("douyu-monitor.history.v1", [{ rid: "abc" }, { rid: "0" }, { rid: "12345" }]);
  const list = loadHistory();
  assert.equal(list.length, 1);
  assert.equal(list[0].rid, "12345");
});

test("只更新房号不覆盖已获取的用户名和头像", () => {
  recordHistory("7788", "主播甲", "https://x/avatar.png");
  recordHistory("7788");
  const [entry] = loadHistory();
  assert.equal(entry.name, "主播甲");
  assert.equal(entry.ava, "https://x/avatar.png");
});

test("存储不可用时 loadHistory 返回空数组", () => {
  const get = globalThis.GM_getValue;
  globalThis.GM_getValue = () => { throw new Error("denied"); };
  try {
    assert.deepEqual(loadHistory(), []);
    recordHistory("1"); // 不应抛出
  } finally {
    globalThis.GM_getValue = get;
  }
});

test("clearHistory 成功清空本地历史房号", () => {
  recordHistory("123", "测试主播");
  assert.equal(loadHistory().length, 1);
  assert.equal(clearHistory(), true);
  assert.equal(loadHistory().length, 0);
});

