import test from "node:test";
import assert from "node:assert/strict";
import { calculateFocusLayout, resolveFocusLayout } from "../src/core/focus-layout.js";
import { auditRecursiveLayout } from "../src/core/focus-layout-geometry.js";

const RATIO = 16 / 9;
const optionsFor = (count, width = 2246, height = 994) => ({ width, height, secondaryRatios: Array(count - 1).fill(RATIO) });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

test("无效视口、超出房间上限和重复身份不生成布局", () => {
  for (const [width, height] of [[0, 720], [NaN, 720], [1280, Infinity], [1, 600], [1280, 2]])
    assert.equal(calculateFocusLayout(optionsFor(8, width, height)), null);
  assert.equal(calculateFocusLayout({ ...optionsFor(16), secondaryRatios: Array(16).fill(RATIO) }), null);
  assert.equal(calculateFocusLayout({ ...optionsFor(3), secondaryRatios: null }), null);
  assert.equal(calculateFocusLayout({ ...optionsFor(3), secondaryRoomIds: null }), null);
  assert.equal(calculateFocusLayout({ ...optionsFor(3), mainRoomId: "a", secondaryRoomIds: ["a", "b"] }), null);
});

test("单房间按源比例生成画格，外部只在一条轴留白", () => {
  for (const [width, height] of [[1280, 720], [600, 1280]]) {
    const plan = calculateFocusLayout(optionsFor(1, width, height));
    assert.equal(plan.absolute, true);
    assert.equal(plan.layoutShape, "single");
    assert.deepEqual(plan.placements, []);
    close(plan.main.width / plan.main.height, RATIO);
    close(plan.mainVideo.width, plan.main.width);
    close(plan.mainVideo.height, plan.main.height);
    close(plan.offsetX * 2 + plan.containerW, width);
    close(plan.offsetY * 2 + plan.containerH, height);
    assert.ok(plan.offsetX < 1e-7 || plan.offsetY < 1e-7);
  }
});

test("正式放大模式采用已选综合规则，关键场景与共用预览一致", () => {
  for (const [count, area, coverage, shape] of [[5, 16, 0.9834767982586328, "right-strip"],
    [8, 9, 0.7867814386069061, "l-shape"], [10, 16, 0.7867814386069061, "l-shape"],
    [12, 9, 0.9834767982586328, "u-shape"], [15, 16, 0.9441377263282873, "u-shape"]]) {
    const plan = calculateFocusLayout(optionsFor(count));
    assert.equal(plan.selection.priority, "compromise");
    assert.equal(plan.selection.sizeRange.target, 6);
    assert.equal(plan.layoutShape, shape);
    close(plan.layoutPlan.metrics.mainToAverageVideo, area);
    close(plan.viewportFillRatio, coverage);
    close(plan.layoutFillRatio, 1);
    assert.ok(auditRecursiveLayout(plan.layoutPlan, count).valid);
    assert.equal(plan.mainVisible, 1);
    assert.equal(plan.meanVisible, 1);
    assert.equal(plan.gap, 0);
  }
});

test("房间身份与副窗索引在左右及底部坐标转换后保持正确", () => {
  const ids = Array.from({ length: 11 }, (_, index) => `room-${index}`);
  const plan = calculateFocusLayout({ ...optionsFor(12), mainRoomId: "focus", secondaryRoomIds: ids });
  assert.equal(plan.leftCount, 3);
  assert.equal(plan.rightCount, 3);
  assert.equal(plan.bottomCount, 5);
  for (const placement of plan.placements) {
    const original = plan.layoutPlan.rects.find((rect) => rect.roomId === ids[placement.index]);
    assert.ok(original);
    for (const key of ["x", "y", "width", "height"]) close(placement[key], original[key]);
    close(placement.width, plan.cell.width);
    close(placement.height, plan.cell.height);
  }
  assert.deepEqual([...plan.placements.map((room) => room.index)].sort((a, b) => a - b), ids.map((_, index) => index));
});

test("副窗比例冲突明确返回不可行，主窗不同源比例仍生成真实几何", () => {
  const failure = calculateFocusLayout({ ...optionsFor(4), secondaryRatios: [RATIO, 9 / 16, RATIO] });
  assert.equal(failure.status, "infeasible");
  assert.equal(failure.code, "SECONDARY_RATIO_MISMATCH");
  for (const mainRatio of [4 / 3, 9 / 16, 21 / 9]) {
    const plan = calculateFocusLayout({ ...optionsFor(8), mainRatio });
    assert.equal(plan.status, "ready");
    close(plan.main.width / plan.main.height, mainRatio);
    close(plan.mainVideo.width, plan.main.width);
    assert.ok(auditRecursiveLayout(plan.layoutPlan, 8).valid);
  }
  const fallback = calculateFocusLayout({ ...optionsFor(3), mainRatio: NaN, secondaryRatios: [0, Infinity] });
  close(fallback.main.width / fallback.main.height, RATIO);
  assert.ok(fallback.placements.every((room) => Math.abs(room.width / room.height - RATIO) < 1e-7));
});

test("临界缩放收益不足 2 个百分点保留旧排列，明显收益及目标变化立即切换", () => {
  const initial = calculateFocusLayout(optionsFor(5, 2630, 1000));
  const cold = calculateFocusLayout(optionsFor(5, 2640, 1000));
  close(initial.layoutPlan.metrics.mainToAverageVideo, 16);
  close(cold.layoutPlan.metrics.mainToAverageVideo, 4);
  const stable = calculateFocusLayout({ ...optionsFor(5, 2640, 1000), previous: initial });
  assert.equal(stable.signature, initial.signature);
  assert.equal(stable.selection.stabilized, true);
  assert.notEqual(stable.main.x, initial.main.x);
  const switched = calculateFocusLayout({ ...optionsFor(5, 2700, 1000), previous: stable });
  close(switched.layoutPlan.metrics.mainToAverageVideo, 4);
  const changedTarget = calculateFocusLayout({ ...optionsFor(5, 2640, 1000), mainWeight: 4, previous: initial });
  close(changedTarget.layoutPlan.metrics.mainToAverageVideo, 4);
  const oldSignature = calculateFocusLayout({ ...optionsFor(5, 2640, 1000), previous: "A3:R:2:1:2:1:cells:4" });
  assert.equal(oldSignature.signature, cold.signature);
});

test("更换主窗或源比例后不沿用旧场景的稳定偏好", () => {
  const options = { ...optionsFor(5, 2630, 1000), mainRoomId: "a", secondaryRoomIds: ["b", "c", "d", "e"] };
  const previous = calculateFocusLayout(options);
  const changed = calculateFocusLayout({ ...options, width: 2640, mainRoomId: "b", secondaryRoomIds: ["a", "c", "d", "e"], previous });
  close(changed.layoutPlan.metrics.mainToAverageVideo, 4);
  assert.equal(changed.selection.stabilized, false);
  assert.equal(changed.layoutPlan.rects[0].roomId, "b");
  const portrait = calculateFocusLayout({ ...options, mainRatio: 9 / 16, secondaryRatios: Array(4).fill(9 / 16), previous });
  assert.equal(portrait.selection.stabilized, false);
  assert.ok(auditRecursiveLayout(portrait.layoutPlan, 5).valid);
});

test("14 房回退完整等大网格，2 房保持几何允许的等大画面", () => {
  for (const count of [2, 14]) {
    const plan = calculateFocusLayout(optionsFor(count));
    for (const room of plan.placements) {
      close(room.width, plan.main.width);
      close(room.height, plan.main.height);
    }
    assert.equal(plan.fallback, count === 14);
    assert.ok(auditRecursiveLayout(plan.layoutPlan, count).valid);
  }
});

test("指定主窗比例冲突时，枚举其他主窗；1个异比例房间可作为主窗保留放大", () => {
  for (const [width, height] of [[2246, 994], [1194, 834], [600, 900]]) {
    for (const count of [3, 5, 8, 14, 16]) {
      for (const [mainRatio, smallRatio] of [[9 / 16, RATIO], [RATIO, 9 / 16], [4 / 3, RATIO]]) {
        const rooms = Array.from({ length: count }, (_, index) => ({ id: `room-${index}`, ratio: index === count - 1 ? mainRatio : smallRatio }));
        const resolved = resolveFocusLayout({ width, height, rooms, mainRoomId: "room-0" });
        assert.equal(resolved.mainChanged, true);
        assert.equal(resolved.mainRoomId, `room-${count - 1}`);
        assert.equal(resolved.requestedMainRoomId, "room-0");
        assert.equal(resolved.plan.status, "ready");
        assert.equal(auditRecursiveLayout(resolved.plan.layoutPlan, count).valid, true);
        close(resolved.plan.main.width / resolved.plan.main.height, mainRatio);
        for (const placement of resolved.plan.placements) {
          close(placement.width / placement.height, smallRatio);
          const original = resolved.plan.layoutPlan.rects.find((rect) => rect.roomId === resolved.secondaryRoomIds[placement.index]);
          assert.ok(original);
          close(placement.x, original.x);
          close(placement.y, original.y);
        }
        const repeated = resolveFocusLayout({ width, height, rooms, mainRoomId: resolved.mainRoomId, previous: resolved.plan });
        assert.equal(repeated.mainChanged, false);
        assert.equal(repeated.plan.signature, resolved.plan.signature);
      }
    }
  }
});

test("当前主窗可行时保持用户选择，全部主窗不可行才报告场景冲突", () => {
  const options = { width: 1920, height: 1080, rooms: [
    { id: "a", ratio: RATIO }, { id: "b", ratio: RATIO }, { id: "c", ratio: 9 / 16 },
  ] };
  assert.equal(resolveFocusLayout({ ...options, mainRoomId: "c" }).mainChanged, false);
  const same = { ...options, rooms: options.rooms.map((room) => ({ ...room, ratio: RATIO })) };
  assert.equal(resolveFocusLayout({ ...same, mainRoomId: "b" }).mainRoomId, "b");
  const impossible = resolveFocusLayout({ ...options, mainRoomId: "a", rooms: [
    ...options.rooms, { id: "d", ratio: 9 / 16 },
  ] });
  assert.equal(impossible.plan.status, "infeasible");
  assert.equal(impossible.plan.code, "SECONDARY_RATIO_MISMATCH");
  assert.equal(impossible.mainChanged, false);
  // 无尺寸时等待真实测量，不擅自换主窗。
  assert.equal(resolveFocusLayout({ ...options, mainRoomId: "a", width: 0 }).plan, null);
  assert.equal(resolveFocusLayout({ ...options, mainRoomId: "missing" }), null);
  assert.equal(resolveFocusLayout({ ...options, rooms: null }), null);
  assert.equal(resolveFocusLayout({ ...options, rooms: [{ id: "a", ratio: RATIO }, { id: "a", ratio: RATIO }] }), null);
});
