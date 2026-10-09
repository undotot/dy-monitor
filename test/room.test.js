import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoom } from "../src/core/room.js";

test("parseRoom 数字房号去空白", () => {
  assert.equal(parseRoom(" 223344 "), "223344");
});

test("parseRoom 直播间链接", () => {
  assert.equal(parseRoom("https://www.douyu.com/223344"), "223344");
});

test("parseRoom topic 链接", () => {
  assert.equal(parseRoom("https://www.douyu.com/topic/123456"), "123456");
});

test("parseRoom 非法输入抛错", () => {
  assert.throws(() => parseRoom("abc"));
});
