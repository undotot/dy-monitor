import MONITOR_CSS from "../ui/styles.css";
import { setIconButton } from "../ui/icons.js";
import { safeMessage } from "../core/settings.js";
import { clearTileGeometry } from "../ui/tile-geometry.js";
import { roomDisplayName } from "../core/room-name.js";
import { bindTileAudio } from "../app/tile-audio.js";
import { observeTileControls } from "../core/tile-scale.js";
import { bindTileFullscreen } from "../app/tile-fullscreen.js";

// Document Picture-in-Picture：画格迁入独立窗口播放，网页原位留占位。
export function initPip(ctx) {
  ctx.handleRestorePip = (session) => {
    if (ctx.pipSession !== session) return;
    ctx.pipSession = null;
    session.tile.renderer.stop();
    session.tile.disconnectAudio?.();
    session.tile.disconnectControls?.();
    session.placeholder.replaceWith(session.tile.root);
    bindTileAudio(ctx, session.tile);
    bindTileFullscreen(ctx, session.tile);
    session.tile.disconnectControls = observeTileControls(session.tile.root);
    session.tile.root.classList.toggle("is-selected", session.tile.id === ctx.selectedId);
    setIconButton(session.tile.pipButton, "pip", "弹幕画中画");
    if (session.tile.player && session.tile.danmaku.enabled) session.tile.renderer.start();
    ctx.handleLayout();
  };

  ctx.handleClosePip = () => {
    const session = ctx.pipSession;
    if (!session) return;
    ctx.handleRestorePip(session);
    session.window.close();
  };

  ctx.handlePip = async (tile) => {
    if (ctx.pipOpening) return;
    if (ctx.pipSession?.tile === tile) {
      ctx.handleClosePip();
      return;
    }
    const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    if (!pageWindow.documentPictureInPicture) {
      ctx.showToast("弹幕画中画需要支持 Document Picture-in-Picture 的桌面 Chrome / Edge。", [], 6e3);
      return;
    }
    if (!tile.player) {
      ctx.showToast("请先播放这个房间，再打开弹幕画中画。", [], 5e3);
      return;
    }
    ctx.pipOpening = true;
    try {
      ctx.handleClosePip();
      const pipWindow = await pageWindow.documentPictureInPicture.requestWindow({ width: 800, height: 450 });
      if (!ctx.opened || !ctx.tiles.has(tile.id) || !tile.player) {
        pipWindow.close();
        return;
      }
      const pipDocument = pipWindow.document;
      const pipStyle = pipDocument.createElement("style");
      pipStyle.textContent = MONITOR_CSS;
      pipDocument.head.append(pipStyle);
      pipDocument.title = `斗鱼 · ${roomDisplayName(tile)}`;
      pipDocument.body.className = "pip-body";
      const container = pipDocument.createElement("div");
      container.className = "pip-container";
      const placeholder = document.createElement("div");
      placeholder.className = tile.root.className;
      const marker = document.createElement("span");
      marker.className = "pip-marker";
      marker.textContent = `${roomDisplayName(tile)} · 画中画播放中`;
      placeholder.append(marker);
      tile.renderer.stop();
      tile.disconnectAudio?.();
      tile.disconnectControls?.();
      tile.root.replaceWith(placeholder);
      tile.root.className = "tile-shell";
      clearTileGeometry(tile.root);
      container.append(tile.root);
      pipDocument.body.append(container);
      bindTileAudio(ctx, tile);
      bindTileFullscreen(ctx, tile);
      tile.disconnectControls = observeTileControls(tile.root);
      const session = { tile, window: pipWindow, placeholder };
      ctx.pipSession = session;
      ctx.handleLayout();
      setIconButton(tile.pipButton, "return", "返回网页");
      pipWindow.addEventListener("pagehide", () => ctx.handleRestorePip(session), { once: true });
      if (tile.danmaku.enabled) tile.renderer.start();
    } catch (error) {
      ctx.showToast(`画中画打开失败：${safeMessage(error)}`, [], 6e3);
    } finally {
      ctx.pipOpening = false;
    }
  };
}
