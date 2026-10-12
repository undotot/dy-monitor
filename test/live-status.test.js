import { test } from "node:test";
import assert from "node:assert/strict";
import { liveStatusFromRaw } from "../src/core/room.js";
import { normalizeFollowRooms } from "../src/api/follow.js";
import { normalizeSearchResults } from "../src/api/search.js";
import { dotMetaFor } from "../src/app/status.js";

test("liveStatusFromRaw 三态映射：轮播标志优先 / 1 直播中 / 其余未开播", () => {
  // 实测：show_status/isLive 的 2 是未开播不是轮播；轮播由 videoLoop/isLoop=1 标记。
  assert.equal(liveStatusFromRaw(1), "live");
  assert.equal(liveStatusFromRaw(2), "offline");
  assert.equal(liveStatusFromRaw(0), "offline");
  assert.equal(liveStatusFromRaw(3), "offline");
  assert.equal(liveStatusFromRaw(undefined), "offline");
  assert.equal(liveStatusFromRaw("1"), "live");
  assert.equal(liveStatusFromRaw("2"), "offline");
  assert.equal(liveStatusFromRaw(1, 1), "carousel");
  assert.equal(liveStatusFromRaw(1, 0), "live");
  assert.equal(liveStatusFromRaw(1, "1"), "carousel");
  assert.equal(liveStatusFromRaw(1, true), "carousel");
  assert.equal(liveStatusFromRaw(2, 1), "carousel");
  assert.equal(liveStatusFromRaw(1, undefined), "live");
});

test("关注列表状态校对：show_status 优先，轮播由 videoLoop 标记", () => {
  const rooms = normalizeFollowRooms({ data: { list: [
    { rid: 1001, nickname: "甲", show_status: 1, isLive: 1 },
    { rid: 1002, nickname: "乙", show_status: 1, videoLoop: 1 },
    { rid: 1003, nickname: "丙", show_status: 2, isLive: 1 },
    { rid: 1004, nickname: "丁" }
  ] } });
  assert.deepEqual(rooms.map((room) => [room.rid, room.liveStatus]), [
    ["1001", "live"], ["1002", "carousel"], ["1003", "offline"], ["1004", "offline"]
  ]);
});

test("搜索结果状态映射：isLive 1=开播 2=未开播，isLoop=1 轮播中", () => {
  const rooms = normalizeSearchResults({ data: [
    { roomResult: { rid: 2001, nickName: "甲", isLive: 1, isLoop: 0 } },
    { roomResult: { rid: 2002, nickName: "乙", isLive: 1, isLoop: 1 } },
    { roomResult: { rid: 2003, nickName: "丙", isLive: 2, isLoop: 0 } },
    { roomResult: { rid: 2004, nickName: "丁", isLive: 0 } }
  ] });
  assert.deepEqual(rooms.map((room) => [room.rid, room.liveStatus]), [
    ["2001", "live"], ["2002", "carousel"], ["2003", "offline"], ["2004", "offline"]
  ]);
});

test("状态点三态与瞬态配色：直播绿 / 轮播琥珀 / 未开播灰 / 瞬态蓝 / 异常红", () => {
  assert.deepEqual(dotMetaFor("playing", "live"), { dot: "g", label: "直播中" });
  assert.deepEqual(dotMetaFor("playing", "carousel"), { dot: "a", label: "轮播中" });
  assert.deepEqual(dotMetaFor("playing", "offline"), { dot: "g", label: "直播中" });
  assert.deepEqual(dotMetaFor("waiting", "offline"), { dot: "gr", label: "未开播" });
  assert.deepEqual(dotMetaFor("stopped", "live"), { dot: "gr", label: "未播放" });
  for (const state of ["reconnecting", "signing", "connecting", "queued", "probing", "blocked"]) {
    assert.equal(dotMetaFor(state, "live").dot, "w", state);
  }
  assert.deepEqual(dotMetaFor("failed", "live"), { dot: "r", label: "播放异常" });
  assert.equal(dotMetaFor("未知状态", undefined).dot, "w");
});
