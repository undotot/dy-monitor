// [插件独立模块] 团播 API：负责拉取 13.xiebin.best 数据、解析与缓存，支持随时拆卸。
const BASE_URL = "https://13.xiebin.best/api";

export const BEAR_PAW_CODES = ["Can", "224", "heipi", "愉快"];

let groupsCache = null;
let groupsCacheTime = 0;
const membersCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟内存缓存

export function crossOriginGet(url, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("已取消", "AbortError"));

    const gmXhr = typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : globalThis.GM_xmlhttpRequest;
    if (typeof gmXhr === "function") {
      let aborted = false;
      const onAbort = () => {
        aborted = true;
        try { xhr.abort(); } catch {}
        reject(new DOMException("已取消", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      const xhr = gmXhr({
        method: "GET",
        url,
        timeout: 10000,
        headers: { Accept: "application/json" },
        onload: (res) => {
          signal?.removeEventListener("abort", onAbort);
          if (aborted) return;
          if (res.status >= 200 && res.status < 300) {
            try {
              resolve(JSON.parse(res.responseText));
            } catch {
              reject(new Error("响应数据解析失败"));
            }
          } else {
            reject(new Error(`HTTP ${res.status}`));
          }
        },
        onerror: () => {
          signal?.removeEventListener("abort", onAbort);
          if (!aborted) reject(new Error("网络请求失败"));
        },
        ontimeout: () => {
          signal?.removeEventListener("abort", onAbort);
          if (!aborted) reject(new Error("请求超时"));
        }
      });
      return;
    }

    fetch(url, { signal, headers: { Accept: "application/json" } })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(resolve)
      .catch(reject);
  });
}

export function normalizeGroups(list, { onlyActive = true } = {}) {
  if (!Array.isArray(list)) return [];
  const normalized = list.map((g) => {
    const isBearPaw = BEAR_PAW_CODES.includes(g.code);
    const activeSeason = g.seasons?.[0] || null;
    return {
      code: g.code,
      name: g.name,
      kind: g.kind === "fixed" ? "大团" : "小团",
      leaderName: g.leaderName || "",
      leaderAvatarUrl: g.leaderAvatarUrl || "",
      isBearPaw,
      category: isBearPaw ? "bear" : "other",
      seasonName: activeSeason?.name || "",
      seasonStatus: activeSeason?.status || "",
      isActive: activeSeason?.status === "active"
    };
  });
  return onlyActive ? normalized.filter((g) => g.isActive) : normalized;
}

export function sortRoomsByLiveStatus(rooms) {
  if (!Array.isArray(rooms)) return [];
  const rank = { live: 3, carousel: 2, offline: 0 };
  return rooms.sort((a, b) => {
    const ra = rank[a.liveStatus] ?? 1;
    const rb = rank[b.liveStatus] ?? 1;
    if (ra !== rb) return rb - ra; // 已开播(3) > 轮播中(2) > 检查中(1) > 未开播(0)
    // 同状态下：团长优先，队长次之，其后队员
    if (a.isLeader !== b.isLeader) return a.isLeader ? -1 : 1;
    if (a.isCaptain !== b.isCaptain) return a.isCaptain ? -1 : 1;
    return 0;
  });
}

export async function fetchGroups({ signal, force = false } = {}) {
  const now = Date.now();
  if (!force && groupsCache && now - groupsCacheTime < CACHE_TTL) {
    return groupsCache;
  }
  const res = await crossOriginGet(`${BASE_URL}/groups/`, signal);
  if (res && res.code === 0 && Array.isArray(res.data)) {
    const groups = normalizeGroups(res.data);
    groupsCache = groups;
    groupsCacheTime = now;
    return groups;
  }
  throw new Error(res?.message || "获取团播列表失败");
}

export function normalizeGroupMembers(detail) {
  if (!detail || typeof detail !== "object") return [];
  const season = detail.season;
  const rawMembers = Array.isArray(season?.members) ? season.members : [];

  const list = [];
  const seenRids = new Set();

  for (const m of rawMembers) {
    const rid = String(m.roomId || "").trim();
    if (!rid || !/^\d+$/.test(rid) || seenRids.has(rid)) continue;
    seenRids.add(rid);

    const isLeader = Boolean(m.isLeader || (detail.leader && detail.leader.roomId === m.roomId));
    const isCaptain = Boolean(m.isCaptain);
    const roleText = isLeader ? "团长" : isCaptain ? "队长" : "队员";

    list.push({
      rid,
      name: m.name || `房间${rid}`,
      avatar: m.avatarUrl || "",
      roleText,
      isLeader,
      isCaptain,
      liveStatus: null,
      category: `${detail.name || "团播"} · ${roleText}`
    });
  }

  if (detail.leader && detail.leader.roomId) {
    const leaderRid = String(detail.leader.roomId);
    if (!seenRids.has(leaderRid)) {
      list.unshift({
        rid: leaderRid,
        name: detail.leader.name || `房间${leaderRid}`,
        avatar: detail.leader.avatarUrl || "",
        roleText: "团长",
        isLeader: true,
        isCaptain: false,
        liveStatus: null,
        category: `${detail.name || "团播"} · 团长`
      });
    }
  }

  return list;
}

export async function fetchGroupMembers(code, { signal, force = false } = {}) {
  const now = Date.now();
  const cached = membersCache.get(code);
  if (!force && cached && now - cached.time < CACHE_TTL) {
    return cached.members;
  }
  const res = await crossOriginGet(`${BASE_URL}/groups/${encodeURIComponent(code)}`, signal);
  if (res && res.code === 0 && res.data) {
    const members = normalizeGroupMembers(res.data);
    membersCache.set(code, { time: now, members });
    return members;
  }
  throw new Error(res?.message || `获取团播[${code}]成员失败`);
}

export function clearGroupsCache() {
  groupsCache = null;
  groupsCacheTime = 0;
  membersCache.clear();
}
