import test from "node:test";
import assert from "node:assert/strict";
import { calculateFocusLayout } from "../src/core/focus-layout.js";
import { auditRecursiveLayout } from "../src/core/focus-layout-geometry.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const planFor = (width, height, count, ratio = 16 / 9, extra = {}) => calculateFocusLayout({ width, height,
  mainRatio: ratio, secondaryRatios: Array(count - 1).fill(ratio), ...extra });

test("正式放大模式的 1–16 房及横竖源：等大、无黑边、无空洞、无重叠且全部同屏", () => {
  for (const [width, height] of [[1920, 1080], [1280, 720], [1024, 620], [375, 600], [150, 120],
    [800, 220], [350, 1000], [2552, 1227]]) for (const ratio of [16 / 9, 9 / 16]) for (let count = 1; count <= 16; count++) {
    const plan = planFor(width, height, count, ratio);
    const tag = `${width}x${height}/${ratio}/${count}`;
    assert.equal(plan.status, "ready", tag);
    assert.ok(auditRecursiveLayout(plan.layoutPlan, count).valid, tag);
    assert.equal(plan.placements.length, count - 1);
    assert.equal(new Set(plan.placements.map((room) => room.index)).size, count - 1);
    const boxes = [plan.main, ...plan.placements];
    for (const box of boxes) {
      assert.ok(box.x >= -1e-7 && box.y >= -1e-7 && box.x + box.width <= width + 1e-7 && box.y + box.height <= height + 1e-7, tag);
      close(box.width / box.height, ratio);
    }
    for (const room of plan.placements) {
      close(room.width, plan.cell.width);
      close(room.height, plan.cell.height);
      close(room.video.width, room.width);
      close(room.video.height, room.height);
    }
    const area = boxes.reduce((sum, box) => sum + box.width * box.height, 0);
    close(area / (plan.containerW * plan.containerH), 1);
    close(plan.viewportFillRatio, area / (width * height));
    close(plan.offsetX * 2 + plan.containerW, width);
    close(plan.offsetY * 2 + plan.containerH, height);
    assert.ok(plan.offsetX < 1e-7 || plan.offsetY < 1e-7, tag);
    assert.ok((plan.layoutPlan.metrics.mainToAverageVideo ?? 1) <= 16 + 1e-7, tag);
    assert.equal(plan.overflow, false);
  }
});

test("小数尺寸不取整，不越界且所有画面在整体矩形内精确闭合", () => {
  for (const [width, height] of [[1280, 719.5], [2246.25, 994.125], [319.5, 517.25]]) {
    for (const count of [5, 8, 10, 12, 14, 16]) {
      const plan = planFor(width, height, count);
      assert.ok(auditRecursiveLayout(plan.layoutPlan, count).valid);
      close(plan.offsetX * 2 + plan.containerW, width);
      close(plan.offsetY * 2 + plan.containerH, height);
      assert.ok([plan.main, ...plan.placements].every((box) => box.y + box.height <= height + 1e-7));
    }
  }
});

test("等比跨屏缩放复用拓扑且坐标同步缩放，进入竖屏后重新选优", () => {
  const initial = planFor(2246, 994, 12);
  const doubled = planFor(4492, 1988, 12, 16 / 9, { previous: initial });
  assert.equal(doubled.signature, initial.signature);
  for (const [index, box] of [doubled.main, ...doubled.placements].entries()) {
    const old = [initial.main, ...initial.placements][index];
    for (const key of ["x", "y", "width", "height"]) close(box[key], old[key] * 2);
  }
  const portrait = planFor(390, 844, 12, 16 / 9, { previous: doubled });
  assert.notEqual(portrait.signature, initial.signature);
  assert.equal(portrait.layoutPlan.anchor, "top-left");
  assert.ok(auditRecursiveLayout(portrait.layoutPlan, 12).valid);
});

test("小窗可读尺寸不作为布局门槛；极窄画墙仍统一缩小全部同屏", () => {
  for (const [width, height] of [[150, 120], [800, 220], [350, 1000]]) {
    const plan = planFor(width, height, 16);
    assert.equal(plan.constrained, true);
    assert.equal(plan.overflow, false);
    assert.ok(plan.cell.width < 120);
    assert.ok(auditRecursiveLayout(plan.layoutPlan, 16).valid);
  }
});
