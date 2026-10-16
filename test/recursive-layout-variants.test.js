import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import { auditRecursiveLayout, calculateRecursiveLayout, enumerateRecursiveLayouts, coverageSizeBalanceScore } from "../preview/recursive-layout-engine.js";
import { LAYOUT_VARIANTS, calculateLayoutVariant, compareLayoutVariants, auditLayoutVariant } from "../preview/recursive-layout-variants.js";

const optionsFor = (count, width = 2246, height = 994, ratio = 16 / 9) => ({ width, height,
  rooms: Array.from({ length: count }, (_, index) => ({ id: String(index + 1), ratio })), mainRoomId: "1", mainWeight: 4, priority: "coverage" });
const assertUniform = (plan) => {
  const small = plan.rects.filter((rect) => rect.role === "secondary");
  for (const rect of small) {
    assert.equal(rect.width, small[0].width);
    assert.equal(rect.height, small[0].height);
  }
  assert.equal(plan.metrics.secondaryEqual, true);
  assert.ok(plan.metrics.secondarySizes.length <= 1);
};

test("8 房展示三种可行的等大小窗排列，不以不同尺寸冒充额外方案", () => {
  const plans = compareLayoutVariants(optionsFor(8));
  assert.equal(plans.length, 5);
  const expected = [0.8991787869793212, 0.688433758781043, 0.7867814386069061];
  for (let index = 0; index < 3; index++) {
    const plan = plans[index];
    assert.ok(auditLayoutVariant(plan, 8).valid);
    assertUniform(plan);
    assert.ok(Math.abs(plan.metrics.videoCoverage - expected[index]) < 1e-10);
    const actualArea = plan.rects.reduce((area, rect) => area + rect.video.width * rect.video.height, 0);
    assert.ok(Math.abs(actualArea / (2246 * 994) - plan.metrics.videoCoverage) < 1e-12);
  }
  assert.equal(plans[0].layoutShape, "right-strip");
  assert.equal(plans[1].layoutShape, "bottom-strip");
  assert.equal(plans[2].layoutShape, "l-shape");
  for (const plan of plans.slice(3)) {
    assert.equal(plan.status, "infeasible");
    assert.equal(plan.code, "ARRANGEMENT_UNAVAILABLE");
    assert.deepEqual(plan.rects, []);
    assert.match(plan.reason, /小窗等大/);
  }
});

test("9 房的五种结构均可行，左右及底部也严格共用同一小窗宽高", () => {
  const plans = compareLayoutVariants(optionsFor(9));
  assert.equal(new Set(plans.map((plan) => plan.layoutShape)).size, 5);
  for (const plan of plans) {
    assert.ok(auditLayoutVariant(plan, 9).valid, plan.variant.id);
    assertUniform(plan);
    if (["sides", "surround"].includes(plan.variant.id)) {
      const main = plan.rects.find((rect) => rect.role === "main");
      assert.ok(Math.abs(main.x + main.width / 2 - plan.width / 2) < 1e-7);
      assert.equal(main.y, plan.bounds.y);
    }
  }
});

test("1–16 房、三种画墙与横竖视频源：所有可行方案必须通过同一等大几何审计", () => {
  for (const [width, height] of [[2246, 994], [1280.25, 719.5], [390, 844]]) for (const ratio of [16 / 9, 9 / 16]) {
    for (let count = 1; count <= 16; count++) for (const variant of LAYOUT_VARIANTS) {
      const plan = calculateLayoutVariant(optionsFor(count, width, height, ratio), variant.id);
      if (plan.status === "infeasible") {
        assert.equal(plan.code, "ARRANGEMENT_UNAVAILABLE");
        assert.ok(plan.reason.length > 0);
        continue;
      }
      assertUniform(plan);
      const audit = auditLayoutVariant(plan, count);
      assert.ok(audit.valid, `${width}/${height}/${ratio}/${count}/${variant.id}: ${audit.errors}`);
      assert.ok(Math.abs(plan.metrics.videoCoverage + plan.metrics.outerMarginRatio - 1) < 1e-8);
      assert.equal(plan.metrics.letterboxRatio, 0);
      assert.equal(plan.metrics.emptyRatio, 0);
      assert.equal(plan.metrics.gapRatio, 0);
    }
  }
});

test("任何方案均不能绕过副窗等大检查，包括传入旧的跳过参数", () => {
  for (const variant of LAYOUT_VARIANTS) {
    const plan = structuredClone(calculateLayoutVariant(optionsFor(9), variant.id));
    const small = plan.rects.filter((rect) => rect.role === "secondary");
    small[1].width *= 0.9;
    small[1].height *= 0.9;
    small[1].video = { x: small[1].x, y: small[1].y, width: small[1].width, height: small[1].height };
    assert.equal(auditLayoutVariant(plan, 9).valid, false);
    const audit = auditRecursiveLayout(plan, 9, { requireUniform: false });
    assert.equal(audit.valid, false);
    assert.ok(audit.errors.some((message) => message.includes("副窗宽高不一致")));
  }
});

test("主窗可以使用独立源比例，仍严格保持所有副窗等大", () => {
  for (const ratio of [4 / 3, 9 / 16, 21 / 9]) {
    const options = optionsFor(8);
    options.rooms[0].ratio = ratio;
    for (const variant of LAYOUT_VARIANTS) {
      const plan = calculateLayoutVariant(options, variant.id);
      if (plan.status === "infeasible") continue;
      assertUniform(plan);
      assert.ok(auditLayoutVariant(plan, 8).valid);
      assert.ok(Math.abs(plan.rects[0].width / plan.rects[0].height - ratio) < 1e-7);
    }
  }
});

test("默认、未知或已移除的方案使用自动选优，副窗源比例冲突仍明确拒绝", () => {
  for (const id of [undefined, "auto", "unknown", "tiered-l", "tiered-u", "mosaic"]) {
    const plan = calculateLayoutVariant(optionsFor(8), id);
    assert.equal(plan.variant.id, "coverage");
    assert.equal(plan.selection.mode, "auto");
    assertUniform(plan);
  }
  const mixed = optionsFor(8);
  mixed.rooms[2].ratio = 9 / 16;
  for (const variant of LAYOUT_VARIANTS) {
    const plan = calculateLayoutVariant(mixed, variant.id);
    assert.equal(plan.status, "infeasible");
    assert.equal(plan.code, "SECONDARY_RATIO_MISMATCH");
  }
  assert.equal(calculateLayoutVariant({ ...optionsFor(8), width: 0 }), null);
  assert.equal(calculateLayoutVariant(mixed).code, "SECONDARY_RATIO_MISMATCH");
});

test("留白最少模式：同为 8 房，根据画墙宽高自动选择右列、L 型或底行", () => {
  let previous = null;
  for (const [width, height, id, coverage] of [[2246, 994, "coverage", 0.8991787869793212],
    [1280, 720, "balanced", 1], [390, 844, "bottom", 0.29705484089370365]]) {
    const plan = calculateLayoutVariant({ ...optionsFor(8, width, height), previous });
    assert.equal(plan.variant.id, id);
    assert.equal(plan.selection.mode, "auto");
    assert.equal(plan.selection.feasibleCount, 3);
    assert.ok(Math.abs(plan.metrics.videoCoverage - coverage) < 1e-10);
    assert.ok(auditLayoutVariant(plan, 8).valid);
    assertUniform(plan);
    previous = plan;
  }
});

test("留白最少模式：不同尺寸和 1–16 房下取最高覆盖率，绝不选不可行结构", () => {
  for (const [width, height] of [[2246, 994], [1280.25, 719.5], [800, 600], [390, 844], [3200, 900]]) {
    for (const ratio of [16 / 9, 9 / 16]) for (let count = 1; count <= 16; count++) {
      const options = optionsFor(count, width, height, ratio);
      const plan = calculateLayoutVariant(options);
      const alternatives = compareLayoutVariants(options).filter((item) => item.status === "ready");
      assert.ok(auditLayoutVariant(plan, count).valid, `${width}/${height}/${ratio}/${count}`);
      assertUniform(plan);
      assert.ok(alternatives.every((item) => plan.metrics.videoCoverage >= item.metrics.videoCoverage - 1e-9));
      assert.equal(plan.selection.feasibleCount, alternatives.length);
      assert.equal(plan.metrics.emptyRatio, 0);
      assert.equal(plan.metrics.letterboxRatio, 0);
      assert.ok(plan.metrics.marginAxis === "none" || plan.bounds.width === width || Math.abs(plan.bounds.height - height) < 1e-7);
    }
  }
});

test("自动方案随房间数改变；同一房间数可以随画墙比例改为居中", () => {
  const narrow = calculateLayoutVariant(optionsFor(5, 1280, 720));
  const wide = calculateLayoutVariant({ ...optionsFor(5, 3200, 900), previous: narrow });
  assert.equal(narrow.anchor, "top-left");
  assert.equal(wide.variant.id, "sides");
  assert.equal(wide.anchor, "top-surround");
  assert.equal(wide.metrics.videoCoverage, 1);
  const nextCount = calculateLayoutVariant({ ...optionsFor(8, 3200, 900), previous: wide });
  assert.equal(nextCount.variant.id, "coverage");
  assert.ok(auditLayoutVariant(nextCount, 8).valid);
});

test("覆盖率及主窗偏好并列时保持原排列，尺寸变化后生成新坐标", () => {
  const options = optionsFor(9);
  const initial = calculateLayoutVariant(options);
  assert.equal(initial.variant.id, "surround");
  const manual = calculateLayoutVariant(options, "balanced");
  const retained = calculateLayoutVariant({ ...options, previous: manual });
  assert.equal(retained.variant.id, "balanced");
  assert.equal(retained.selection.mode, "auto");
  const doubled = calculateLayoutVariant({ ...optionsFor(9, 4492, 1988), previous: retained });
  assert.equal(doubled.variant.id, retained.variant.id);
  for (const rect of doubled.rects) {
    const original = retained.rects.find((item) => item.roomId === rect.roomId);
    for (const property of ["x", "y", "width", "height"]) assert.ok(Math.abs(rect[property] - original[property] * 2) < 1e-7);
  }
  const changedMain = calculateLayoutVariant({ ...options, mainRoomId: "2", previous: manual });
  assert.equal(changedMain.variant.id, "surround");
  assert.equal(changedMain.rects[0].roomId, "2");
});

test("旧方案更差时立即切换；自动模式不会改变手动指定的结构", () => {
  const options = optionsFor(8, 1280, 720);
  const previous = calculateLayoutVariant(options, "coverage");
  const auto = calculateLayoutVariant({ ...options, previous });
  assert.equal(auto.variant.id, "balanced");
  assert.ok(auto.metrics.videoCoverage > previous.metrics.videoCoverage);
  const pinned = calculateLayoutVariant({ ...options, previous: auto }, "coverage");
  assert.equal(pinned.variant.id, "coverage");
  assert.equal(pinned.selection.mode, "manual");
  assert.equal(calculateLayoutVariant(optionsFor(8), "sides").status, "infeasible");
});

test("默认采用综合均衡：8 房从面积 49 倍降为 9 倍，而不是只在覆盖率并列时考虑差距", () => {
  const options = optionsFor(8);
  const previous = calculateLayoutVariant(options);
  const balanced = calculateLayoutVariant({ ...options, priority: undefined, previous });
  assert.equal(balanced.selection.priority, "compromise");
  assert.equal(balanced.variant.id, "balanced");
  assert.ok(Math.abs(previous.metrics.mainToAverageVideo - 49) < 1e-8);
  assert.ok(Math.abs(balanced.metrics.mainToAverageVideo - 9) < 1e-8);
  assert.ok(balanced.metrics.secondarySize.width > previous.metrics.secondarySize.width);
  assert.ok(Math.abs(balanced.metrics.videoCoverage - 0.7867814386069061) < 1e-8);
  assert.ok(auditLayoutVariant(balanced, 8).valid);
  assertUniform(balanced);
});

test("综合均衡默认目标为 6 倍面积，覆盖收益明显时适度放宽主窗上限", () => {
  for (const [count, oldArea, oldCoverage, newCoverage] of [[5, 4, 0.6355005030181087, 0.9834767982586328],
    [10, 9, 0.6355005030181087, 0.7867814386069061], [15, 4, 0.6355005030181087, 0.9441377263282873]]) {
    const options = { ...optionsFor(count), priority: undefined, mainWeight: undefined };
    const uniform = calculateLayoutVariant({ ...options, priority: "balanced", mainWeight: 4 });
    const compromise = calculateLayoutVariant(options);
    assert.ok(Math.abs(uniform.metrics.mainToAverageVideo - oldArea) < 1e-8);
    assert.ok(Math.abs(uniform.metrics.videoCoverage - oldCoverage) < 1e-8);
    assert.ok(Math.abs(compromise.metrics.mainToAverageVideo - 16) < 1e-8);
    assert.ok(Math.abs(compromise.metrics.videoCoverage - newCoverage) < 1e-8);
    assert.equal(compromise.selection.priority, "compromise");
    assert.deepEqual(compromise.selection.sizeRange, { target: 6, min: 3, max: 16 });
    assert.ok(compromise.metrics.videoCoverage - uniform.metrics.videoCoverage > 0.15);
    assert.ok(auditLayoutVariant(compromise, count).valid);
    assertUniform(compromise);
  }
});

test("综合均衡在覆盖收益较小时保留较小主窗，结构内部和跨结构使用同一评分", () => {
  const options = { ...optionsFor(5, 2650, 1000), priority: "compromise", mainWeight: 6 };
  const larger = enumerateRecursiveLayouts(options).candidates.find((plan) => plan.signature === "4/4/1/0/0");
  for (const variant of ["auto", "coverage"]) {
    const plan = calculateLayoutVariant(options, variant);
    assert.ok(Math.abs(plan.metrics.mainToAverageVideo - 4) < 1e-8);
    assert.ok(larger.metrics.videoCoverage > plan.metrics.videoCoverage);
    assert.ok(larger.metrics.videoCoverage - plan.metrics.videoCoverage < 0.10);
    assert.ok(auditLayoutVariant(plan, 5).valid);
  }
  const beneficial = calculateLayoutVariant({ ...options, width: 2246, height: 994 }, "coverage");
  assert.ok(Math.abs(beneficial.metrics.mainToAverageVideo - 16) < 1e-8);
});

test("综合均衡对 1–16 房和横竖画墙保持约束，并在全部合法候选中取最优评分", () => {
  for (const [width, height] of [[2246, 994], [1280, 720], [2650, 1000], [390, 844]]) {
    for (const ratio of [16 / 9, 9 / 16]) for (let count = 1; count <= 16; count++) {
      const options = { ...optionsFor(count, width, height, ratio), priority: "compromise", mainWeight: 6 };
      const plan = calculateLayoutVariant(options);
      assert.ok(auditLayoutVariant(plan, count).valid, `${width}/${height}/${ratio}/${count}`);
      assertUniform(plan);
      assert.ok((plan.metrics.mainToAverageVideo ?? 1) <= 16 + 1e-8);
      const alternatives = enumerateRecursiveLayouts(options).candidates.filter((item) =>
        item.metrics.mainToAverageVideo >= 3 - 1e-8 && item.metrics.mainToAverageVideo <= 16 + 1e-8);
      if (!alternatives.length) continue;
      assert.notEqual(plan.variant.id, "grid");
      assert.ok(alternatives.every((item) => coverageSizeBalanceScore(item.metrics.videoCoverage, item.metrics.mainToAverageVideo, 6)
        <= plan.selection.score + 1e-8), `${count}/${width}/${height}: missed a better score`);
    }
  }
});

test("综合均衡保留面积滑块、手动结构和 14 房等大回退", () => {
  const options = { ...optionsFor(5), priority: "compromise" };
  const smaller = calculateLayoutVariant({ ...options, mainWeight: 4 });
  const larger = calculateLayoutVariant({ ...options, mainWeight: 6 });
  assert.ok(Math.abs(smaller.metrics.mainToAverageVideo - 4) < 1e-8);
  assert.ok(Math.abs(larger.metrics.mainToAverageVideo - 16) < 1e-8);
  for (const variant of LAYOUT_VARIANTS) {
    const plan = calculateLayoutVariant({ ...optionsFor(9), priority: "compromise", mainWeight: 6 }, variant.id);
    assert.equal(plan.variant.id, variant.id);
    if (plan.status === "ready") { assertUniform(plan); assert.ok(auditLayoutVariant(plan, 9).valid); }
  }
  const grid = calculateLayoutVariant({ ...optionsFor(14), priority: "compromise", mainWeight: undefined });
  assert.equal(grid.variant.id, "grid");
  assert.equal(grid.selection.fallback, true);
  assert.ok(Math.abs(grid.metrics.mainToAverageVideo - 1) < 1e-8);
  for (const rect of grid.rects) {
    assert.equal(rect.width, grid.rects[0].width);
    assert.equal(rect.height, grid.rects[0].height);
  }
  assert.ok(auditLayoutVariant(grid, 14).valid);
  const coverage = calculateLayoutVariant({ ...optionsFor(14), mainWeight: 6 });
  assert.ok(coverage.metrics.mainToAverageVideo > 100);
});

test("综合均衡仅在有效并列时保留旧排列，窗口缩放后重新生成几何", () => {
  const options = { ...optionsFor(9), priority: "compromise", mainWeight: 6 };
  const previous = calculateLayoutVariant(options, "balanced");
  const retained = calculateLayoutVariant({ ...options, width: 4492, height: 1988, previous });
  assert.equal(retained.variant.id, previous.variant.id);
  for (const rect of retained.rects) {
    const old = previous.rects.find((item) => item.roomId === rect.roomId);
    for (const key of ["x", "y", "width", "height"]) assert.ok(Math.abs(rect[key] - old[key] * 2) < 1e-7);
  }
  const changed = calculateLayoutVariant({ ...options, mainRoomId: "2", previous });
  assert.equal(changed.rects[0].roomId, "2");
  assert.ok(auditLayoutVariant(changed, 9).valid);
  const moved = calculateLayoutVariant({ ...optionsFor(10, 1920, 1080), mainWeight: 6, priority: "compromise", previous });
  assert.equal(moved.variant.id, "balanced");
  assert.ok(Math.abs(moved.metrics.videoCoverage - 1) < 1e-8);
});

test("大小均衡既用于结构内部，也用于结构之间，面积目标确实影响结果", () => {
  const options = { ...optionsFor(5), priority: "balanced" };
  const pinned = calculateLayoutVariant(options, "coverage");
  assert.ok(Math.abs(pinned.metrics.mainToAverageVideo - 4) < 1e-8);
  const largeTarget = calculateLayoutVariant({ ...options, mainWeight: 8 }, "coverage");
  assert.ok(Math.abs(largeTarget.metrics.mainToAverageVideo - 16) < 1e-8);
  const automatic = calculateLayoutVariant(options);
  assert.ok(Math.abs(automatic.metrics.mainToAverageVideo - 4) < 1e-8);
  assert.equal(automatic.variant.id, "sides");
});

test("14 房没有适中放大解，按约定自动回退完整等大网格，不再选择 169 倍", () => {
  const options = { ...optionsFor(14), priority: "balanced" };
  const variants = compareLayoutVariants(options);
  assert.equal(variants.length, 6);
  const focused = variants.filter((plan) => plan.status === "ready" && plan.variant.id !== "grid");
  assert.ok(Math.abs(Math.min(...focused.map((plan) => plan.metrics.mainToAverageVideo)) - 36) < 1e-8);
  const grid = calculateLayoutVariant(options);
  assert.equal(grid.variant.id, "grid");
  assert.equal(grid.layoutShape, "equal-grid");
  assert.equal(grid.selection.fallback, true);
  assert.equal(grid.grid.columns * grid.grid.rows, 14);
  assert.match(grid.selection.reason, /没有.*适中放大解.*全等大网格/);
  assert.ok(auditLayoutVariant(grid, 14).valid);
  for (const rect of grid.rects) {
    assert.equal(rect.width, grid.rects[0].width);
    assert.equal(rect.height, grid.rects[0].height);
  }
  const coverage = calculateLayoutVariant({ ...options, priority: "coverage", previous: grid });
  assert.ok(Math.abs(coverage.metrics.mainToAverageVideo - 169) < 1e-8);
  assert.equal(compareLayoutVariants({ ...options, priority: "coverage" }).length, 5);
});

test("均衡自动模式在多种画墙及 1–16 房下控制面积差距，仍逐一通过严格几何审计", () => {
  for (const [width, height] of [[2246, 994], [1280, 720], [800, 600], [390, 844]]) {
    for (const ratio of [16 / 9, 9 / 16]) for (let count = 1; count <= 16; count++) {
      const plan = calculateLayoutVariant({ ...optionsFor(count, width, height, ratio), priority: "balanced" });
      assert.ok(auditLayoutVariant(plan, count).valid, `${width}/${height}/${ratio}/${count}`);
      assert.ok((plan.metrics.mainToAverageVideo ?? 1) <= 9 + 1e-8);
      assertUniform(plan);
      assert.equal(plan.metrics.letterboxRatio, 0);
      assert.equal(plan.metrics.emptyRatio, 0);
      if (plan.variant.id === "grid") assert.equal(count, 14);
    }
  }
});

test("等大网格回退随尺寸及主窗改变重新求解，退出极端数量后恢复放大", () => {
  const options = { ...optionsFor(14), priority: "balanced" };
  const first = calculateLayoutVariant(options);
  const moved = calculateLayoutVariant({ ...optionsFor(14, 390, 844), priority: "balanced", mainRoomId: "2", previous: first });
  assert.equal(moved.variant.id, "grid");
  assert.equal(moved.rects[0].roomId, "2");
  assert.ok(auditLayoutVariant(moved, 14).valid);
  const next = calculateLayoutVariant({ ...optionsFor(13), priority: "balanced", previous: moved });
  assert.notEqual(next.variant.id, "grid");
  assert.ok(next.metrics.mainToAverageVideo >= 2);
  assert.ok(auditLayoutVariant(next, 13).valid);
});

test("主副窗源比例不同时不能借网格回退破坏比例，仍以真实可行解展示", () => {
  const options = { ...optionsFor(14), priority: "balanced" };
  options.rooms[0].ratio = 4 / 3;
  const rejected = calculateRecursiveLayout({ ...options, selection: "equal-grid" });
  assert.equal(rejected.status, "infeasible");
  assert.equal(rejected.code, "GRID_RATIO_MISMATCH");
  assert.deepEqual(rejected.rects, []);
  for (const plan of compareLayoutVariants(options)) {
    assert.notEqual(plan.variant.id, "grid");
    if (plan.status === "ready") assert.ok(auditLayoutVariant(plan, 14).valid);
  }
  assert.ok(auditLayoutVariant(calculateLayoutVariant(options), 14).valid);
});

test("重复计算及画墙等比缩放保留房间身份、比例和尺寸一致性", () => {
  for (const variant of LAYOUT_VARIANTS) {
    const first = calculateLayoutVariant(optionsFor(9), variant.id);
    assert.deepEqual(calculateLayoutVariant(optionsFor(9), variant.id), first);
    const doubled = calculateLayoutVariant(optionsFor(9, 4492, 1988), variant.id);
    assert.ok(auditLayoutVariant(doubled, 9).valid);
    assert.ok(Math.abs(doubled.metrics.videoCoverage - first.metrics.videoCoverage) < 1e-12);
    assert.deepEqual(new Set(doubled.rects.map((rect) => rect.roomId)), new Set(first.rects.map((rect) => rect.roomId)));
  }
});

test("独立 HTML 内嵌最新脚本样式，只保留等大排列选项", async () => {
  const html = await readFile(new URL("../preview/layout-options-preview.html", import.meta.url), "utf8");
  assert.match(html, /data-preview-kind="comparison"/);
  const script = html.match(/src="data:text\/javascript;base64,([^"]+)"/);
  const style = html.match(/href="data:text\/css;base64,([^"]+)"/);
  assert.ok(script);
  assert.ok(style);
  assert.doesNotMatch(html, /(?:src|href)="(?:https?:|\.\/)/);
  assert.doesNotMatch(html, /分档|两档|多档|探索|tiered|mosaic/);
  const javascript = Buffer.from(script[1], "base64").toString("utf8");
  assert.equal(javascript, await readFile(new URL("../preview/recursive-layout-preview.js", import.meta.url), "utf8"));
  assert.equal(Buffer.from(style[1], "base64").toString("utf8"), await readFile(new URL("../preview/recursive-layout-preview.css", import.meta.url), "utf8"));
  assert.doesNotThrow(() => new Script(javascript));
  assert.doesNotMatch(javascript, /副窗允许分档|requireUniform|tieredTrees|mosaicTrees/);
});
