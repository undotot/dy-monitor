import { setIconButton } from "../ui/icons.js";
import { MAX_TILES } from "../core/settings.js";

// 状态与外观：状态点/徽章/备注、画格控件外观、全局计数与健康度。
const stateMeta = {
  playing: { dot: "g", badge: "LIVE", badgeClass: "badge live" },
  reconnecting: { dot: "a", badge: "重连", badgeClass: "badge wait" },
  signing: { dot: "a", badge: "取流", badgeClass: "badge wait" },
  connecting: { dot: "a", badge: "连接", badgeClass: "badge wait" },
  queued: { dot: "a", badge: "排队", badgeClass: "badge wait" },
  probing: { dot: "a", badge: "检查", badgeClass: "badge wait" },
  blocked: { dot: "a", badge: "待播放", badgeClass: "badge wait" },
  waiting: { dot: "a", badge: "未开播", badgeClass: "badge wait" },
  failed: { dot: "r", badge: "ERR", badgeClass: "badge err" },
  stopped: { dot: "gr", badge: "OFF", badgeClass: "badge off" }
};

export function initStatus(ctx) {
  ctx.setStatus = (tile, state, message) => {
    tile.state = state;
    let meta = stateMeta[state] || stateMeta.connecting;
    // 轮播中的房间也在放流：播放态徽标区分“LIVE / 轮播中”，与列表状态一致。
    if (state === "playing" && tile.liveStatus === "carousel") meta = { dot: "a", badge: "轮播中", badgeClass: "badge loop" };
    tile.dotEl.className = `dot ${meta.dot}`;
    tile.badgeEl.className = meta.badge ? meta.badgeClass : "badge hide";
    tile.badgeEl.textContent = meta.badge;
    tile.noteEl.textContent = message || "";
    tile.noteEl.classList.toggle("is-failed", state === "failed");
    tile.retryEl.hidden = !(state === "reconnecting" && tile.retryAt);
    ctx.updateCount();
  };

  ctx.updateTileChrome = (tile) => {
    tile.nameEl.textContent = `${tile.rid} · ${tile.name || tile.rid}`;
    tile.nameEl.title = `${tile.rid} · ${tile.name || ""}`;
    setIconButton(tile.muteBtn, tile.muted ? "muted" : "volume", tile.muted ? "开启声音（M）" : "静音（M）");
    tile.muteBtn.setAttribute("aria-pressed", String(!tile.muted));
    tile.volSlider.value = String(tile.vol);
    ctx.paintSlider(tile.volSlider);
    setIconButton(tile.soloBtn, "solo", "独奏该房间（S）");
    tile.soloBtn.setAttribute("aria-pressed", String(ctx.audio.mode === "solo" && tile.id === ctx.soloTargetId()));
    setIconButton(tile.danmakuBtn, tile.danmaku.enabled ? "chat" : "chatOff", tile.danmaku.enabled ? "关闭弹幕（D）" : "开启弹幕（D）");
    tile.danmakuBtn.setAttribute("aria-pressed", String(tile.danmaku.enabled));
    setIconButton(tile.resumeBtn, tile.video.paused ? "play" : "pause", tile.video.paused ? "播放 / 继续（Space）" : "暂停（Space）");
    tile.clockEl.hidden = !ctx.clockEnabled;
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
