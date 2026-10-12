import assert from "node:assert/strict";
import { calculatePreviewLayout, getRatios, validatePlan, summarizePlan } from "./focus-options-layout.js";

const sizes = [[1920, 1080], [1280, 720], [1024, 768], [375, 600], [800, 220], [350, 1000], [150, 120], [1279.5, 719.5]];
let cases = 0;
const started = performance.now();
for (const mode of ["A", "B", "C", "D"]) {
  for (const profile of ["landscape", "mixed", "varied", "portrait"]) {
    for (const [width, height] of sizes) {
      for (let count = 1; count <= 16; count++) {
        const ratios = getRatios(count, profile);
        const plan = calculatePreviewLayout({ mode, width, height, secondaryRatios: ratios });
        assert.deepEqual(validatePlan(plan, ratios), [], `${mode}/${profile}/${width}×${height}/${count}`);
        assert.ok(plan.mainVideo.width <= plan.main.width + .01 && plan.mainVideo.height <= plan.main.height + .01);
        assert.ok(Math.abs(plan.mainVideo.width / plan.mainVideo.height - 16 / 9) < 1e-6);
        assert.ok(plan.main.width * plan.main.height >= 1.5 * Math.max(...plan.placements.map((room) => room.video.width * room.video.height)) - .01);
        const spans = plan.placements.map((room) => mode === "B" ? room.width : room.height);
        if ((mode === "A" || mode === "B") && spans.length) assert.ok(Math.max(...spans) - Math.min(...spans) < .01);
        else if (mode === "C" && spans.length) assert.ok(Math.max(...spans) / Math.min(...spans) <= 1.25 + 1e-7);
        if (mode === "D") {
          if (plan.justified && plan.gap === 0) assert.ok(Math.abs(summarizePlan(plan).layoutFillRatio - 1) < 1e-7);
          // 本次要求的正常墙面与 3–16 格必须找到贴边结构，不能再以有空位的质量参考兜底。
          if (count >= 3 && [[1280, 720], [1920, 1080], [1024, 768], [375, 600]].some(([w, h]) => w === width && h === height)) assert.equal(plan.justified, true);
        }
        assert.ok(summarizePlan(plan).smallBlackRatio < 1e-7);
        cases++;
      }
    }
  }
}
// 视频 metadata 未取得、源比例无效、主窗竖屏、宽屏与大间隔。
for (const mode of ["A", "B", "C", "D"]) {
  for (const mainRatio of [9 / 16, 4 / 3, 21 / 9]) {
    const ratios = [NaN, 0, Infinity, 9 / 16, 4 / 3, 1, 21 / 9];
    const options = { mode, width: 1280, height: 720, mainRatio, secondaryRatios: ratios, gap: 8 };
    const plan = calculatePreviewLayout(options);
    assert.deepEqual(validatePlan(plan, ratios), []);
    assert.ok(Math.abs(plan.mainVideo.width / plan.mainVideo.height - mainRatio) < 1e-6);
    assert.deepEqual(calculatePreviewLayout({ ...options, previous: plan.signature }).placements, plan.placements);
    assert.deepEqual(calculatePreviewLayout({ ...options, mainRatio: 16 / 9 }).placements, plan.placements);
    cases++;
  }
  assert.equal(calculatePreviewLayout({ mode, width: 0, height: 720, secondaryRatios: [1, 1] }), null);
}
// 贴边结果在 0px 间隔下覆盖整面墙，检验“满屏”没有把窗外空位算进主窗。
for (const profile of ["landscape", "mixed", "varied", "portrait"]) {
  for (let count = 3; count <= 16; count++) {
    const ratios = getRatios(count, profile);
    const plan = calculatePreviewLayout({ mode: "D", width: 1280, height: 720, gap: 0, secondaryRatios: ratios });
    assert.deepEqual(validatePlan(plan, ratios), []);
    assert.equal(plan.justified, true);
    assert.ok(Math.abs(summarizePlan(plan).layoutFillRatio - 1) < 1e-7);
    cases++;
  }
}

// 3/4 格不再强制双区；主窗比例变化不改变布局，软尺寸目标也不能阻止贴边。
for (const count of [3, 4]) {
  for (const profile of ["landscape", "mixed", "varied", "portrait"]) {
    const ratios = getRatios(count, profile);
    const options = { mode: "D", width: 1280, height: 720, secondaryRatios: ratios };
    const plan = calculatePreviewLayout(options);
    assert.ok(summarizePlan(plan).layoutFillRatio > .99);
    assert.deepEqual(calculatePreviewLayout({ ...options, mainRatio: 9 / 16 }).placements, plan.placements);
    assert.deepEqual(calculatePreviewLayout({ ...options, previous: plan.signature }).placements, plan.placements);
    cases++;
  }
}

// 单窗覆盖墙面；同墙比例的双窗不假报满屏；两种对照按同一面积口径统计。
assert.equal(summarizePlan(calculatePreviewLayout({ mode: "D", width: 1280, height: 720 })).coveredRatio, 1);
const pair = calculatePreviewLayout({ mode: "D", width: 1280, height: 720, secondaryRatios: [16 / 9] });
assert.equal(pair.justified, false);
assert.ok(summarizePlan(pair).vacantRatio > .01);
assert.equal(summarizePlan(pair).smallBlackRatio, 0);
const current = calculatePreviewLayout({ mode: "current", width: 1280, height: 720, secondaryRatios: getRatios(4, "mixed") });
const metrics = summarizePlan(current);
assert.ok(metrics.smallBlackRatio > 0);
assert.ok(Math.abs(metrics.coveredRatio - metrics.layoutFillRatio - metrics.smallBlackWallRatio) < 1e-7);
assert.ok(Math.abs(metrics.coveredRatio + metrics.vacantRatio - 1) < 1e-7);
cases += 3;
console.log(`通过 ${cases} 个几何场景：1–16 格、四种小窗比例、八种尺寸；小窗无黑边、主窗左上、边界、重叠、面积、稳定性与对照统计口径检查通过。耗时 ${((performance.now() - started) / 1000).toFixed(2)}s。`);
