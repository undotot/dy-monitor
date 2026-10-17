import { clamp01, AUDIO_MODES } from "../core/settings.js";

// 声音模型：输出 = 主增益 × 每路音量；静音与音量解耦。
// 模式 mix/solo/mute；独奏对象独立于选中：跟随焦点 ? 焦点/独奏对象 : 独奏对象。
export function initAudio(ctx) {
  ctx.soloTargetId = () => (ctx.audio.followFocus ? ctx.focused || ctx.soloRoomId : ctx.soloRoomId);

  ctx.resolveSoloTarget = () => {
    const wanted = ctx.pendingSoloRid != null ? [...ctx.tiles.values()].find((tile) => String(tile.rid) === String(ctx.pendingSoloRid)) : null;
    ctx.soloRoomId = wanted?.id || null;
    ctx.pendingSoloRid = null;
    if (ctx.audio.mode === "solo" && !ctx.soloRoomId) ctx.audio.mode = "mix";
    if (ctx.els?.audioMode) ctx.els.audioMode.value = ctx.audio.mode;
  };

  ctx.applyAudio = (tile) => {
    const audible = ctx.audio.mode === "mix"
      ? !tile.muted
      : ctx.audio.mode === "mute"
        ? false
        : !tile.muted && tile.id === ctx.soloTargetId();
    tile.video.muted = !audible;
    tile.video.volume = clamp01(ctx.audio.master * tile.vol);
  };

  ctx.refreshSoloButtons = () => {
    const target = ctx.audio.mode === "solo" ? ctx.soloTargetId() : null;
    for (const tile of ctx.tiles.values()) {
      if (tile.soloBtn) tile.soloBtn.setAttribute("aria-pressed", String(tile.id === target));
    }
  };

  ctx.applyAudioAll = () => {
    for (const tile of ctx.tiles.values()) ctx.applyAudio(tile);
    ctx.refreshSoloButtons();
    ctx.renderRoomChrome?.();
  };

  ctx.toggleMute = (tile) => {
    tile.muted = !tile.muted;
    ctx.applyAudio(tile);
    ctx.updateTileChrome(tile);
    if (!tile.muted && tile.player && tile.video.paused) {
      void tile.video.play().catch(() => ctx.setStatus(tile, "blocked", "浏览器仍阻止播放，请再次点击播放"));
    }
    ctx.save();
  };

  ctx.toggleSolo = (tile) => {
    if (ctx.audio.mode === "solo" && ctx.soloRoomId === tile.id) {
      ctx.audio.mode = "mix";
      ctx.soloRoomId = null;
    } else {
      ctx.audio.mode = "solo";
      ctx.soloRoomId = tile.id;
    }
    ctx.els.audioMode.value = ctx.audio.mode;
    ctx.applyAudioAll();
    ctx.save();
  };

  ctx.setAudioMode = (mode) => {
    ctx.audio.mode = AUDIO_MODES.includes(mode) ? mode : "mix";
    if (ctx.audio.mode === "solo" && !ctx.soloRoomId) ctx.soloRoomId = ctx.selectedId || null;
    if (ctx.audio.mode === "solo" && !ctx.soloRoomId) {
      ctx.audio.mode = "mix";
      ctx.showToast?.("请先在画墙选择一个房间，再开启独奏。", [], 4e3);
    }
    ctx.els.audioMode.value = ctx.audio.mode;
    ctx.applyAudioAll();
    ctx.save();
  };
}
