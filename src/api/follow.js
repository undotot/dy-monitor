import { API_BASE } from "../core/settings.js";
import { fetchJson } from "../core/fetch-json.js";
import { liveStatusFromRaw } from "../core/room.js";
import { pickAvatar } from "./pick-avatar.js";

// 列表接口的状态可能过时或把轮播当开播，这里只做初值，随后由房间探测校对。
export const normalizeFollowRooms = (payload) => {
  const raw = Array.isArray(payload?.data?.list) ? payload.data.list : Array.isArray(payload?.data?.roomList) ? payload.data.roomList : Array.isArray(payload?.data) ? payload.data : [];
  const rooms = [];
  for (const item of raw) {
    const rid = String(item?.rid ?? item?.roomId ?? item?.room_id ?? "");
    if (!/^[1-9]\d{0,11}$/.test(rid)) continue;
    rooms.push({ rid, name: String(item?.nickname ?? item?.nickName ?? item?.owner_name ?? item?.roomName ?? item?.nick_name ?? rid).slice(0, 80), liveStatus: liveStatusFromRaw(item?.show_status ?? item?.isLive ?? item?.live_status ?? item?.is_live ?? 0), avatar: pickAvatar(item.roomSrc, item.roompic, item.room_pic, item.avatar, item.userAvatar, item.headPic) });
  }
  return rooms;
};

export const scrapeFollowPage = () => {
  const rooms = /* @__PURE__ */ new Map();
  for (const anchor of document.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href") || "";
    const match = href.match(/^\/([1-9]\d{0,11})\/?$/) || href.match(/^https?:\/\/(?:www\.)?douyu\.com\/([1-9]\d{0,11})\/?$/);
    if (!match || rooms.has(match[1])) continue;
    const name = (anchor.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
    rooms.set(match[1], { rid: match[1], name: name || match[1], liveStatus: "offline" });
    console.log("🚀 ~ scrapeFollowPage ~ rooms:", rooms.values())
  }
  return [...rooms.values()].slice(0, 50);
};

export const fetchFollowRooms = async (signal) => {
  const endpoints = [
    `${API_BASE}/japi/weblist/api/getFollowList?offset=0&limit=50&filter=0`,
    `${API_BASE}/japi/cp/follow/rooms?tab=subscribe&page=1&limit=50`,
    `${API_BASE}/member/api/interact/getFollowList?cate=0&offset=0&limit=50`
  ];
  let lastError = null;
  for (const url of endpoints) {
    try {
      const payload = await fetchJson(url, { credentials: "include" }, signal, "关注列表");
      const rank = { live: 2, carousel: 1, offline: 0 };
      const rooms = normalizeFollowRooms(payload).sort((a, b) => (rank[b.liveStatus] ?? 0) - (rank[a.liveStatus] ?? 0));
      if (rooms.length) return rooms;
      lastError = new Error("未获取到关注直播间，请确认已登录并有关注");
    } catch (error) {
      lastError = error;
    }
  }
  const scraped = scrapeFollowPage();
  if (scraped.length) return scraped;
  throw lastError || new Error("关注列表获取失败");
};
