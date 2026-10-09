import { API_BASE } from "../core/settings.js";
import { fetchJson } from "../core/fetch-json.js";
import { parseRoom, liveStatusFromRaw } from "../core/room.js";
import { pickAvatar } from "./pick-avatar.js";

export const normalizeSearchResults = (payload) => {
  const rooms = /* @__PURE__ */ new Map();
  for (const entry of Array.isArray(payload?.data) ? payload.data : []) {
    const room = entry?.roomResult, rid = String(room?.rid || "");
    if (!/^[1-9]\d{0,11}$/.test(rid) || rooms.has(rid)) continue;
    rooms.set(rid, { rid, name: String(room.nickName || entry.kw || rid).slice(0, 80), category: String(room.cateName || "").slice(0, 40), liveStatus: liveStatusFromRaw(room.isLive), avatar: pickAvatar(room.roomSrc, room.roompic, room.room_pic, room.avatar, room.userAvatar, entry.roomSrc) });
  }
  return [...rooms.values()].slice(0, 30);
};

export const searchRooms = async (input, signal, probe, fetchImpl = globalThis.fetch) => {
  const text = input.trim();
  if (!text || text.length > (/^https?:/i.test(text) ? 2048 : 80)) throw new Error("房号或主播名不能超过 80 个字符");
  if (/^\d+$/.test(text) || /^https?:/i.test(text)) {
    const room = await probe(parseRoom(text), signal);
    return [{ ...room, category: room.category || "" }];
  }
  if (text.length < 2) throw new Error("主播名至少输入两个字符");
  const payload = await fetchJson(`${API_BASE}/japi/search/api/getSearchRecV2?kw=${encodeURIComponent(text)}`, { credentials: "include" }, signal, "房间搜索", fetchImpl);
  return normalizeSearchResults(payload);
};
