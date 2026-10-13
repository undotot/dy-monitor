import { setIconButton } from "../ui/icons.js";
import { MAX_TILES } from "../core/settings.js";
import { roomDisplayName } from "../core/room-name.js";

// 状态点承载直播状态，文字说明通过悬停与无障碍标签提供。三态语义固定配色：
// 直播中=绿、轮播中=琥珀、未开播=灰；取流排队等瞬态用蓝点，不与三态混淆；异常=红。
const stateMeta = {
  playing: { dot: "g", label: "直播中" },
  buffering: { dot: "w", label: "缓冲中" },
  reconnecting: { dot: "w", label: "重连中" },
  signing: { dot: "w", label: "正在取流" },
  connecting: { dot: "w", label: "连接中" },
  queued: { dot: "w", label: "排队中" },
  probing: { dot: "w", label: "检查中" },
  blocked: { dot: "w", label: "等待播放" },
  waiting: { dot: "gr", label: "未开播" },
  failed: { dot: "r", label: "播放异常" },
  stopped: { dot: "gr", label: "未播放" }
};

export const dotMetaFor = (state, liveStatus) =>
  state === "playing" && liveStatus === "carousel" ? { dot: "a", label: "轮播中" } : stateMeta[state] || stateMeta.connecting;

export function initStatus(ctx) {
  ctx.setStatus = (tile, state, message) => {
    tile.state = state;
    const meta = dotMetaFor(state, tile.liveStatus);
    tile.dotEl.className = `dot ${meta.dot}`;
    tile.dotEl.title = meta.label;
    tile.dotEl.setAttribute("aria-label", meta.label);
    // 日常播放状态只用状态点表达；异常消息按需显示，不再占用底部。
    tile.noteEl.hidden = !message || !["failed", "blocked"].includes(state);
    tile.noteEl.textContent = tile.noteEl.hidden ? "" : message;
    tile.noteEl.classList.toggle("is-failed", state === "failed");
    tile.retryEl.hidden = !(state === "reconnecting" && tile.retryAt);
    const isLoading = ["queued", "probing", "signing", "connecting", "reconnecting", "buffering"].includes(state);
    if (tile.loadingEl) {
      tile.loadingEl.hidden = !isLoading;
      if (isLoading && tile.loadingText) {
        tile.loadingText.textContent = message || (state === "reconnecting" ? "重试连接中…" : state === "buffering" ? "正在缓冲…" : "正在连接…");
      }
    }
    ctx.updateCount();
  };

  ctx.updateTileChrome = (tile) => {
    const name = roomDisplayName(tile);
    tile.nameEl.textContent = name;
    tile.nameEl.title = name;
    tile.root.setAttribute("aria-label", `${name}，可拖动换位，或按 Alt 加左右方向键换位`);
    tile.video.setAttribute("aria-label", `${name}的直播画面`);
    if (ctx.pipSession?.tile === tile) {
      ctx.pipSession.window.document.title = `斗鱼 · ${name}`;
      ctx.pipSession.placeholder.querySelector(".pip-marker").textContent = `${name} · 画中画播放中`;
    }
    setIconButton(tile.muteBtn, tile.muted ? "muted" : "volume", tile.muted ? "开启声音" : "静音");
    tile.muteBtn.setAttribute("aria-pressed", String(!tile.muted));
    tile.audioCorner?.classList.toggle("is-muted", tile.muted);
    tile.audioCorner?.setAttribute("title", tile.muted ? "当前静音（点击开启声音，滚轮微调音量）" : `当前音量 ${Math.round(tile.vol * 100)}%（点击静音，滚轮微调音量）`);
    if (tile.volPct) tile.volPct.textContent = `${Math.round((tile.muted ? 0 : tile.vol) * 100)}%`;
    tile.volSlider.value = String(tile.vol);
    ctx.paintSlider(tile.volSlider);
    setIconButton(tile.soloBtn, "solo", "独奏该房间");
    tile.soloBtn.setAttribute("aria-pressed", String(ctx.audio.mode === "solo" && tile.id === ctx.soloTargetId()));
    setIconButton(tile.danmakuBtn, tile.danmaku.enabled ? "chat" : "chatOff", tile.danmaku.enabled ? "关闭弹幕" : "开启弹幕");
    tile.danmakuBtn.setAttribute("aria-pressed", String(tile.danmaku.enabled));
    setIconButton(tile.resumeBtn, tile.video.paused ? "play" : "pause", tile.video.paused ? "播放 / 继续" : "暂停");
  };

  ctx.updateCount = () => {
    const list = [...ctx.tiles.values()];
    ctx.emptyEl.hidden = list.length > 0;
    const failed = list.filter((tile) => tile.state === "failed").length;
    const playing = list.filter((tile) => tile.state === "playing").length;
    ctx.els.count.textContent = `${list.length}/${MAX_TILES} 格 · ${playing} 路播放 · 额度 ${ctx.scheduler.active.size}/${ctx.scheduler.capacity}`;
    ctx.els.health.textContent = failed ? `${failed} 路异常` : list.length ? "● 运行正常" : "";
    ctx.els.health.className = `meta-health ${failed ? "bad" : "ok"}`;
    ctx.refreshSoloButtons();
  };
}
