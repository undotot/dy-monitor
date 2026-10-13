import mpegts from "mpegts.js";
import { safeMessage } from "../core/settings.js";
import { fetchProbe } from "../api/probe.js";
import { DanmakuClient } from "../api/danmaku-client.js";
import { recordHistory } from "../api/history.js";
import { normalizeRoomName } from "../core/room-name.js";

// 播放管线：代次（generation）取消 + 指数退避重试 + 看门狗。
// resetPlayback 只清资源不改状态（避免闪烁）；状态由 handleStart 显式设置。
export function initPlayback(ctx) {
  ctx.disposePlayer = (tile) => {
    tile.danmakuClient?.stop();
    tile.danmakuClient = null;
    tile.renderer?.stop();
    tile.video.onplaying = null;
    tile.video.onwaiting = null;
    tile.video.onerror = null;
    if (tile.loadingEl) tile.loadingEl.hidden = true;
    clearInterval(tile.watch);
    clearTimeout(tile.retryTimer);
    clearTimeout(tile.stableTimer);
    tile.watch = tile.retryTimer = tile.stableTimer = null;
    const player = tile.player;
    tile.player = null;
    if (player) {
      for (const method of ["pause", "unload", "detachMediaElement", "destroy"]) {
        try {
          player[method]();
        } catch {
          ctx.log(tile.rid, `播放器 ${method} 回收异常`);
        }
      }
    }
    tile.video.pause();
    tile.video.removeAttribute("src");
    tile.video.load();
  };

  ctx.resetPlayback = (tile) => {
    tile.generation++;
    tile.request?.abort();
    tile.request = null;
    ctx.disposePlayer(tile);
    ctx.scheduler.release(tile.id);
    tile.retrying = false;
    tile.retryAt = 0;
  };

  ctx.stop = (tile, message = "已停止") => {
    ctx.resetPlayback(tile);
    ctx.setStatus(tile, "stopped", message);
  };

  ctx.handleDanmaku = (tile) => {
    tile.danmakuClient?.stop();
    tile.danmakuClient = null;
    tile.renderer.stop();
    tile.renderer.update(tile.danmaku, { sidebarEl: tile.dmSidebar, sidebarListEl: tile.dmSidebarList });
    if (!tile.danmaku.enabled || !tile.player) {
      const msg = tile.danmaku.enabled ? "播放后连接弹幕" : "弹幕已关闭";
      tile.dmStatus.textContent = msg;
      if (tile.dmSidebarStatus) tile.dmSidebarStatus.textContent = msg;
      return;
    }
    tile.renderer.start();
    tile.danmakuClient = new DanmakuClient(tile.rid, (message) => tile.renderer.add(message), (message) => {
      tile.dmStatus.textContent = message;
      if (tile.dmSidebarStatus) tile.dmSidebarStatus.textContent = message;
    });
    tile.danmakuClient.start();
  };

  ctx.handleStart = async (tile, recovering = false) => {
    if (!ctx.opened || !ctx.tiles.has(tile.id)) return;
    const attempt = recovering ? tile.attempt : 0;
    ctx.resetPlayback(tile);
    tile.attempt = attempt;
    const generation = tile.generation, controller = new AbortController();
    tile.request = controller;
    const active = () => ctx.opened && ctx.tiles.get(tile.id) === tile && tile.generation === generation && !controller.signal.aborted;
    const handleFailure = (error, retryAllowed = false) => {
      if (!active() || tile.retrying) return;
      if (!tile.name) { tile.nameStatus = "error"; ctx.updateTileChrome(tile); }
      const message = safeMessage(error);
      ctx.log(tile.rid, message);
      const throttled = /429|403|频繁|限流|冷却/.test(message);
      if (throttled) ctx.cooldownUntil = Date.now() + 3e4;
      ctx.disposePlayer(tile);
      if (retryAllowed && !throttled && tile.attempt < 5) {
        tile.retrying = true;
        const delay = 1e3 * 2 ** tile.attempt++ + Math.floor(Math.random() * 300);
        tile.retryAt = Date.now() + delay;
        ctx.setStatus(tile, "reconnecting", `重连 ${tile.attempt}/5`);
        tile.retryTimer = setTimeout(() => {
          tile.retrying = false;
          tile.retryAt = 0;
          if (active()) void ctx.handleStart(tile, true);
        }, delay);
        return;
      }
      controller.abort();
      tile.request = null;
      ctx.scheduler.release(tile.id);
      tile.retryAt = 0;
      ctx.setStatus(tile, "failed", `${message}${throttled ? "；暂停取流 30 秒" : "；可点击重试"}`);
    };
    try {
      if (Date.now() < ctx.cooldownUntil) throw new Error("接口冷却中，请等待 30 秒后重试");
      ctx.setStatus(tile, "queued", "等待播放额度…");
      await ctx.scheduler.acquire(tile.id, controller.signal);
      if (!active()) return;
      ctx.setStatus(tile, "probing", "① 检查房间…");
      const probe = await ctx.scheduler.sign(() => fetchProbe(tile.rid, controller.signal), controller.signal);
      if (!active()) return;
      if ([...ctx.tiles.values()].some((other) => other !== tile && other.rid === probe.rid)) throw new Error("真实房号与其他格重复");
      tile.rid = probe.rid;
      tile.name = normalizeRoomName(probe.name, probe.rid) || tile.name;
      tile.nameStatus = tile.name ? "ready" : "error";
      tile.liveStatus = probe.liveStatus;
      tile.lastProbe = Date.now();
      ctx.updateTileChrome(tile);
      recordHistory(probe.rid, probe.name, probe.avatar || "");
      ctx.save();
      if (probe.liveStatus === "offline") {
        controller.abort();
        tile.request = null;
        ctx.scheduler.release(tile.id);
        ctx.setStatus(tile, "waiting", "未开播 · 每分钟自动检查开播");
        return;
      }
      ctx.setStatus(tile, "queued", probe.liveStatus === "carousel" ? "轮播中，等待签名取流…" : "已开播，等待签名取流…");
      const streamResult = await ctx.getStream(tile, controller.signal);
      if (!active()) return;
      const url = typeof streamResult === "string" ? streamResult : streamResult.url;
      const multirates = typeof streamResult === "object" ? streamResult.multirates : null;
      const activeRate = typeof streamResult === "object" ? streamResult.rate : tile.rate;
      if (typeof ctx.updateTileRates === "function") {
        ctx.updateTileRates(tile, multirates, activeRate);
      }
      if (!mpegts.getFeatureList().mseLivePlayback) throw new Error("当前浏览器不支持 MSE 直播播放");
      ctx.setStatus(tile, "connecting", "④ 地址已获取，连接视频流…");
      ctx.log(tile.rid, "签名与地址请求成功，开始读取 CDN");
      const player = mpegts.createPlayer({ type: "flv", url, isLive: true }, {
        enableWorker: false,
        enableStashBuffer: false,
        liveBufferLatencyChasing: true,
        liveBufferLatencyMaxLatency: 3,
        liveBufferLatencyMinRemain: 1,
        autoCleanupSourceBuffer: true,
        autoCleanupMaxBackwardDuration: 10,
        autoCleanupMinBackwardDuration: 5
      });
      tile.player = player;
      ctx.handleDanmaku(tile);
      const current = () => active() && tile.player === player;
      player.on(mpegts.Events.ERROR, (type, detail) => {
        if (current()) handleFailure(new Error(`④ 视频流读取 / 解码失败：${type} / ${detail}`), type === mpegts.ErrorTypes.NETWORK_ERROR);
      });
      player.on(mpegts.Events.LOADING_COMPLETE, () => {
        if (current()) handleFailure(new Error("④ 直播连接结束"), true);
      });
      player.on(mpegts.Events.MEDIA_INFO, (info) => {
        if (current()) ctx.log(tile.rid, `媒体信息：${info.videoCodec || "未知编码"}，${info.width || "?"}×${info.height || "?"}`);
      });
      tile.video.onplaying = () => {
        if (!current()) return;
        if (tile.video.videoWidth === 0) return;
        ctx.setStatus(tile, "playing", "播放中");
        ctx.updateTileChrome(tile);
        if (!tile.stableTimer) tile.stableTimer = setTimeout(() => {
          if (current()) tile.attempt = 0;
        }, 3e4);
      };
      tile.video.onwaiting = () => {
        if (!current()) return;
        if (tile.state === "playing") {
          ctx.setStatus(tile, "buffering", "正在缓冲…");
        }
      };
      tile.video.onerror = () => {
        if (current()) handleFailure(new Error("④ 浏览器解码失败，请尝试关闭 H.265"));
      };
      player.attachMediaElement(tile.video);
      ctx.applyAudio(tile);
      player.load();
      let lastTime = -1, lastEnd = -1, lastProgress = Date.now(), connectedAt = Date.now();
      let wasHidden = false;
      tile.watch = setInterval(() => {
        if (!current()) return;
        if (document.hidden) {
          wasHidden = true;
          lastProgress = Date.now();
          connectedAt = Date.now();
          return;
        }
        if (wasHidden) {
          wasHidden = false;
          lastProgress = Date.now();
          connectedAt = Date.now();
          const b = tile.video.buffered;
          if (b.length > 0) {
            const liveEnd = b.end(b.length - 1);
            if (liveEnd - tile.video.currentTime > 3.5) {
              try {
                tile.video.currentTime = Math.max(0, liveEnd - 1);
              } catch {}
            }
          }
        }
        const end = tile.video.buffered.length ? tile.video.buffered.end(tile.video.buffered.length - 1) : 0;
        if (tile.video.currentTime > lastTime || end > lastEnd) {
          lastProgress = Date.now();
          lastTime = tile.video.currentTime;
          lastEnd = end;
        }
        if (tile.state === "blocked" || tile.video.paused && tile.state === "playing") return;
        if (tile.video.videoWidth === 0 && Date.now() - connectedAt > 2e4) handleFailure(new Error("④ 20 秒内没有画面；检查 CDN CORS、CSP 或编码"), true);
        else if (tile.state === "playing" && Date.now() - lastProgress > 12e3) handleFailure(new Error("④ 播放和缓冲持续无进展"), true);
      }, 2e3);
      void tile.video.play().catch((error) => {
        if (!current()) return;
        if (error.name === "NotAllowedError") ctx.setStatus(tile, "blocked", "自动播放受阻，请点击播放继续");
        else handleFailure(new Error(`④ 视频播放失败：${safeMessage(error)}`));
      });
    } catch (error) {
      if (active() && error.name !== "AbortError") handleFailure(error);
    }
  };
}
