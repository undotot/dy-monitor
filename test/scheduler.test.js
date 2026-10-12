import { test } from "node:test";
import assert from "node:assert/strict";
import { Scheduler } from "../src/core/scheduler.js";

const sig = () => new AbortController().signal;

test("Scheduler 并发额度与排队", async () => {
  const s = new Scheduler(2);
  const order = [];
  const p1 = s.acquire("a", sig()).then(() => order.push("a"));
  const p2 = s.acquire("b", sig()).then(() => order.push("b"));
  const p3 = s.acquire("c", sig()).then(() => order.push("c"));
  await Promise.all([p1, p2]);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(s.active.size, 2);
  assert.ok(!order.includes("c"));
  s.release("a");
  await p3;
  assert.equal(order.join(","), "a,b,c");
  s.release("b");
  s.release("c");
});

test("Scheduler 取消排队项抛 AbortError", async () => {
  const s = new Scheduler(1);
  const ctl = new AbortController();
  const p1 = s.acquire("a", sig());
  const p2 = s.acquire("b", ctl.signal);
  await p1;
  ctl.abort();
  await assert.rejects(() => p2, (e) => e.name === "AbortError");
  s.release("a");
});

test("Scheduler.sign 串行且约 500ms 节流", async () => {
  const s = new Scheduler(8);
  const marks = [];
  // 用单调时钟测间隔：Date.now() 会随系统校时回拨，导致间隔假跌破下限
  const t0 = performance.now();
  const r1 = s.sign(async () => { marks.push(performance.now() - t0); return 1; }, sig());
  const r2 = s.sign(async () => { marks.push(performance.now() - t0); return 2; }, sig());
  assert.equal(await r1, 1);
  assert.equal(await r2, 2);
  assert.equal(marks.length, 2);
  assert.ok(marks[1] - marks[0] >= 450, `两次签名间隔 ${marks[1] - marks[0]}ms，应约 500ms`);
});

test("Scheduler.sign 取消排队项时不追加 500ms 节流", async () => {
  const s = new Scheduler(8);
  const marks = [];
  const t0 = performance.now();
  const ctl = new AbortController();
  const r1 = s.sign(async () => { marks.push(performance.now() - t0); return 1; }, sig());
  // 排队中被取消的任务
  const r2 = s.sign(async () => { marks.push(performance.now() - t0); return 2; }, ctl.signal);
  ctl.abort();
  // r3 紧随其后，应只等 r1 结束，而不应为 r2 额外虚等 500ms
  const r3 = s.sign(async () => { marks.push(performance.now() - t0); return 3; }, sig());
  assert.equal(await r1, 1);
  await assert.rejects(() => r2, (e) => e.name === "AbortError");
  assert.equal(await r3, 3);
  assert.equal(marks.length, 2);
  // r3 应该在 r1 结束后的 500ms 左右启动，而不是 1000ms
  assert.ok(marks[1] - marks[0] < 800, `取消项未应造成额外 500ms 累积虚等：实际间隔 ${marks[1] - marks[0]}ms`);
});
