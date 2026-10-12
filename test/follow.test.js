import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { normalizeFollowRooms, scrapeFollowPage, fetchFollowRooms } from "../src/api/follow.js";
import { normalizeSearchResults } from "../src/api/search.js";

test("关注接口所有名称字段过滤赛事，保留其他直播间", () => {
  for (const field of ["nickname", "nickName", "owner_name", "roomName", "nick_name", "room_name", "room_title", "title", "show_name", "show_details", "subject"]) {
    const rooms = normalizeFollowRooms({ data: { list: [
      { rid: 123, [field]: " 斗鱼 吃鸡赛事 " },
      { rid: 456, nickname: "正常主播" }
    ] } });
    assert.deepEqual(rooms.map((room) => room.rid), ["456"]);
  }
  const searched = normalizeSearchResults({ data: [{ roomResult: { rid: 123, nickName: "斗鱼吃鸡赛事" } }] });
  assert.equal(searched.length, 1);
});

test("页面兜底也过滤赛事名称和链接标题", () => {
  const win = new Window();
  const previous = globalThis.document;
  try {
    globalThis.document = win.document;
    win.document.body.innerHTML = '<a href="/123">斗鱼吃鸡赛事</a><a href="/456" title="斗鱼吃鸡赛事">封面</a><a href="/789">正常主播</a>';
    assert.deepEqual(scrapeFollowPage().map((room) => room.rid), ["789"]);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
    win.close();
  }
});

test("fetchFollowRooms 多页拉取、去重、状态排序与进度通知", async () => {
  const originalFetch = globalThis.fetch;
  const progressLogs = [];

  // 构造第 1 页 50 个房间（含不同开播状态），第 2 页 2 个房间（含 1 个重复）
  const page1List = Array.from({ length: 50 }, (_, i) => ({
    rid: String(1000 + i),
    nickname: `主播_${1000 + i}`,
    show_status: i === 0 ? 2 : 1, // 1000 未开播（show_status 2=未开播）
    videoLoop: i === 1 ? 1 : 0 // 1001 轮播中，其余直播
  }));
  const page2List = [
    { rid: "1000", nickname: "主播_1000", show_status: 2 }, // 重复项
    { rid: "2000", nickname: "主播_2000", show_status: 1 } // 新房间
  ];

  try {
    globalThis.fetch = async (url) => {
      const u = new URL(url);
      const offset = Number(u.searchParams.get("offset") || 0);
      const list = offset === 0 ? page1List : page2List;
      return {
        ok: true,
        json: async () => ({ error: 0, data: { list } })
      };
    };

    const controller = new AbortController();
    const rooms = await fetchFollowRooms(controller.signal, {
      maxPages: 3,
      onProgress: (info) => progressLogs.push(info)
    });

    // 50 + 2 - 1(去重) = 51 个房间
    assert.equal(rooms.length, 51);
    // 进度回调触发 2 次（第 1 页满 50，第 2 页 2 个结束）
    assert.equal(progressLogs.length, 2);
    assert.equal(progressLogs[0].page, 1);
    assert.equal(progressLogs[0].count, 50);
    assert.equal(progressLogs[1].page, 2);
    assert.equal(progressLogs[1].count, 51);
    assert.equal(progressLogs[1].isFinal, true);

    // 状态排序优先级：live > carousel > offline
    assert.equal(rooms[0].liveStatus, "live");
    const carouselIndex = rooms.findIndex((r) => r.rid === "1001");
    const offlineIndex = rooms.findIndex((r) => r.rid === "1000");
    assert.ok(carouselIndex >= 0);
    assert.ok(offlineIndex >= 0);
    assert.ok(carouselIndex < offlineIndex, "轮播中应排在未开播前面");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchFollowRooms 第一页成功但后续页失败时容错返回已加载房间", async () => {
  const originalFetch = globalThis.fetch;
  const page1List = Array.from({ length: 50 }, (_, i) => ({
    rid: String(1000 + i),
    nickname: `主播_${1000 + i}`,
    show_status: 1
  }));

  try {
    globalThis.fetch = async (url) => {
      const u = new URL(url);
      const offset = Number(u.searchParams.get("offset") || 0);
      if (offset === 0) {
        return { ok: true, json: async () => ({ error: 0, data: { list: page1List } }) };
      }
      throw new Error("网络抖动");
    };

    const controller = new AbortController();
    const rooms = await fetchFollowRooms(controller.signal, { maxPages: 3 });
    assert.equal(rooms.length, 50);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchFollowRooms 第一页请求失败抛出异常", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new Error("网络中断");
    };
    const controller = new AbortController();
    await assert.rejects(() => fetchFollowRooms(controller.signal, { maxPages: 3 }), /网络/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

