import { fetchProbe } from "../api/probe.js";
import { normalizeRoomName, roomDisplayName } from "../core/room-name.js";

export function showNotification(title, body) {
  try {
    if (typeof GM_notification === "function") {
      GM_notification({ title, text: body });
      return;
    }
  } catch {}
  try {
    const pageWindow = typeof unsafeWindow !== "undefined" && unsafeWindow?.Notification
      ? unsafeWindow
      : (typeof window !== "undefined" ? window : globalThis);
    const Notif = pageWindow?.Notification;
    if (Notif && Notif.permission === "granted") {
      new Notif(title, { body });
    }
  } catch {}
}

// 重试与状态感知：每秒刷新重试倒计时；每 30 秒对空闲房间重新获取直播状态
// （直播中/轮播中/未开播），转入开播时提醒。
export function initLiveWatcher(ctx) {
  setInterval(() => {
    if (!ctx.opened) return;
    const now = Date.now();
    for (const tile of ctx.tiles.values()) {
      if (tile.state === "reconnecting" && tile.retryAt) {
        tile.retryEl.hidden = false;
        tile.retryText.textContent = `${Math.max(0, Math.ceil((tile.retryAt - now) / 1000))} 秒后自动重试（${tile.attempt}/5）`;
      } else if (!tile.retryEl.hidden) {
        tile.retryEl.hidden = true;
      }
    }
  }, 1e3);

  setInterval(() => {
    if (!ctx.opened) return;
    const now = Date.now();
    // 重新获取状态要覆盖所有空闲房间（含曾判定开播的）：只查非直播会让徽章冻结在
    // 最后一次探测，主播下播或转轮播后永远停在“直播中”。
    const due = [...ctx.tiles.values()].filter((tile) => !tile.request && !["playing", "connecting", "signing", "queued", "probing", "reconnecting"].includes(tile.state) && now - (tile.lastProbe || 0) > 6e4);
    for (const tile of due.slice(0, 3)) {
      tile.lastProbe = now;
      void (async () => {
        try {
          const probe = await fetchProbe(tile.rid, new AbortController().signal);
          if (!ctx.tiles.has(tile.id)) return;
          const wasLive = tile.liveStatus === "live";
          tile.liveStatus = probe.liveStatus;
          tile.name = normalizeRoomName(probe.name, probe.rid) || tile.name;
          tile.nameStatus = tile.name ? "ready" : "error";
          tile.lastProbe = Date.now();
          ctx.updateTileChrome(tile);
          if (probe.liveStatus === "live" && !wasLive && !["playing", "connecting", "signing", "queued", "probing", "reconnecting"].includes(tile.state)) {
            if (ctx.liveAlerts) {
              ctx.showToast(`${roomDisplayName(tile)} 开播了`, [
                { label: "立即播放", primary: true, onClick: () => void ctx.handleStart(tile) },
                { label: "忽略" }
              ], 12e3);
              if (ctx.liveAlertSound) ctx.beep();
              showNotification("监控室", `${roomDisplayName(tile)} 开播了`);
              tile.root.classList.add("is-live-alert");
              setTimeout(() => tile.root.classList.remove("is-live-alert"), 1e4);
            }
            if (ctx.liveAutoPlay) void ctx.handleStart(tile);
          }
        } catch {
        }
      })();
    }
  }, 3e4);
}
