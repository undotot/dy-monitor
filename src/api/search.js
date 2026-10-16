import { API_BASE } from "../core/settings.js";
import { fetchJson } from "../core/fetch-json.js";
import { parseRoom, liveStatusFromRaw } from "../core/room.js";
import { pickAvatar } from "./pick-avatar.js";
import { normalizeRoomName } from "../core/room-name.js";

export const normalizeSearchResults = (payload) => {
  const rooms = /* @__PURE__ */ new Map();
  const entries = Array.isArray(payload?.data?.relateUser) ? payload.data.relateUser : Array.isArray(payload?.data) ? payload.data : [];
  for (const entry of entries) {
    // 正式搜索：用户类型 1 才是主播，UP主/创作者及分类不作为直播间添加。
    if (!entry || (entry.type != null && Number(entry.type) !== 1)) continue;
    const room = entry.anchorInfo ?? entry.roomResult ?? entry;
    const rid = String(room?.rid ?? room?.roomId ?? room?.room_id ?? "");
    if (!/^[1-9]\d{0,11}$/.test(rid) || rooms.has(rid)) continue;
    rooms.set(rid, { rid, name: normalizeRoomName(room.nickName || room.nickname || room.owner_name || room.roomName || room.nick_name, rid), category: String(room.cateName || room.cate_name || "").slice(0, 40), liveStatus: liveStatusFromRaw(room.isLive ?? room.show_status, room.isLoop ?? room.videoLoop), avatar: pickAvatar(room.roomSrc, room.roompic, room.room_pic, room.avatar, room.userAvatar, entry.roomSrc) });
  }
  return [...rooms.values()];
};

// 与官网“用户 → 主播”一致：searchUser，filterType=1；联想 getSearchRecV2 不是正式搜索。
export const searchRoomPage = async (input, signal, probe, { page = 1, fetchImpl = globalThis.fetch } = {}) => {
  const text = input.trim();
  if (!text || text.length > (/^https?:/i.test(text) ? 2048 : 80)) throw new Error("房号或主播名不能超过 80 个字符");
  if (!Number.isInteger(page) || page < 1) throw new Error("搜索页码无效");
  if (/^\d+$/.test(text) || /^https?:/i.test(text)) {
    const room = await probe(parseRoom(text), signal);
    return { rooms: [{ ...room, rid: String(room.rid), category: room.category || "" }], page: 1, pageSize: 1, total: 1, hasMore: false };
  }
  const pageSize = 28;
  const payload = await fetchJson(`${API_BASE}/japi/search/api/searchUser?kw=${encodeURIComponent(text)}&page=${page}&pageSize=${pageSize}&filterType=1`, { credentials: "include" }, signal, "主播搜索", fetchImpl);
  if (!Array.isArray(payload.data?.relateUser)) throw new Error("主播搜索：响应结构异常，请稍后重试");
  const total = Math.max(0, Number(payload.data.total) || 0);
  return { rooms: normalizeSearchResults(payload), total, page, pageSize,
    hasMore: payload.data.relateUser.length > 0 && page * pageSize < total };
};

// 保留只需要第一页房间数组的调用入口。
export const searchRooms = async (input, signal, probe, fetchImpl = globalThis.fetch) =>
  (await searchRoomPage(input, signal, probe, { fetchImpl })).rooms;
