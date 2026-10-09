import test from "node:test";
import assert from "node:assert/strict";
import { clampSidebarWidth } from "../src/app/layout.js";

test("clampSidebarWidth：范围内自由跟随", () => {
  assert.equal(clampSidebarWidth(1200, 400), 400);
  assert.equal(clampSidebarWidth(1200, 280), 280);
  assert.equal(clampSidebarWidth(1200, 590), 590);
});

test("clampSidebarWidth：主格不小于缩小的侧栏（侧栏不超过墙宽一半）", () => {
  assert.equal(clampSidebarWidth(1200, 900), 600);
  assert.equal(clampSidebarWidth(1650, 1000), 825);
});

test("clampSidebarWidth：侧栏收窄留 120px 可用性下限", () => {
  assert.equal(clampSidebarWidth(1200, 30), 120);
  assert.equal(clampSidebarWidth(200, 30), 120); // 极窄墙下限优先
});
