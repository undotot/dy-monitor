import assert from "node:assert/strict";
import { calculateDesign, validateDesign } from "./focus-strict-fill-layout.js";
import { getRatios, summarizeDesign } from "./focus-replan-layout.js";

// 覆盖横屏、竖屏、混合源、低格和极窄墙面，直接检查几何覆盖而非四舍五入的 UI 指标。
const sizes = [[1280, 720], [1920, 1080], [1024, 768], [375, 600], [800, 220], [350, 1000], [100, 4320], [7680, 100]];
let cases = 0;
const check = (options) => {
  const label = JSON.stringify(options);
  const plan = calculateDesign(options);
  assert.ok(plan, label);
  assert.deepEqual(validateDesign(plan, options.secondaryRatios), [], label);
  assert.equal(plan.main.x, 0, label);
  assert.equal(plan.main.y, 0, label);
  assert.equal(plan.gap, 0, label);
  const summary = summarizeDesign(plan);
  assert.ok(Math.abs(summary.coveredRatio - 1) < 1e-7, label);
  assert.ok(summary.smallBlackRatio < 1e-7, label);
  const mainRatio = options.mainRatio ?? 16 / 9;
  assert.ok(Math.abs(plan.mainVideo.width / plan.mainVideo.height - mainRatio) < 1e-7, label);
  for (const room of plan.placements) {
    assert.equal(room.width, plan.placements[0].width, label);
    assert.equal(room.height, plan.placements[0].height, label);
    assert.equal(room.fit, "cover", label);
    assert.ok(Math.abs(room.video.width / room.video.height - options.secondaryRatios[room.index]) < 1e-7, label);
  }
  cases++;
};

for (const mode of ["W", "U"]) {
  for (const profile of ["landscape", "mixed", "varied", "portrait"]) {
    for (const [width, height] of sizes) {
      for (let count = 1; count <= 16; count++) check({ mode, width, height, secondaryRatios: getRatios(count, profile) });
    }
  }
  for (const mainRatio of [9 / 16, 4 / 3, 21 / 9]) {
    for (const count of [3, 4, 16]) check({ mode, width: 1280, height: 720, mainRatio, secondaryRatios: getRatios(count, "mixed") });
  }
}
assert.equal(calculateDesign({ mode: "V", width: 1280, height: 720, secondaryRatios: [] }), null);
console.log(`通过 ${cases} 个严格铺满场景：覆盖 100%、小窗同宽同高、主窗左上、源比例与无小窗黑边。`);
