import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDanmaku } from "../src/core/danmaku-render.js";
import { PacketReader, encodePacket, parseFields } from "../src/core/danmaku-protocol.js";

test("normalizeDanmaku 默认值", () => {
  const d = normalizeDanmaku({});
  assert.equal(d.enabled, true);
  assert.equal(d.size, 20);
  assert.equal(d.speed, 1);
  assert.equal(d.area, 1);
});

test("normalizeDanmaku 越界夹取与屏蔽词清洗", () => {
  const d = normalizeDanmaku({ size: 100, speed: 9, opacity: 5, area: 3, blockedWords: [" a ", "", 7] });
  assert.equal(d.size, 36);
  assert.equal(d.speed, 1);
  assert.equal(d.opacity, 1);
  assert.equal(d.area, 1);
  assert.deepEqual(d.blockedWords, ["a"]);
});

test("parseFields 还原 @S 转义", () => {
  const fields = parseFields("type@=chatmsg/txt@=hello@Sworld/");
  assert.equal(fields.txt, "hello/world");
  assert.equal(fields.type, "chatmsg");
});

test("PacketReader 解析弹幕包", () => {
  const text = "type@=chatmsg/rid@=123/txt@=hello@Sworld/";
  const bytes = new TextEncoder().encode(text);
  const buffer = new ArrayBuffer(bytes.length + 13);
  const view = new DataView(buffer);
  view.setUint32(0, bytes.length + 9, true);
  view.setUint32(4, bytes.length + 9, true);
  view.setUint16(8, 689, true);
  new Uint8Array(buffer).set(bytes, 12);
  const messages = new PacketReader().push(buffer);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].txt, "hello/world");
  assert.equal(messages[0].rid, "123");
});

test("encodePacket 生成合法 689 包头", () => {
  const buffer = encodePacket("type@=mrkl/");
  const view = new DataView(buffer);
  assert.equal(view.getUint16(8, true), 689);
  assert.equal(view.getUint32(0, true), buffer.byteLength - 4);
});
