import { clamp01 } from "../core/settings.js";
import { roomDisplayName } from "../core/room-name.js";
import { dotMetaFor } from "./status.js";
import { setTileDanmakuSettings } from "./tile-events.js";

export const selectedTile = (ctx) => (ctx.selectedId ? ctx.tiles.get(ctx.selectedId) || null : null);

export const tileStatusText = (tile) => {
  if (!tile) return "未选择";
  const meta = dotMetaFor(tile.state, tile.liveStatus);
  if (tile.state === "playing" && tile.video?.paused) return "已暂停";
  return meta.label;
};

export const tileStatusKind = (tile) => (tile ? dotMetaFor(tile.state, tile.liveStatus).dot : "gr");

export const tileMeta = (tile) => {
  if (!tile) return "在画墙轻点一路，或从房间库选择";
  const parts = [`房间号 ${tile.rid}`];
  if (tile.availableRates?.length) {
    const current = tile.availableRates.find((entry) => entry.rate === tile.rate);
    if (current?.name) parts.push(current.name);
  }
  return parts.join(" · ");
};

export const canPiP = () => {
  try {
    const pageWindow = typeof unsafeWindow !== "undefined" && unsafeWindow ? unsafeWindow : globalThis;
    return Boolean(pageWindow.documentPictureInPicture);
  } catch {
    return false;
  }
};

export const canFullscreen = (tile) => Boolean(tile?.root && (tile.root.requestFullscreen || tile.root.webkitRequestFullscreen || tile.root.webkitRequestFullScreen));

export const isAppleTouch = () => {
  try {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (!nav) return false;
    return /iPad|iPhone|iPod/.test(nav.userAgent || "") || (nav.platform === "MacIntel" && (nav.maxTouchPoints || 0) > 1);
  } catch {
    return false;
  }
};

export const setTileVolume = (ctx, tile, value, { save = true } = {}) => {
  if (!tile) return;
  tile.vol = clamp01(value, tile.vol);
  if (tile.vol > 0) tile.muted = false;
  if (tile.volSlider) tile.volSlider.value = String(tile.vol);
  ctx.applyAudio(tile);
  ctx.updateTileChrome(tile);
  if (save) ctx.save();
};

const clickTileControl = (tile, selector) => tile?.root?.querySelector(selector)?.click();

export const runRoomAction = (ctx, tile, action) => {
  if (!tile) return;
  switch (action) {
    case "play":
      clickTileControl(tile, "[data-t-resume]");
      break;
    case "mute":
      ctx.toggleMute(tile);
      break;
    case "solo":
      ctx.toggleSolo(tile);
      break;
    case "focus":
      ctx.select?.(tile);
      ctx.toggleFocus(tile);
      break;
    case "dm-toggle":
      clickTileControl(tile, "[data-t-danmaku]");
      break;
    case "dm-settings":
      ctx.closeRoomSheet?.();
      setTileDanmakuSettings(tile, true);
      break;
    case "reload":
      clickTileControl(tile, "[data-t-reload]");
      break;
    case "replace":
      ctx.closeRoomSheet?.();
      ctx.openAdd?.(tile);
      break;
    case "external":
      window.open(`https://www.douyu.com/${tile.rid}`, "_blank", "noopener,noreferrer");
      break;
    case "fullscreen":
      if (!canFullscreen(tile)) ctx.showToast?.("当前浏览器不支持画格全屏，可使用放大模式。", [], 5e3);
      else clickTileControl(tile, "[data-t-full]");
      break;
    case "pip":
      if (!canPiP()) ctx.showToast?.("弹幕画中画需要支持 Document Picture-in-Picture 的桌面 Chrome / Edge。", [], 5e3);
      else clickTileControl(tile, "[data-t-pip]");
      break;
    case "remove":
      ctx.closeRoomSheet?.();
      ctx.removeTileWithUndo?.(tile);
      break;
    case "vol-down":
      setTileVolume(ctx, tile, tile.vol - 0.05);
      break;
    case "vol-up":
      setTileVolume(ctx, tile, tile.vol + 0.05);
      break;
    default:
      break;
  }
};

export const setTileRate = (ctx, tile, rate) => {
  if (!tile) return;
  const select = tile.root?.querySelector("[data-t-rate]");
  if (!select) return;
  select.value = String(rate);
  select.dispatchEvent(new (select.ownerDocument.defaultView || window).Event("change", { bubbles: true }));
};

export const bindRoomPanelActions = (ctx, scope) => {
  if (!scope) return () => {};
  const handle = (event) => {
    const action = event.target.closest("[data-room-act]")?.dataset.roomAct;
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    const tile = selectedTile(ctx);
    runRoomAction(ctx, tile, action);
  };
  const handleVolume = (event) => {
    const input = event.target.closest("[data-room-volume]");
    if (!input) return;
    setTileVolume(ctx, selectedTile(ctx), Number(input.value), { save: event.type === "change" });
  };
  const handleRate = (event) => {
    const select = event.target.closest("[data-room-rate]");
    if (!select) return;
    setTileRate(ctx, selectedTile(ctx), select.value);
  };
  scope.addEventListener("click", handle);
  scope.addEventListener("input", handleVolume);
  scope.addEventListener("change", (event) => { handleVolume(event); handleRate(event); });
  return () => {
    scope.removeEventListener("click", handle);
    scope.removeEventListener("input", handleVolume);
    scope.removeEventListener("change", handleVolume);
    scope.removeEventListener("change", handleRate);
  };
};

export const removeTileWithUndo = (ctx, tile) => {
  if (!tile) return;
  const name = roomDisplayName(tile);
  const index = [...ctx.tiles.keys()].indexOf(tile.id);
  const snapshot = {
    rid: tile.rid,
    name: tile.name,
    rate: tile.rate,
    danmaku: { ...tile.danmaku },
    audio: { muted: tile.muted, volume: tile.vol }
  };
  ctx.removeTile(tile);
  ctx.showToast(`已移除“${name}”`, [{
    label: "撤销",
    primary: true,
    onClick: () => {
      try {
        const restored = ctx.addTile(snapshot.rid, snapshot.rate, true, snapshot.danmaku, snapshot.audio, snapshot.name);
        const entries = [...ctx.tiles.entries()];
        const entry = entries.find(([, item]) => item === restored);
        if (entry) {
          const rest = entries.filter((item) => item[1] !== restored);
          rest.splice(Math.max(0, Math.min(index, rest.length)), 0, entry);
          ctx.tiles.clear();
          for (const [id, item] of rest) ctx.tiles.set(id, item);
        }
        ctx.select(restored.id);
        ctx.handleLayout();
        ctx.save();
      } catch (error) {
        ctx.showToast(`撤销失败：${error?.message || error}`, [], 5e3);
      }
    }
  }], 6e3);
};
