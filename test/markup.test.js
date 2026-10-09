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
