import test from "node:test";
import assert from "node:assert/strict";
import { calculateRecursiveLayout, auditRecursiveLayout } from "../preview/recursive-layout-engine.js";

const areaOf = (rect) => rect.width * rect.height;
const roomsFor = (count, ratio = 16 / 9) => Array.from({ length: count }, (_, index) => ({ id: String(index + 1), ratio }));
const planFor = (width, height, count, extra = {}) => calculateRecursiveLayout({ width, height, rooms: roomsFor(count), mainRoomId: "1", ...extra });
const assertUniform = (plan) => {
  const secondaries = plan.rects.filter((rect) => rect.role === "secondary");
  for (const rect of secondaries) {
    assert.equal(rect.width, secondaries[0].width);
    assert.equal(rect.height, secondaries[0].height);
  }
};

test("576 组横竖屏、1–16 房及三种锚点：所有副窗等宽等高、保持源比例、无黑边和内部空洞", () => {
  for (const [width, height] of [[1280, 720], [1920, 1080], [800, 600], [390, 844], [150, 120], [1280.25, 719.5]]) {
    for (const anchor of ["auto", "top-left", "top-center"]) for (const ratio of [16 / 9, 9 / 16]) for (let count = 1; count <= 16; count++) {
      const plan = planFor(width, height, count, { anchor, rooms: roomsFor(count, ratio) });
      const audit = auditRecursiveLayout(plan, count);
      assert.ok(audit.valid, `${width}×${height}/${anchor}/${ratio}/${count}: ${audit.errors}`);
      assertUniform(plan);
      const metrics = plan.metrics;
      assert.ok(Math.abs(metrics.videoCoverage + metrics.outerMarginRatio - 1) < 1e-8);
      assert.equal(metrics.letterboxRatio, 0);
      assert.equal(metrics.emptyRatio, 0);
      assert.equal(metrics.gapRatio, 0);
      assert.equal(metrics.secondaryEqual, true);
      assert.ok(Math.abs(metrics.contentFillRatio - 1) < 1e-8);
      for (const rect of plan.rects) {
        assert.ok(Math.abs(rect.width / rect.height / rect.ratio - 1) < 1e-8);
        assert.deepEqual(rect.video, { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
      }
    }
  }
});

test("主窗可使用不同源比例，副窗仍全局等大；覆盖率由真实视频面积计算", () => {
  for (const mainRatio of [16 / 9, 9 / 16, 4 / 3, 1, 21 / 9, Math.SQRT2]) {
    for (const anchor of ["auto", "top-left", "top-center"]) for (let count = 1; count <= 16; count++) {
      const rooms = roomsFor(count);
      rooms[0].ratio = mainRatio;
      const plan = planFor(1920, 1200, count, { rooms, anchor });
      assert.ok(auditRecursiveLayout(plan, count).valid, `${anchor}/${mainRatio}/${count}`);
      assertUniform(plan);
      assert.equal(plan.rects[0].ratio, mainRatio);
      const expected = plan.rects.reduce((sum, rect) => sum + areaOf(rect.video), 0) / (1920 * 1200);
      assert.ok(Math.abs(plan.metrics.videoCoverage - expected) < 1e-12);
    }
  }
});

test("副窗源比例不同时明确报告约束冲突；一或两个房间不被其他不可行数量连带拒绝", () => {
  for (let count = 3; count <= 16; count++) {
    const rooms = roomsFor(count);
    rooms[1].ratio = 9 / 16;
    const result = planFor(1280, 720, count, { rooms });
    assert.equal(result.status, "infeasible");
    assert.equal(result.code, "SECONDARY_RATIO_MISMATCH");
    assert.match(result.reason, /等宽等高/);
    assert.deepEqual(result.rects, []);
    assert.equal(auditRecursiveLayout(result, count).valid, false);
  }
  assert.ok(auditRecursiveLayout(planFor(1280, 720, 1), 1).valid);
  const twoRooms = [{ id: "1", ratio: 16 / 9 }, { id: "2", ratio: 9 / 16 }];
  assert.ok(auditRecursiveLayout(planFor(1280, 720, 2, { rooms: twoRooms }), 2).valid);
  const mainOnlyDifferent = [...twoRooms, { id: "3", ratio: 9 / 16 }];
  assert.ok(auditRecursiveLayout(planFor(1280, 720, 3, { rooms: mainOnlyDifferent }), 3).valid);
});

test("两路 16:9 必须等大，三路主窗可以更大，面积偏好不突破严格几何约束", () => {
  for (const weight of [2, 4, 10]) {
    const two = planFor(1280, 720, 2, { anchor: "top-left", mainWeight: weight });
    assert.ok(Math.abs(two.metrics.videoCoverage - 0.5) < 1e-8);
    assert.ok(Math.abs(two.metrics.mainToLargestVideo - 1) < 1e-8);
    assert.equal(two.metrics.marginAxis, "top-bottom");
    const three = planFor(1280, 720, 3, { anchor: "top-left", mainWeight: weight });
    assert.ok(Math.abs(three.metrics.videoCoverage - 2 / 3) < 1e-8);
    assert.ok(Math.abs(three.metrics.mainToLargestVideo - 4) < 1e-8);
  }
  const four = planFor(1280, 720, 4, { anchor: "top-left" });
  assert.ok(Math.abs(four.metrics.videoCoverage - 0.75) < 1e-8);
  assert.ok(four.metrics.mainToLargestVideo >= 2);
  for (const count of [6, 8, 10, 12, 13, 14, 16]) assert.ok(Math.abs(planFor(1280, 720, count).metrics.videoCoverage - 1) < 1e-8);
});

test("自动布局根据画墙尺寸选择，围绕时主窗精确水平居中，各区域副窗共用同一尺寸", () => {
  for (const [width, height] of [[1280, 720], [1920, 600], [390, 844]]) for (const count of [1, 2, 3, 4]) {
    const plan = planFor(width, height, count);
    assert.equal(plan.requestedAnchor, "auto");
    assert.equal(plan.anchor, "top-left", `${width}×${height}/${count}`);
  }
  assert.equal(planFor(1920, 600, 5).anchor, "top-surround");
  assert.equal(planFor(1280, 720, 5).anchor, "top-left");
  const many = planFor(1280, 720, 13);
  assert.equal(many.anchor, "top-surround");
  for (const region of ["left", "right", "bottom"]) assert.ok(many.rects.some((rect) => rect.region === region));
  const main = many.rects[0];
  assert.ok(Math.abs(main.x + main.width / 2 - many.width / 2) < 1e-8);
  assert.ok(many.metrics.mainToLargestVideo >= 2);
  assertUniform(many);
  assert.equal(planFor(390, 844, 13).anchor, "top-left");
});

test("允许适当缩小主窗，当前竖向画墙的 8/12/16 房能采用真实 L 型", () => {
  for (const count of [8, 12, 16]) {
    const plan = planFor(744, 667, count);
    assert.equal(plan.layoutShape, "l-shape", `${count} 房`);
    assert.equal(plan.anchor, "top-left");
    assert.ok(plan.rects.some((rect) => rect.region === "right"));
    assert.ok(plan.rects.some((rect) => rect.region === "bottom"));
    assert.ok(!plan.rects.some((rect) => rect.region === "left"));
    assertUniform(plan);
    assert.ok(auditRecursiveLayout(plan, count).valid);
  }
  const eight = planFor(744, 667, 8);
  assert.ok(Math.abs(eight.metrics.mainToLargestVideo - 9) < 1e-8);
  // 原方案用 7×7 单元主窗和单条副窗；现在主窗缩为 3×3，右下两边均可排列。
  assert.ok(eight.metrics.mainToLargestVideo < 49);
  const sixteen = planFor(744, 667, 16);
  assert.ok(Math.abs(sixteen.metrics.mainToLargestVideo - 9) < 1e-8);
});

test("标准横屏 15 房不会为减少外围留白继续把主窗放大到 196 倍", () => {
  const plan = planFor(1280, 720, 15, { anchor: "top-left" });
  assert.equal(plan.layoutShape, "l-shape");
  assert.ok(Math.abs(plan.metrics.mainToLargestVideo - 16) < 1e-8);
  assert.ok(Math.abs(plan.metrics.videoCoverage - 5 / 6) < 1e-8);
  assert.ok(auditRecursiveLayout(plan, 15).valid);
});

test("等比例且小窗等大时，5/7/11 房无法构成完整 L 型，必须明确说明而不产生空洞", () => {
  for (const count of [5, 7, 11]) for (const [width, height] of [[744, 667], [1280, 720]]) {
    const plan = planFor(width, height, count);
    assert.equal(plan.lShapeAvailable, false);
    assert.notEqual(plan.layoutShape, "l-shape");
    assert.match(plan.shapeConstraintNote, /没有 L 型解/);
    assert.ok(auditRecursiveLayout(plan, count).valid);
  }
});

test("排布类型必须与最终几何相符，条带不能被标成 L 型", () => {
  const plan = structuredClone(planFor(744, 667, 11));
  plan.layoutShape = "l-shape";
  const audit = auditRecursiveLayout(plan, 11);
  assert.equal(audit.valid, false);
  assert.ok(audit.errors.some((message) => message.includes("L 型")));
});

test("外围只允许单轴留白，并且在该自然比例下已放大到最大", () => {
  for (const [width, height] of [[1280, 720], [390, 844], [2552, 1177]]) for (let count = 1; count <= 16; count++) {
    const plan = planFor(width, height, count);
    const bounds = plan.bounds;
    assert.ok(Math.abs(bounds.width - width) < 1e-6 || Math.abs(bounds.height - height) < 1e-6);
    assert.ok(Math.abs(bounds.x - (width - bounds.width) / 2) < 1e-6);
    assert.ok(Math.abs(bounds.y - (height - bounds.height) / 2) < 1e-6);
  }
});

test("源比例与居中导致主窗无法突出时，仍完整输出矩形并明确标记限制", () => {
  const plan = planFor(1280, 720, 2, { anchor: "top-center" });
  assert.ok(auditRecursiveLayout(plan, 2).valid);
  assert.equal(plan.metrics.prominenceLimited, true);
  assert.equal(plan.metrics.letterboxRatio, 0);
});

test("审计从最终几何检查副窗一致性，不能只信任 secondaryEqual 标志", () => {
  const plan = structuredClone(planFor(1280, 720, 8));
  const rect = plan.rects[2];
  rect.width *= 0.9;
  rect.height *= 0.9;
  rect.video = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  const audit = auditRecursiveLayout(plan, 8);
  assert.equal(audit.valid, false);
  assert.ok(audit.errors.some((message) => message.includes("副窗宽高不一致")));
});

test("同一输入确定性输出，传回上一布局仍保留全部身份与比例", () => {
  const options = { rooms: roomsFor(12), mainRoomId: "7" };
  const first = planFor(1440, 900, 12, options);
  const repeat = planFor(1440, 900, 12, { ...options, previous: first });
  assert.deepEqual(repeat, first);
  const resized = planFor(1441, 901, 12, { ...options, previous: first });
  assert.ok(auditRecursiveLayout(resized, 12).valid);
  assert.deepEqual(new Set(resized.rects.map((rect) => rect.roomId)), new Set(options.rooms.map((room) => room.id)));
});

test("无效视口、重复身份和不存在的主窗拒绝计算，未知源比例安全回退", () => {
  for (const [width, height] of [[0, 720], [1280, 0], [NaN, 720], [1280, Infinity]]) assert.equal(planFor(width, height, 8), null);
  assert.equal(planFor(1280, 720, 17), null);
  assert.equal(planFor(1280, 720, 2, { mainRoomId: "missing" }), null);
  assert.equal(planFor(1280, 720, 2, { rooms: [{ id: "1", ratio: 1 }, { id: "1", ratio: 2 }] }), null);
  assert.equal(planFor(1280, 720, 2, { rooms: [null] }), null);
  const fallback = planFor(1280, 720, 2, { rooms: [{ id: "1", ratio: NaN }, { id: "2", ratio: 0 }] });
  assert.ok(auditRecursiveLayout(fallback, 2).valid);
  assert.ok(fallback.rects.every((rect) => rect.ratio === 16 / 9));
});
