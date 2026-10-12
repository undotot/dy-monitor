import assert from "node:assert/strict";
import { calculateDesign, getRatios, summarizeDesign, validateDesign } from "./focus-replan-layout.js";
import { calculateFocusLayout } from "../src/core/focus-layout.js";

const sizes = [[1280, 720], [1920, 1080], [1024, 768], [375, 600], [800, 220], [350, 1000], [150, 120], [1279.5, 719.5]];
const fitArea = (width, height, ratio) => Math.min(width, height * ratio) ** 2 / ratio;
let cases = 0, nativeFallbacks = 0;
const started = performance.now();
for (const mode of ["P", "Q", "R"]) {
  for (const profile of ["landscape", "mixed", "varied", "portrait"]) {
    for (const [width, height] of sizes) {
      for (let count = 1; count <= 16; count++) {
        const ratios = getRatios(count, profile);
        const plan = calculateDesign({ mode, width, height, secondaryRatios: ratios });
        assert.deepEqual(validateDesign(plan, ratios), [], `${mode}/${count}/${profile}/${width}×${height}`);
        const summary = summarizeDesign(plan);
        assert.ok(summary.coveredRatio <= 1 + 1e-7 && summary.fillRatio <= summary.coveredRatio + 1e-7);
        assert.ok(summary.smallBlackRatio < 1e-7);
        assert.ok(plan.mainVideo.width <= plan.main.width + .01 && plan.mainVideo.height <= plan.main.height + .01);
        assert.ok(Math.abs(plan.mainVideo.width / plan.mainVideo.height - 16 / 9) < 1e-6);
        if (mode === "Q") {
          assert.ok(summary.mainVideoArea >= fitArea(width, height, 16 / 9) * .6 - .01);
          if (count > 1) assert.ok(summary.mainProminence >= 2.5 - 1e-6);
          const shortSides = plan.placements.map((room) => Math.min(room.width, room.height));
          if (shortSides.length) assert.ok(Math.max(...shortSides) - Math.min(...shortSides) < .01);
        }
        if (mode === "R") {
          assert.ok(summary.mainVideoArea >= fitArea(width, height, 16 / 9) * .52 - .01);
          if (count > 2) assert.ok(summary.mainProminence >= 2.5 - 1e-6);
          assert.ok(summary.averageRetention > 0 && summary.averageRetention <= 1 + 1e-7);
          for (const room of plan.placements) assert.ok(Math.abs(room.retained - room.width * room.height / (room.video.width * room.video.height)) < 1e-6);
        } else assert.equal(summary.averageRetention, 1);
        if (mode === "P" && plan.fallback) nativeFallbacks++;
        cases++;
      }
    }
  }
}

for (const mode of ["P", "Q", "R"]) {
  for (const mainRatio of [9 / 16, 4 / 3, 21 / 9]) {
    for (const count of [3, 4, 16]) {
      const ratios = getRatios(count, "varied");
      const options = { mode, width: 1280, height: 720, mainRatio, secondaryRatios: ratios, gap: 8 };
      const plan = calculateDesign(options);
      assert.deepEqual(validateDesign(plan, ratios), []);
      assert.ok(Math.abs(plan.mainVideo.width / plan.mainVideo.height - mainRatio) < 1e-6);
      assert.deepEqual(calculateDesign({ ...options, previous: plan.signature }).placements, plan.placements);
      cases++;
    }
  }
}

// 0px 检验真正贴边，避免把主界面背景计为矩形覆盖；重点回归 3/4 格。
for (const mode of ["P", "R"]) {
  for (const profile of ["landscape", "mixed", "varied", "portrait"]) {
    for (let count = 3; count <= 16; count++) {
      const ratios = getRatios(count, profile);
      const plan = calculateDesign({ mode, width: 1280, height: 720, secondaryRatios: ratios, gap: 0 });
      assert.deepEqual(validateDesign(plan, ratios), []);
      assert.equal(plan.complete, true);
      assert.ok(Math.abs(summarizeDesign(plan).coveredRatio - 1) < 1e-7);
      cases++;
    }
  }
}

const threeRatios = getRatios(3, "landscape");
const native = summarizeDesign(calculateDesign({ mode: "P", width: 1280, height: 720, secondaryRatios: threeRatios, gap: 0 }));
const mainFirst = summarizeDesign(calculateDesign({ mode: "Q", width: 1280, height: 720, secondaryRatios: threeRatios, gap: 0 }));
const cover = summarizeDesign(calculateDesign({ mode: "R", width: 1280, height: 720, secondaryRatios: threeRatios, gap: 0 }));
assert.ok(Math.abs(native.mainProminence - 1) < 1e-7);
assert.ok(mainFirst.mainVideoRatio >= .6 && mainFirst.backgroundRatio > .01);
assert.ok(cover.mainVideoRatio >= .52 && cover.averageRetention < .6);
cases += 3;

// 未取得元数据与无效输入；当前对照几何必须与源码一致。
for (const mode of ["P", "Q", "R"]) {
  const ratios = [NaN, Infinity, 0, 9 / 16, 4 / 3];
  assert.deepEqual(validateDesign(calculateDesign({ mode, width: 1280, height: 720, secondaryRatios: ratios }), ratios), []);
  assert.equal(calculateDesign({ mode, width: 0, height: 720 }), null);
  assert.equal(calculateDesign({ mode, width: 1280, height: -1 }), null);
  cases++;
}
// 自定义表单允许的长宽极值也必须给出可检查的布局。
for (const [width, height] of [[100, 4320], [7680, 100], [100, 100]]) {
  for (const mode of ["P", "Q", "R"]) {
    for (const count of [2, 3, 4, 16]) {
      const ratios = getRatios(count, "varied");
      assert.deepEqual(validateDesign(calculateDesign({ mode, width, height, secondaryRatios: ratios }), ratios), [], `${mode}/${count}/${width}×${height}`);
      cases++;
    }
  }
}
const source = calculateFocusLayout({ width: 1280, height: 720, secondaryRatios: getRatios(4, "mixed") });
const current = calculateDesign({ mode: "current", width: 1280, height: 720, secondaryRatios: getRatios(4, "mixed") });
assert.deepEqual(current.main, { ...source.main, x: 0, y: 0 });
for (const room of current.placements) {
  const original = source.placements.find((item) => item.index === room.index);
  assert.equal(room.width, original.width);
  assert.equal(room.height, original.height);
  assert.equal(room.x, original.x + (room.region === "right" ? source.main.width + source.gap : 0));
  assert.equal(room.y, original.y + (room.region === "bottom" ? source.main.height + source.gap : 0));
}
cases++;
console.log(`通过 ${cases} 个设计场景；原比例、边界、无重叠、主画面大小、裁切保留率、真覆盖、稳定性与源码对照检查通过。P 在 ${nativeFallbacks} 个场景使用完整画面兜底（包含双窗限制）。耗时 ${((performance.now() - started) / 1000).toFixed(2)}s。`);
