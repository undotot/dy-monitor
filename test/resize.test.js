import test from "node:test";
import assert from "node:assert/strict";
import { calculateFocusLayout, FOCUS_LIMITS } from "../src/core/focus-layout.js";

const landscape = 16 / 9;
const planFor = (width, height, count, options = {}) => calculateFocusLayout({ width, height, secondaryRatios: Array(Math.max(0, count - 1)).fill(landscape), ...options });
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 0.01, message);
const assertContained = (video, frame, ratio) => {
  close(video.width / video.height, ratio);
  assert.ok(video.width <= frame.width + 0.01 && video.height <= frame.height + 0.01);
  assert.ok(Math.min(Math.abs(video.width - frame.width), Math.abs(video.height - frame.height)) < 0.01);
};

test("8 房间小窗等大、保比例、精确满铺，剩余矩形给左上大窗", () => {
  for (const [width, height] of [[1280, 720], [1920, 1080]]) {
    const plan = planFor(width, height, 8);
    assert.ok(plan.rightWidth > 0 || plan.bottomHeight > 0);
    assert.equal(plan.bothRegions, true);
    assert.ok(plan.dominant);
    assert.ok(plan.layoutFillRatio > 0.99);
    assertContained(plan.mainVideo, plan.main, landscape);
    assert.equal(plan.overflow, false);
    assert.equal(plan.constrained, false);
    for (const room of plan.placements) {
      close(room.width, plan.cell.width);
      close(room.height, plan.cell.height);
      assertContained(room.video, room, landscape);
    }
    // 全 16:9 流在等大格中严格 16:9 无裁切零黑边
    assert.equal(plan.meanVisible, 1);
    close(plan.cellRatio, landscape);
    close(plan.main.width / plan.main.height, landscape);
    close(plan.main.width + (plan.rightWidth ? plan.rightWidth + plan.gapX : 0), width);
    close(plan.main.height + (plan.bottomHeight ? plan.bottomHeight + plan.gapY : 0), height);
  }
});

test("不同数量与极端窗口中所有小格等大、保比例、不重叠、不溢出", () => {
  for (const [width, height] of [[1920, 1080], [1280, 720], [1024, 620], [800, 600], [375, 600], [150, 120], [800, 220], [350, 1000], [1, 1]]) {
    for (let count = 1; count <= 16; count++) {
      const plan = planFor(width, height, count);
      // 亚像素视口装不下主窗 + 小格，拒绝计算而不是产出退化布局。
      if (width <= 2 && height <= 2) {
        assert.equal(plan, null, `${width}×${height}/${count}`);
        continue;
      }
      assert.ok(plan, `${width}×${height}/${count}`);
      assert.equal(plan.placements.length, count - 1);
      assert.equal(plan.overflow, false);
      assert.equal(new Set(plan.placements.map((room) => room.index)).size, count - 1);
      assert.ok(plan.main.width <= width + 0.01 && plan.main.height <= height + 0.01);
      assertContained(plan.mainVideo, plan.main, landscape);
      if (!plan.constrained) assert.ok(plan.main.width >= 635 || plan.quality >= 0.98);
      assert.ok(plan.dominant, `${width}×${height}/${count}`);
      assert.ok(plan.layoutFillRatio >= 0.8, `${width}×${height}/${count}`);
      assert.ok(plan.containerW <= width + 0.01);
      assert.ok(plan.containerH <= height + 0.01);
      for (const room of plan.placements) {
        assert.ok(room.width > 0 && room.height > 0);
        close(room.width, plan.cell.width);
        close(room.height, plan.cell.height);
        assertContained(room.video, room, landscape);
        assert.ok(plan.main.width * plan.main.height >= room.width * room.height * FOCUS_LIMITS.mainAreaRatio - 0.01);
        const regionWidth = room.region === "right" ? plan.rightWidth : plan.main.width;
        const regionHeight = room.region === "right" ? plan.rightContentHeight : plan.bottomContentHeight;
        assert.ok(room.x + room.width <= regionWidth + 0.01 && room.y + room.height <= regionHeight + 0.01);
        for (const other of plan.placements) {
          if (room === other || room.region !== other.region) continue;
          assert.ok(room.x + room.width <= other.x + 0.01 || other.x + other.width <= room.x + 0.01 || room.y + room.height <= other.y + 0.01 || other.y + other.height <= room.y + 0.01);
        }
      }
    }
  }
});

test("窄窗口统一缩小而不滚动，所有小格等大", () => {
  const plan = planFor(375, 600, 16);
  assert.equal(plan.constrained, true);
  assert.equal(plan.overflow, false);
  // 窗口较小：主窗达不到 640×360 可看底线时提示统一缩放。
  assert.ok(plan.quality < 0.98);
  assert.ok(plan.cell.width < 200);
  assert.ok(plan.main.width <= 375);
  close(plan.placements.at(-1).width, plan.placements[0].width);
  assert.ok(plan.containerH <= 600);
  assert.ok(plan.offsetY > 0);
  close(plan.main.width + (plan.rightWidth ? plan.rightWidth + plan.gapX : 0), plan.containerW);
  close(plan.topHeight + (plan.bottomHeight ? plan.bottomHeight + plan.gapY : 0), plan.containerH);
});

test("混合比例逐格保持直播流比例，非法输入回退 16:9", () => {
  const ratios = [9 / 16, 4 / 3, landscape, 1, 2];
  const plan = calculateFocusLayout({ width: 1920, height: 1200, secondaryRatios: ratios });
  assertContained(plan.mainVideo, plan.main, landscape);
  assert.deepEqual(plan.placements.map((room) => room.index), [0, 1, 2, 3, 4]);
  for (const room of plan.placements) {
    close(room.width, plan.cell.width);
    close(room.height, plan.cell.height);
    close(room.video.width / room.video.height, ratios[room.index]);
    assert.ok(room.video.width <= room.width + 0.01 && room.video.height <= room.height + 0.01);
  }
  const fallback = calculateFocusLayout({ width: 1280, height: 720, secondaryRatios: [0, Infinity] });
  assert.ok(fallback.placements.every((room) => Math.abs(room.video.width / room.video.height - landscape) < 0.01));
});

test("主视频比例只影响主窗画面盒，小格等大与精确满铺不受影响", () => {
  for (const mainRatio of [landscape, 9 / 16, 4 / 3, 32 / 9, NaN]) {
    const plan = planFor(1280, 720, 8, { mainRatio });
    assertContained(plan.mainVideo, plan.main, Number.isFinite(mainRatio) ? mainRatio : landscape);
    // 主窗允许黑边：画面盒不超出容器，也不要求铺满。
    assert.ok(plan.mainVideo.width * plan.mainVideo.height <= plan.main.width * plan.main.height + 0.01);
    assert.ok(plan.layoutFillRatio > 0.99);
    assert.ok(plan.placements.every((room) => Math.abs(room.width - plan.cell.width) < 0.01 && Math.abs(room.height - plan.cell.height) < 0.01));
  }
});

test("2 房间单格满幅镶嵌，主窗主导且严格 16:9 无黑边", () => {
  const plan = planFor(1280, 720, 2);
  assert.equal(plan.placements.length, 1);
  // 方案 A：副屏严格保持 16:9，与大屏等比例，内部零黑边（meanVisible === 1）
  assert.ok(plan.dominant);
  assert.ok(plan.main.width * plan.main.height >= plan.cell.width * plan.cell.height * FOCUS_LIMITS.mainAreaRatio - 0.01);
  assert.equal(plan.meanVisible, 1);
  close(plan.cellRatio, landscape);
  close(plan.cell.width / plan.cell.height, landscape);
  assert.ok(plan.layoutFillRatio >= 0.8);
});

test("不可测量视口不计算，重复计算保持分区和尺寸稳定", () => {
  assert.equal(planFor(0, 0, 8), null);
  assert.equal(planFor(NaN, 720, 8), null);
  const first = planFor(1280, 720, 8);
  const second = planFor(1280, 720, 8, { previous: first.signature });
  assert.equal(second.signature, first.signature);
  assert.deepEqual(second.main, first.main);
  assert.deepEqual(second.placements, first.placements);
});

test("16 房间正常窗口全部同屏、等大且下右双区", () => {
  const plan = planFor(1280, 720, 16);
  assert.equal(plan.overflow, false);
  // 1280 宽度下 6 列 16:9 网格，主屏占 3 列，宽度达到 639.5px（约为 640）
  assert.ok(plan.main.width >= 635);
  assert.ok(plan.layoutFillRatio > 0.95);
  assert.equal(plan.bothRegions, true);
  assert.ok(plan.placements.every((room) => Math.abs(room.width - plan.cell.width) < 0.01));
  assert.ok(plan.cell.width >= 120 && plan.cell.height >= 60);
});

test("3–16 房方案 A 要求：严格 16:9、小窗全等、零内部黑边、外接触点或留黑", () => {
  for (const [width, height] of [[1280, 720], [1920, 1080], [375, 600]]) {
    for (let count = 3; count <= 16; count++) {
      const plan = planFor(width, height, count);
      const tag = `${width}×${height}/${count}`;
      assert.equal(plan.overflow, false, tag);
      assert.ok(plan.dominant, tag);
      assert.ok(plan.layoutFillRatio >= 0.9, tag);
      // 1. 所有画面严格 16:9
      close(plan.main.width / plan.main.height, landscape, `${tag}: 主屏需 16:9`);
      close(plan.cell.width / plan.cell.height, landscape, `${tag}: 单元格需 16:9`);
      // 2. 所有小窗大小一致且内部零黑边
      for (const room of plan.placements) {
        close(room.width, plan.cell.width);
        close(room.height, plan.cell.height);
        close(room.video.width / room.video.height, landscape);
        close(room.width / room.height, landscape);
      }
      close(plan.meanVisible, 1, `${tag}: 内部零黑边`);
      // 3. 容器尺寸不超出视口，在视口中居中留黑
      assert.ok(plan.containerW <= width + 0.01, `${tag}: 容器宽不超出视口`);
      assert.ok(plan.containerH <= height + 0.01, `${tag}: 容器高不超出视口`);
      close(plan.offsetX, Math.max(0, (width - plan.containerW) / 2));
      close(plan.offsetY, Math.max(0, (height - plan.containerH) / 2));
      // 4. 矩阵横向与纵向精确拼接
      close(plan.main.width + (plan.rightWidth ? plan.rightWidth + plan.gapX : 0), plan.containerW, `${tag}: 横向拼接`);
      close(plan.topHeight + (plan.bottomHeight ? plan.bottomHeight + plan.gapY : 0), plan.containerH, `${tag}: 纵向拼接`);
      if (width >= 1280) {
        assert.ok(plan.cell.width >= 120 && plan.cell.height >= 60, `${tag}: 格子尺寸过小`);
      }
    }
  }
});
