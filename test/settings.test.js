import { test } from "node:test";
import assert from "node:assert/strict";
import { clamp01, safeMessage, MAX_TILES, RATES, AUDIO_MODES, CLIENT_DID_KEY, parseMultirates } from "../src/core/settings.js";
import { generateClientDid, resolveClientDid } from "../src/playback/stream.js";

test("clamp01 数值截断到 [0,1]", () => {
  assert.equal(clamp01(1.7), 1);
  assert.equal(clamp01(-3), 0);
});

test("clamp01 保留合法的 0", () => {
  assert.equal(clamp01(0, 0.5), 0);
});

test("clamp01 非法值走 fallback", () => {
  assert.equal(clamp01(undefined, 0.5), 0.5);
  assert.equal(clamp01("x"), 1);
});

test("safeMessage 隐藏 URL 并限长", () => {
  const msg = safeMessage(new Error("取流失败 https://www.douyu.com/12345"));
  assert.ok(!msg.includes("douyu.com"));
  assert.ok(msg.includes("[地址已隐藏]"));
  assert.ok(safeMessage(new Error("e".repeat(500))).length <= 180);
});

test("常量形状", () => {
  assert.equal(MAX_TILES, 16);
  assert.ok(RATES.some(([rate]) => rate === 0) && RATES.some(([rate]) => rate === 1));
  assert.deepEqual([...AUDIO_MODES], ["mix", "solo", "mute"]);
});

test("设备指纹优先从 Cookie 读取合法的 dy_did", () => {
  const cookie = "foo=bar; dy_did=official_cookie_did_1234; other=1";
  const mockStorage = { get: () => "stored_did", set: () => {} };
  assert.equal(resolveClientDid(cookie, mockStorage), "official_cookie_did_1234");
});

test("Cookie 无有效 dy_did 时回退 storage 持久化并复用", () => {
  const store = new Map();
  const mockStorage = {
    get: (k, fb) => store.get(k) ?? fb,
    set: (k, v) => store.set(k, v)
  };
  mockStorage.set(CLIENT_DID_KEY, "persisted_custom_did_888");
  assert.equal(resolveClientDid("", mockStorage), "persisted_custom_did_888");
});

test("全新环境无 Cookie 无 storage 时动态生成 32 位并自动持久化", () => {
  const store = new Map();
  const mockStorage = {
    get: (k, fb) => store.get(k) ?? fb,
    set: (k, v) => store.set(k, v)
  };
  const did = resolveClientDid("", mockStorage);
  assert.equal(did.length, 32);
  assert.ok(/^1000000000000000000000000000[0-9a-f]{4}$/.test(did));
  assert.equal(store.get(CLIENT_DID_KEY), did);
  // 第二次解析直接复用已保存的指纹
  assert.equal(resolveClientDid("", mockStorage), did);
});

test("parseMultirates 转换官方清晰度列表与回退", () => {
  assert.equal(parseMultirates(null), null);
  assert.equal(parseMultirates([]), null);
  const raw = [
    { type: 0, name: "原画(1080P60)" },
    { type: 8, name: "蓝光8M" },
    { type: 4, name: "" }, // 缺省 name 回退已知文案
    { rate: 3, name: "超清" },
    { invalid: 123 }
  ];
  const list = parseMultirates(raw);
  assert.equal(list.length, 4);
  assert.deepEqual(list[0], { rate: 0, name: "原画(1080P60)" });
  assert.deepEqual(list[1], { rate: 8, name: "蓝光8M" });
  assert.deepEqual(list[2], { rate: 4, name: "蓝光 4M" });
  assert.deepEqual(list[3], { rate: 3, name: "超清" });
});


