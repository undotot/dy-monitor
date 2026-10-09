import { test } from "node:test";
import assert from "node:assert/strict";
import { clamp01, safeMessage, MAX_TILES, RATES, AUDIO_MODES } from "../src/core/settings.js";

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
