import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchJson } from "../src/core/fetch-json.js";

const signal = () => new AbortController().signal;

test("fetchJson 正常返回 data", async () => {
  const fake = async () => ({ ok: true, json: async () => ({ error: 0, data: { v: 1 } }) });
  const payload = await fetchJson("https://x/y", {}, signal(), "测试", fake);
  assert.equal(payload.data.v, 1);
});

test("fetchJson 业务错误码抛出含 msg", async () => {
  const fake = async () => ({ ok: true, json: async () => ({ error: 3, msg: "繁忙" }) });
  await assert.rejects(() => fetchJson("https://x/y", {}, signal(), "测试", fake), /繁忙/);
});

test("fetchJson 网络异常映射为可读提示且隐藏地址", async () => {
  const fake = async () => { throw new TypeError("Failed to fetch https://x/y"); };
  await assert.rejects(
    () => fetchJson("https://x/y", {}, signal(), "测试", fake),
    (e) => e.message.includes("浏览器无法读取响应") && !e.message.includes("x/y")
  );
});
