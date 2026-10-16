import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import { enumerateRecursiveLayouts, calculateRecursiveLayout, auditRecursiveLayout } from "../preview/recursive-layout-engine.js";
import { calculateResearchLayouts } from "../preview/layout-research-engine.js";

const optionsFor = (count, width = 2246, height = 994, ratio = 16 / 9) => ({ width, height, mainRoomId: "01", mainWeight: 4,
  rooms: Array.from({ length: count }, (_, index) => ({ id: String(index + 1).padStart(2, "0"), ratio })) });
const findUnits = (scene, main, columns, rows, left = 0) => scene.candidates.find((plan) => plan.units.mainColumns === main
  && plan.units.columns === columns && plan.units.rows === rows && plan.units.leftColumns === left);

test("12 房调研的四种行列组合均是真实且不同的等大小窗布局", () => {
  const scene = enumerateRecursiveLayouts(optionsFor(12));
  const expected = [[2, 5, 3, 0, 0.7626006036217303], [2, 3, 5, 0, 0.47206886316414365],
    [3, 5, 4, 0, 0.9834767982586328], [3, 5, 4, 1, 0.9834767982586328]];
  const ids = new Set();
  for (const [main, columns, rows, left, coverage] of expected) {
    const plan = findUnits(scene, main, columns, rows, left);
    assert.ok(plan);
    ids.add(plan.signature);
    assert.ok(auditRecursiveLayout(plan, 12).valid);
    assert.ok(Math.abs(plan.metrics.mainToAverageVideo - main * main) < 1e-8);
    assert.ok(Math.abs(plan.metrics.videoCoverage - coverage) < 1e-8);
    const small = plan.rects.filter((rect) => rect.role === "secondary");
    for (const rect of small) { assert.equal(rect.width, small[0].width); assert.equal(rect.height, small[0].height); }
  }
  assert.equal(ids.size, 4);
});

test("每个数量、画墙及横竖源比例的全部枚举都通过严格审计，身份和几何不重复", () => {
  for (const [width, height] of [[2246, 994], [1280.25, 719.5], [390, 844]]) for (const ratio of [16 / 9, 9 / 16]) {
    for (let count = 1; count <= 16; count++) {
      const scene = enumerateRecursiveLayouts(optionsFor(count, width, height, ratio));
      assert.equal(scene.status, "ready");
      assert.ok(scene.candidates.length > 0);
      assert.equal(new Set(scene.candidates.map((plan) => plan.signature)).size, scene.candidates.length);
      for (const plan of scene.candidates) {
        const audit = auditRecursiveLayout(plan, count);
        assert.ok(audit.valid, `${count}/${width}/${height}/${ratio}/${plan.signature}: ${audit.errors}`);
        assert.equal(plan.metrics.secondaryEqual, true);
        assert.equal(plan.metrics.letterboxRatio, 0);
        assert.equal(plan.metrics.emptyRatio, 0);
        assert.equal(plan.metrics.gapRatio, 0);
      }
    }
  }
});

test("指定候选保留较小主窗，不被结构内部的覆盖率选优替换；失效的选择明确拒绝", () => {
  const options = optionsFor(12);
  const small = findUnits(enumerateRecursiveLayouts(options), 2, 5, 3);
  const pinned = calculateRecursiveLayout({ ...options, family: "l-shape", candidateKey: small.signature, selection: "coverage" });
  const best = calculateRecursiveLayout({ ...options, family: "l-shape", selection: "coverage" });
  assert.ok(Math.abs(pinned.metrics.mainToAverageVideo - 4) < 1e-8);
  assert.ok(Math.abs(best.metrics.mainToAverageVideo - 9) < 1e-8);
  assert.equal(pinned.signature, small.signature);
  const stale = calculateRecursiveLayout({ ...optionsFor(8), family: "l-shape", candidateKey: small.signature });
  assert.equal(stale.status, "infeasible");
  assert.equal(stale.code, "CANDIDATE_UNAVAILABLE");
});

test("12 房的大小与覆盖取舍各自保留，窄矩形也可预览，L/U 同指标不被错误合并", () => {
  const scene = calculateResearchLayouts(optionsFor(12));
  assert.equal(scene.moderateCount, 5);
  assert.equal(scene.frontierCount, 3);
  const smallWide = findUnits(scene, 2, 5, 3);
  const smallTall = findUnits(scene, 2, 3, 5);
  const largeLeft = findUnits(scene, 3, 5, 4);
  const largeCenter = findUnits(scene, 3, 5, 4, 1);
  assert.equal(smallWide.research.sizePreferred, true);
  assert.equal(smallWide.research.frontier, true);
  assert.equal(smallTall.research.moderate, true);
  assert.equal(smallTall.research.frontier, false);
  assert.equal(largeLeft.research.coveragePreferred, true);
  assert.equal(largeCenter.research.coveragePreferred, true);
  assert.equal(largeLeft.research.frontier, true);
  assert.equal(largeCenter.research.frontier, true);
  assert.notEqual(largeLeft.research.id, largeCenter.research.id);
});

test("切换画墙后重新评价候选，缩放及更换主窗保持所选行列组合和全部房间身份", () => {
  const first = findUnits(calculateResearchLayouts(optionsFor(12)), 2, 5, 3);
  const next = calculateResearchLayouts({ ...optionsFor(12, 4492, 1988), mainRoomId: "02" }).candidates.find((plan) => plan.research.id === first.research.id);
  assert.ok(next);
  assert.equal(next.rects[0].roomId, "02");
  assert.ok(Math.abs(next.metrics.videoCoverage - first.metrics.videoCoverage) < 1e-8);
  assert.ok(auditRecursiveLayout(next, 12).valid);
  assert.ok(Math.abs(next.rects[0].width - first.rects[0].width * 2) < 1e-8);
  const portraitWall = calculateResearchLayouts(optionsFor(12, 390, 844));
  assert.equal(findUnits(portraitWall, 2, 3, 5).research.sizePreferred, true);
});

test("14 房保留等大网格回退，适中筛选不会暴露过大的放大主窗", () => {
  const scene = calculateResearchLayouts(optionsFor(14));
  const moderate = scene.candidates.filter((plan) => plan.research.moderate);
  assert.equal(moderate.length, 1);
  const grid = moderate[0];
  assert.equal(grid.layoutShape, "equal-grid");
  assert.ok(grid.research.id.startsWith("grid:"));
  assert.equal(grid.research.frontier, true);
  assert.ok(auditRecursiveLayout(grid, 14).valid);
  for (const rect of grid.rects) { assert.equal(rect.width, grid.rects[0].width); assert.equal(rect.height, grid.rects[0].height); }
});

test("无效输入及副窗源比例冲突不生成伪候选；独立主窗比例仍可审计", () => {
  assert.equal(calculateResearchLayouts({ ...optionsFor(12), width: 0 }), null);
  const mixed = optionsFor(12);
  mixed.rooms[2].ratio = 9 / 16;
  const unavailable = calculateResearchLayouts(mixed);
  assert.equal(unavailable.status, "infeasible");
  assert.equal(unavailable.code, "SECONDARY_RATIO_MISMATCH");
  assert.deepEqual(unavailable.candidates, []);
  const independent = optionsFor(12);
  independent.rooms[0].ratio = 4 / 3;
  for (const plan of calculateResearchLayouts(independent).candidates) assert.ok(auditRecursiveLayout(plan, 12).valid);
});

test("调研 HTML 独立内嵌最新脚本与样式，保留来源链接且不依赖外部资源运行", async () => {
  const html = await readFile(new URL("../preview/layout-research-preview.html", import.meta.url), "utf8");
  const script = html.match(/src="data:text\/javascript;base64,([^"]+)"/);
  const style = html.match(/href="data:text\/css;base64,([^"]+)"/);
  assert.ok(script);
  assert.ok(style);
  const javascript = Buffer.from(script[1], "base64").toString("utf8");
  assert.equal(javascript, await readFile(new URL("../preview/layout-research-preview.js", import.meta.url), "utf8"));
  assert.equal(Buffer.from(style[1], "base64").toString("utf8"), await readFile(new URL("../preview/recursive-layout-preview.css", import.meta.url), "utf8"));
  assert.doesNotThrow(() => new Script(javascript));
  assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)="(?:https?:|\.\/)/);
  assert.match(html, /载入 12 房调研示例/);
  assert.match(html, /全部候选/);
});
