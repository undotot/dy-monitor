import { API_BASE } from "../core/settings.js";
import { liveStatusFromRaw } from "../core/room.js";
import { pickAvatar } from "./pick-avatar.js";

// 房间探测：/betard/{rid}，15 秒超时，支持外层信号取消。
export async function fetchProbe(rid, signal) {
  const controller = new AbortController();
  const handleAbort = () => controller.abort();
  signal.addEventListener("abort", handleAbort, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(handleAbort, 15e3);
  try {
    const response = await fetch(`${API_BASE}/betard/${rid}`, { credentials: "include", signal: controller.signal });
    if (!response.ok) throw new Error(`房间探测：HTTP ${response.status}`);
    const payload = await response.json();
    const room = payload.room || payload.data?.room;
    if (!room || !/^\d+$/.test(String(room.room_id))) throw new Error("房间探测：未返回有效房间");
    return {
      rid: String(room.room_id),
      liveStatus: liveStatusFromRaw(room.show_status),
      name: String(room.owner_name || room.name || ""),
      category: String(room.cate_name || room.game_name || ""),
      avatar: pickAvatar(room.room_src, room.room_pic, room.avatar, room.owner_avatar)
    };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", handleAbort);
  }
}
