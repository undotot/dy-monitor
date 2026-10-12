import { Window } from "happy-dom";
import { initStatus } from "../src/app/status.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { tileMarkup, addRowMarkup } from "../src/ui/tile-markup.js";
import { shellMarkup } from "../src/ui/shell-markup.js";
import { iconMarkup, paths } from "../src/ui/icons.js";

test("tileMarkup 关键节点齐全", () => {
  const m = tileMarkup();
  for (const token of [
    "data-drag", "data-dot", "data-t-vol", "data-t-solo", "data-t-danmaku",
    "data-t-pip", "data-t-retry-now", "data-dm-apply-all", "data-tile-settings"
  ]) assert.ok(m.includes(token), `缺少 ${token}`);
});

test("addRowMarkup 状态渲染", () => {
  const m = addRowMarkup({ rid: "9", name: "丙", avatar: "" }, { disabled: true, badge: "已添加", badgeClass: "rbadge rbadge-add" }, true);
  assert.ok(m.includes("已添加") && m.includes("disabled") && m.includes("checked"));
});

test("shellMarkup 三层架构与恢复提示钩子齐全", () => {
  const m = shellMarkup();
  for (const token of [
    "data-entry", "data-dialog", "data-wall", "data-drawer",
    "data-add-panel", "data-ctx", "data-toast", "data-resume-prompt",
    "data-resume-title", "data-resume-yes", "data-resume-no"
  ]) assert.ok(m.includes(token), `缺少 ${token}`);
});

test("shellMarkup 使用监控室新名称且不含快捷键与 Esc 提示", () => {
  const m = shellMarkup();
  assert.ok(m.includes("监控室"));
  assert.ok(!m.includes("斗鱼监控室"), "名称已改为“监控室”，不应再出现“斗鱼监控室”");
  assert.ok(!m.includes("监看台"));
  assert.ok(!m.includes("data-help"));
  assert.ok(!m.includes("Esc"), "快捷键与 Esc 分层后退均已暂时移除，不应再有 Esc 提示");
});

test("iconMarkup 未知图标回退 sliders", () => {
  assert.ok(iconMarkup("nope").includes(paths.sliders.slice(0, 20)));
  assert.ok(iconMarkup("grid").includes(paths.grid.slice(0, 20)));
  assert.ok(!iconMarkup("grid").includes(paths.sliders.slice(0, 20)));
});

test("正常播放不显示常驻文字，异常与重试仍有反馈", () => {
  const win = new Window();
  try {
    const root = win.document.createElement("article");
    root.innerHTML = tileMarkup();
    const tile = { dotEl: root.querySelector("[data-dot]"), noteEl: root.querySelector("[data-note]"), retryEl: root.querySelector("[data-retry]") };
    const ctx = {};
    initStatus(ctx);
    ctx.updateCount = () => {};
    ctx.setStatus(tile, "playing", "播放中");
    assert.equal(tile.noteEl.hidden, true);
    assert.equal(tile.noteEl.textContent, "");
    assert.equal(root.querySelector("[data-clock]"), null);
    ctx.setStatus(tile, "failed", "网络连接失败");
    assert.equal(tile.noteEl.hidden, false);
    assert.equal(tile.noteEl.textContent, "网络连接失败");
    tile.retryAt = 123;
    ctx.setStatus(tile, "reconnecting", "重试中");
    assert.equal(tile.noteEl.hidden, true);
    assert.equal(tile.retryEl.hidden, false);
  } finally { win.close(); }
});
