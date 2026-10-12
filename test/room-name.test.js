import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { normalizeRoomName, roomDisplayName } from "../src/core/room-name.js";
import { addRowMarkup } from "../src/ui/tile-markup.js";

test("旧房号和链接不作为用户名，真实数字用户名仍保留", () => {
  assert.equal(normalizeRoomName("123", "123"), "");
  assert.equal(normalizeRoomName("https://www.douyu.com/123", "123"), "");
  assert.equal(normalizeRoomName("456", "123"), "456");
  assert.equal(normalizeRoomName(" 主播甲 ", "123"), "主播甲");
  assert.equal(roomDisplayName({ rid: "123", name: "123" }), "正在获取主播名");
  assert.equal(roomDisplayName({ rid: "123", nameStatus: "error" }), "主播名获取失败");
});

test("房间列表只展示用户名，正确转义用户名和无障碍标签", () => {
  const win = new Window();
  try {
    const markup = addRowMarkup({ rid: "123456", name: '主播<甲>"', category: "游戏" }, { disabled: false, badge: "直播中", badgeClass: "rbadge" }, false);
    win.document.body.innerHTML = markup;
    assert.equal(win.document.querySelector(".rinfo b").textContent, '主播<甲>"');
    assert.ok(markup.includes('aria-label="选择 主播&lt;甲&gt;&quot;"'));
    assert.ok(!win.document.body.textContent.includes("123456"));
    assert.equal(win.document.querySelector("[data-rid]").dataset.rid, "123456");
  } finally { win.close(); }
});
