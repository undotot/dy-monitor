import assert from "node:assert/strict";
import { calculateDesign, validateDesign } from "./focus-short-side-layout.js";
import { DEFAULT_RATIO, calculateDesign as calculatePrevious, getRatios, summarizeDesign } from "./focus-replan-layout.js";

const sizes = [[1280, 720], [1920, 1080], [1024, 768], [375, 600], [800, 220], [350, 1000], [150, 120], [1279.5, 719.5]];
const targets = { F: .45, B: .52, M: .6 };
const fitArea = (width, height, ratio) => Math.min(width, height * ratio) ** 2 / ratio;
let cases = 0;
const started = performance.now();
const check = (options, label) => {
  const { mode, width, height, secondaryRatios: ratios, mainRatio = DEFAULT_RATIO } = options;
  const plan = calculateDesign(options);
  assert.deepEqual(validateDesign(plan, ratios), [], label);
  const summary = summarizeDesign(plan);
  assert.equal(summary.averageRetention, 1, label);
  assert.equal(summary.minimumRetention, 1, label);
  assert.ok(summary.smallBlackRatio < 1e-7, label);
  assert.ok(Math.abs(plan.mainVideo.width / plan.mainVideo.height - mainRatio) < 1e-7, label);
  assert.ok(summary.mainVideoArea >= fitArea(width, height, mainRatio) * targets[mode] - 1e-6, label);
  assert.ok(summary.fillRatio <= summary.coveredRatio + 1e-7 && summary.coveredRatio <= 1 + 1e-7, label);
  if (ratios.length) {
    assert.ok(summary.mainProminence >= 2.5 - 1e-6, label);
    const expectedShort = Math.min(plan.placements[0].width, plan.placements[0].height);
    for (const room of plan.placements) {
      assert.ok(Math.abs(Math.min(room.width, room.height) - expectedShort) < 1e-7, label);
      assert.equal(room.fit, "contain", label);
      assert.equal(room.retained, 1, label);
      assert.equal(room.width, room.video.width, label);
      assert.equal(room.height, room.video.height, label);
    }
    assert.deepEqual(plan.placements.map((room) => room.index), ratios.map((_, index) => index), label);
    if (ratios.length >= 4) assert.ok(summary.rightCount > 0 && summary.bottomCount > 0, label);
  }
  cases++;
  return plan;
};

for (const mode of ["F", "B", "M"]) {
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
  for (const gap of [0, .5, 8]) {
    for (const count of [2, 3, 4, 8, 16]) check({ mode, width: 1280, height: 720, secondaryRatios: getRatios(count, "mixed"), gap }, `${mode}/${count}/间隔${gap}`);
  }
  for (const [width, height] of [[100, 4320], [7680, 100], [100, 100]]) {
    for (const count of [2, 3, 4, 16]) check({ mode, width, height, secondaryRatios: getRatios(count, "varied"), gap: 8 }, `${mode}/${count}/极值${width}×${height}`);
  }
  check({ mode, width: 1280, height: 720, secondaryRatios: [NaN, Infinity, 0, 9 / 16] }, `${mode}/未知比例`);
  assert.equal(calculateDesign({ mode, width: 0, height: 720 }), null);
  assert.equal(calculateDesign({ mode, width: 1280, height: 720, secondaryRatios: Array(16).fill(DEFAULT_RATIO) }), null);
}

const options = { width: 1280, height: 720, secondaryRatios: getRatios(4, "mixed") };
assert.deepEqual(calculateDesign({ ...options, mode: "M" }).placements, calculatePrevious({ ...options, mode: "Q" }).placements);
assert.deepEqual(calculateDesign({ ...options, mode: "current" }), calculatePrevious({ ...options, mode: "current" }));
cases += 2;
console.log(`通过 ${cases} 个场景：统一短边、完整原画 100%、无裁切、无黑边、尾行、双侧分配、比例、边界、主视频大小和旧算法一致性。耗时 ${((performance.now() - started) / 1000).toFixed(2)}s。`);
