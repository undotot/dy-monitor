import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSearchResults, searchRoomPage } from "../src/api/search.js";

const entry = (rid, nickName, extra = {}) => ({ type: 1, anchorInfo: { rid, nickName, isLive: 1, ...extra } });
const signal = () => new AbortController().signal;
const json = (data) => async () => ({ ok: true, json: async () => ({ error: 0, data }) });

test("正式搜索遵循官网searchUser参数，支持单字、分页并保留官方排序", async () => {
  const requests = [];
  const page = await searchRoomPage("飞", signal(), null, { page: 2, fetchImpl: async (url, options) => {
    requests.push({ url: new URL(url), credentials: options.credentials });
    return json({ total: 60, pageSize: 28, relateUser: [entry(84452, "主播阿飞"), entry(114657, "你的阿飞ovo", { isLive: 2 })] })();
  } });
  assert.equal(requests[0].url.pathname, "/japi/search/api/searchUser");
  assert.equal(requests[0].url.searchParams.get("kw"), "飞");
  assert.equal(requests[0].url.searchParams.get("filterType"), "1");
  assert.equal(requests[0].url.searchParams.get("page"), "2");
  assert.equal(requests[0].url.searchParams.get("pageSize"), "28");
  assert.equal(requests[0].credentials, "include");
  assert.deepEqual(page.rooms.map((room) => room.rid), ["84452", "114657"]);
  assert.equal(page.rooms[1].liveStatus, "offline");
  assert.equal(page.hasMore, true);
});

test("正式结果解析只取有效主播，过滤普通用户/UP主/分类，并按房间去重", () => {
  const rooms = normalizeSearchResults({ data: { relateUser: [entry(123, "主播甲"),
    { type: 2, upInfo: { rid: 456, nickName: "视频用户" } },
    { type: 3, creatorInfo: { rid: 678, nickName: "创作者" } }, entry(0, "空房间"),
    entry(123, "重复主播"), entry(987, "主播乙", { isLive: 2, isLoop: 1 }),
  ] } });
  assert.deepEqual(rooms.map((room) => [room.rid, room.name, room.liveStatus]), [["123", "主播甲", "live"], ["987", "主播乙", "carousel"]]);
});

test("数字/链接只精确探测并返回结果，不调用模糊搜索或添加房间", async () => {
  for (const text of ["84452", "https://www.douyu.com/84452"]) {
    const page = await searchRoomPage(text, signal(), async (rid) => ({ rid, name: "主播阿飞" }), { fetchImpl: () => { throw new Error("不应模糊搜索"); } });
    assert.equal(page.rooms[0].rid, "84452");
    assert.equal(page.hasMore, false);
  }
});

test("空结果、结构异常、官方错误及取消请求分别处理，不伪装为空搜索", async () => {
  assert.deepEqual((await searchRoomPage("没有主播", signal(), null, { fetchImpl: json({ total: 0, relateUser: [] }) })).rooms, []);
  await assert.rejects(searchRoomPage("主播", signal(), null, { fetchImpl: json({ total: 3 }) }), /响应结构异常/);
  await assert.rejects(searchRoomPage("主播", signal(), null, { fetchImpl: async () => ({ ok: true, json: async () => ({ error: 8, msg: "请完成验证" }) }) }), /请完成验证/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(searchRoomPage("主播", controller.signal, null, { fetchImpl: async (_, options) => { if (options.signal.aborted) throw new DOMException("取消", "AbortError"); } }), { name: "AbortError" });
});
