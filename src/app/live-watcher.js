import { fetchProbe } from "../api/probe.js";

// 时钟与开播感知：每秒刷新画格时钟与重试倒计时；每 30 秒探测未开播房间，开播时提醒。
export function initLiveWatcher(ctx) {
  setInterval(() => {
    if (!ctx.opened) return;
    const now = Date.now();
    const timeText = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    for (const tile of ctx.tiles.values()) {
      if (tile.clockEl && !tile.clockEl.hidden) tile.clockEl.textContent = timeText;
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
    const due = [...ctx.tiles.values()].filter((tile) => tile.liveStatus !== "live" && !tile.request && !["playing", "connecting", "signing", "queued", "probing", "reconnecting"].includes(tile.state) && now - (tile.lastProbe || 0) > 6e4);
    for (const tile of due.slice(0, 3)) {
      tile.lastProbe = now;
      void (async () => {
        try {
          const probe = await fetchProbe(tile.rid, new AbortController().signal);
          if (!ctx.tiles.has(tile.id)) return;
          tile.liveStatus = probe.liveStatus;
          tile.name = probe.name || tile.name;
          tile.lastProbe = Date.now();
          ctx.updateTileChrome(tile);
          if (probe.liveStatus === "live" && !["playing", "connecting", "signing", "queued", "probing", "reconnecting"].includes(tile.state)) {
            if (ctx.liveAlerts) {
              ctx.showToast(`${tile.name || tile.rid} 开播了`, [
                { label: "立即播放", primary: true, onClick: () => void ctx.handleStart(tile) },
                { label: "忽略" }
              ], 12e3);
              if (ctx.liveAlertSound) ctx.beep();
              try {
                const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
                if (pageWindow.Notification && Notification.permission === "granted") new Notification("监控室", { body: `${tile.name || tile.rid} 开播了` });
              } catch {
              }
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
