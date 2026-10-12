import assert from "node:assert/strict";
import { calculateDesign, validateDesign } from "./focus-uniform-layout.js";
import { DEFAULT_RATIO, getRatios, summarizeDesign } from "./focus-replan-layout.js";

const sizes = [[1280, 720], [1920, 1080], [1024, 768], [375, 600], [800, 220], [350, 1000], [150, 120], [1279.5, 719.5]];
const fitArea = (width, height, ratio) => Math.min(width, height * ratio) ** 2 / ratio;
let cases = 0;
const started = performance.now();
const check = (options, label) => {
  const { mode, width, height, secondaryRatios: ratios, mainRatio = DEFAULT_RATIO } = options;
  const plan = calculateDesign(options);
  assert.deepEqual(validateDesign(plan, ratios), [], label);
  assert.ok(Math.abs(plan.mainVideo.width / plan.mainVideo.height - mainRatio) < 1e-7, label);
  assert.ok(plan.mainVideo.width <= plan.main.width + 1e-6 && plan.mainVideo.height <= plan.main.height + 1e-6, label);
  const summary = summarizeDesign(plan);
  assert.ok(summary.coveredRatio <= 1 + 1e-7 && summary.fillRatio <= summary.coveredRatio + 1e-7, label);
  assert.ok(summary.smallBlackRatio < 1e-7, label);
  assert.ok(summary.mainVideoArea >= fitArea(width, height, mainRatio) * (mode === "V" ? .6 : .52) - 1e-6, label);
  if (ratios.length) {
    assert.ok(summary.mainProminence >= (ratios.length > 1 ? 2.5 : 1.5) - 1e-6, label);
    const first = plan.placements[0];
    for (const room of plan.placements) {
      assert.equal(room.width, first.width, label);
      assert.equal(room.height, first.height, label);
      assert.equal(room.fit, "cover", label);
      assert.ok(Math.abs(room.retained - room.width * room.height / (room.video.width * room.video.height)) < 1e-7, label);
      if (mode === "V") assert.ok(Math.abs(room.width / room.height - DEFAULT_RATIO) < 1e-7, label);
    }
    // 包含尾行，不能用最后一个小窗变大来填空。
    assert.deepEqual(plan.placements.map((room) => room.index), ratios.map((_, index) => index), label);
  }
  if (options.gap === 0 && mode !== "V") assert.ok(Math.abs(summary.coveredRatio - 1) < 1e-7, label);
  const rectangles = [plan.main, ...plan.placements];
  for (let index = 0; index < rectangles.length; index++) {
    for (const other of rectangles.slice(index + 1)) {
      const room = rectangles[index];
      assert.ok(Math.min(room.x + room.width, other.x + other.width) - Math.max(room.x, other.x) < 1e-6
        || Math.min(room.y + room.height, other.y + other.height) - Math.max(room.y, other.y) < 1e-6, label);
    }
  }
  cases++;
  return plan;
};

for (const mode of ["U", "V", "W"]) {
  for (const profile of ["landscape", "mixed", "varied", "portrait"]) {
    for (const [width, height] of sizes) {
      for (let count = 1; count <= 16; count++) check({ mode, width, height, secondaryRatios: getRatios(count, profile) }, `${mode}/${count}/${profile}/${width}×${height}`);
    }
  }
  for (const mainRatio of [9 / 16, 4 / 3, 21 / 9]) {
    for (const count of [3, 4, 16]) {
      const options = { mode, width: 1280, height: 720, mainRatio, secondaryRatios: getRatios(count, "varied"), gap: 8 };
      const plan = check(options, `${mode}/${count}/主窗${mainRatio}`);
      assert.deepEqual(calculateDesign({ ...options, previous: plan.signature }).placements, plan.placements);
    }
  }
  for (let count = 2; count <= 16; count++) check({ mode, width: 1280, height: 720, secondaryRatios: getRatios(count, "mixed"), gap: 0 }, `${mode}/${count}/0px`);
  for (const [width, height] of [[100, 4320], [7680, 100], [100, 100]]) {
    for (const count of [2, 3, 4, 16]) check({ mode, width, height, secondaryRatios: getRatios(count, "varied"), gap: 8 }, `${mode}/${count}/极值${width}×${height}`);
  }
  check({ mode, width: 1280, height: 720, secondaryRatios: [NaN, Infinity, 0, 9 / 16] }, `${mode}/未知比例`);
  assert.equal(calculateDesign({ mode, width: 0, height: 720 }), null);
  assert.equal(calculateDesign({ mode, width: 1280, height: 720, secondaryRatios: Array(16).fill(DEFAULT_RATIO) }), null);
}

console.log(`通过 ${cases} 个同尺寸场景：小窗宽高完全一致、尾行、源比例、裁切、无黑边、主窗面积、边界、无重叠与零间隔覆盖。耗时 ${((performance.now() - started) / 1000).toFixed(2)}s。`);
