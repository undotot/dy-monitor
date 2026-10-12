import assert from "node:assert/strict";
import { calculateDesign, validateDesign } from "./focus-percent-native-layout.js";
import { getRatios, summarizeDesign } from "./focus-replan-layout.js";

const sizes = [[1280, 720], [1920, 1080], [1024, 768], [375, 600], [800, 220], [350, 1000], [100, 4320], [7680, 100]];
const black = (plan) => 1 - plan.mainVideo.width * plan.mainVideo.height / (plan.main.width * plan.main.height);
let cases = 0;
for (const profile of ["landscape", "mixed", "varied", "portrait"]) {
  for (const [width, height] of sizes) {
    for (let count = 1; count <= 16; count++) {
      const secondaryRatios = getRatios(count, profile);
      const plans = ["N", "C"].map((mode) => {
        const plan = calculateDesign({ mode, width, height, secondaryRatios });
        const label = `${mode}/${profile}/${count}/${width}×${height}`;
        assert.ok(plan, label);
        assert.deepEqual(validateDesign(plan, secondaryRatios), [], label);
        assert.equal(plan.main.x, 0, label);
        assert.equal(plan.main.y, 0, label);
        assert.ok(summarizeDesign(plan).smallBlackRatio < 1e-7, label);
        for (const room of plan.placements) {
          assert.equal(room.retained, 1, label);
          assert.ok(Math.abs(room.width / room.height - secondaryRatios[room.index]) < 1e-7, label);
        }
        cases++;
        return plan;
      });
      assert.ok(summarizeDesign(plans[0]).coveredRatio >= summarizeDesign(plans[1]).coveredRatio - .0200001);
      assert.ok(black(plans[0]) <= black(plans[1]) + 1e-7);
    }
  }
}
// 同比例缩放时百分比应稳定；不同墙面比例重新求解，不硬套百分数。
for (const mode of ["N", "C"]) {
  for (const count of [3, 4, 16]) {
    for (const mainRatio of [9 / 16, 4 / 3, 21 / 9]) {
      const options = { mode, width: 1280, height: 720, mainRatio, secondaryRatios: getRatios(count, "mixed") };
      const first = calculateDesign(options), scaled = calculateDesign({ ...options, width: 2560, height: 1440 });
      assert.deepEqual(validateDesign(first, options.secondaryRatios), []);
      assert.deepEqual(validateDesign(scaled, options.secondaryRatios), []);
      for (const [index, rectangle] of [first.percentages.main, ...first.percentages.placements].entries()) {
        const other = [scaled.percentages.main, ...scaled.percentages.placements][index];
        for (const key of ["x", "y", "width", "height"]) assert.ok(Math.abs(rectangle[key] - other[key]) < 1e-5);
      }
      cases += 2;
    }
  }
}
console.log(`通过 ${cases} 个场景：短边一致、完整原比例、无小窗黑边、百分比边界、缩放稳定与主窗黑边取舍。`);
