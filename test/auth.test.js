import { test } from "node:test";
import assert from "node:assert/strict";
import { md5, buildAuth } from "../src/core/auth.js";

test("md5 空串标准向量", () => {
  assert.equal(md5(""), "d41d8cd98f00b204e9800998ecf8427e");
});

test("md5 abc 标准向量", () => {
  assert.equal(md5("abc"), "900150983cd24fb0d6963f7d28e17f72");
});

test("buildAuth 返回 32 位十六进制", () => {
  const auth = buildAuth("12345", 1700000000, { key: "k", rand_str: "r", enc_data: "e", enc_time: 2 });
  assert.match(auth, /^[0-9a-f]{32}$/);
});

test("buildAuth 缺素材抛错", () => {
  assert.throws(() => buildAuth("1", 1, {}));
});
