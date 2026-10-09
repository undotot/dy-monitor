import { test } from "node:test";
import assert from "node:assert/strict";
import { liveStatusFromRaw } from "../src/core/room.js";
import { normalizeFollowRooms } from "../src/api/follow.js";
import { normalizeSearchResults } from "../src/api/search.js";

test("liveStatusFromRaw 三态映射：1 直播中 / 2 轮播中 / 其余未开播", () => {
  assert.equal(liveStatusFromRaw(1), "live");
  assert.equal(liveStatusFromRaw(2), "carousel");
  assert.equal(liveStatusFromRaw(0), "offline");
  assert.equal(liveStatusFromRaw(3), "offline");
  assert.equal(liveStatusFromRaw(undefined), "offline");
  assert.equal(liveStatusFromRaw("1"), "live");
  assert.equal(liveStatusFromRaw("2"), "carousel");
});

test("关注列表状态校对：show_status 优先，轮播不并入直播", () => {
  const rooms = normalizeFollowRooms({ data: { list: [
    { rid: 1001, nickname: "甲", show_status: 1, isLive: 1 },
    { rid: 1002, nickname: "乙", show_status: 2, isLive: 1 },
    { rid: 1003, nickname: "丙", isLive: 0 },
    { rid: 1004, nickname: "丁" }
  ] } });
  assert.deepEqual(rooms.map((room) => [room.rid, room.liveStatus]), [
    ["1001", "live"], ["1002", "carousel"], ["1003", "offline"], ["1004", "offline"]
  ]);
});

test("搜索结果状态映射", () => {
  const rooms = normalizeSearchResults({ data: [
    { roomResult: { rid: 2001, nickName: "甲", isLive: 1 } },
    { roomResult: { rid: 2002, nickName: "乙", isLive: 2 } },
    { roomResult: { rid: 2003, nickName: "丙", isLive: 0 } }
  ] });
  assert.deepEqual(rooms.map((room) => [room.rid, room.liveStatus]), [
    ["2001", "live"], ["2002", "carousel"], ["2003", "offline"]
  ]);
});
