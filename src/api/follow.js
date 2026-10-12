import { API_BASE } from "../core/settings.js";
import { fetchJson } from "../core/fetch-json.js";
import { liveStatusFromRaw } from "../core/room.js";
import { pickAvatar } from "./pick-avatar.js";
import { normalizeRoomName } from "../core/room-name.js";

// 仅过滤关注数据中的赛事推荐；不影响搜索或手动添加。
export const isExcludedFollowRoom = (name) => String(name || "").replace(/\s+/g, "").includes("斗鱼吃鸡赛事");

// 列表接口的状态可能过时或把轮播当开播，这里只做初值，随后由房间探测校对。
export const normalizeFollowRooms = (payload) => {
  const raw = Array.isArray(payload?.data?.list) ? payload.data.list : Array.isArray(payload?.data?.roomList) ? payload.data.roomList : Array.isArray(payload?.data) ? payload.data : [];
  const rooms = [];
  for (const item of raw) {
    const rid = String(item?.rid ?? item?.roomId ?? item?.room_id ?? "");
    if (!/^[1-9]\d{0,11}$/.test(rid)) continue;
    if ([item.nickname, item.nickName, item.owner_name, item.roomName, item.nick_name, item.room_name, item.room_title, item.title, item.show_name, item.show_details, item.subject].some(isExcludedFollowRoom)) continue;
    rooms.push({ rid, name: normalizeRoomName(item?.nickname ?? item?.nickName ?? item?.owner_name ?? item?.nick_name ?? item?.room_name, rid), liveStatus: liveStatusFromRaw(item?.show_status ?? item?.isLive ?? item?.live_status ?? item?.is_live ?? 0, item?.videoLoop ?? item?.isLoop ?? item?.is_loop ?? 0), avatar: pickAvatar(item.roomSrc, item.roompic, item.room_pic, item.avatar, item.userAvatar, item.headPic) });
  }
  return rooms;
};

export const scrapeFollowPage = () => {
  if (typeof document === "undefined") return [];
  const rooms = /* @__PURE__ */ new Map();
  for (const anchor of document.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href") || "";
    const match = href.match(/^\/([1-9]\d{0,11})\/?$/) || href.match(/^https?:\/\/(?:www\.)?douyu\.com\/([1-9]\d{0,11})\/?$/);
    if (!match || rooms.has(match[1])) continue;
    const name = (anchor.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (isExcludedFollowRoom(name) || isExcludedFollowRoom(anchor.getAttribute("title"))) continue;
    rooms.set(match[1], { rid: match[1], name: normalizeRoomName(name, match[1]), liveStatus: "offline" });
  }
  return [...rooms.values()].slice(0, 50);
};

export const fetchFollowPage = async (signal, page = 1) => {
  const offset = (page - 1) * 50;
  const endpoints = [
    `${API_BASE}/japi/weblist/api/getFollowList?offset=${offset}&limit=50&filter=0`,
    `${API_BASE}/japi/cp/follow/rooms?tab=subscribe&page=${page}&limit=50`,
    `${API_BASE}/member/api/interact/getFollowList?cate=0&offset=${offset}&limit=50`
  ];
  let lastError = null;
  for (const url of endpoints) {
    try {
      const payload = await fetchJson(url, { credentials: "include" }, signal, "关注列表");
      const rooms = normalizeFollowRooms(payload);
      if (rooms.length) return rooms;
      lastError = new Error("未获取到关注直播间，请确认已登录并有关注");
    } catch (error) {
      lastError = error;
    }
  }
  if (page === 1) {
    const scraped = scrapeFollowPage();
    if (scraped.length) return scraped;
  }
  if (lastError) throw lastError;
  return [];
};

export const fetchFollowRooms = async (signal, { maxPages = 3, onProgress = null } = {}) => {
  const rank = { live: 2, carousel: 1, offline: 0 };
  const all = [];
  const seen = new Set();
  let lastError = null;

  for (let page = 1; page <= maxPages; page++) {
    try {
      const list = await fetchFollowPage(signal, page);
      if (!list || list.length === 0) break;
      for (const room of list) {
        if (!seen.has(room.rid)) {
          seen.add(room.rid);
          all.push(room);
        }
      }
      if (typeof onProgress === "function") {
        try {
          onProgress({ page, count: all.length, isFinal: list.length < 50 || page === maxPages });
        } catch {}
      }
      if (list.length < 50) break; // 最后一页
    } catch (error) {
      lastError = error;
      if (page === 1) throw error;
      break;
    }
  }

  if (all.length) {
    return all.sort((a, b) => (rank[b.liveStatus] ?? 0) - (rank[a.liveStatus] ?? 0));
  }
  throw lastError || new Error("关注列表获取失败");
};

