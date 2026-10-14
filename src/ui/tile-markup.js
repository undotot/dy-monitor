import { roomDisplayName } from "../core/room-name.js";
import { danmakuControlsMarkup } from "./danmaku-controls.js";
import { iconMarkup } from "./icons.js";

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const tileMarkup = () => `
<div class="tile-viewport">
<header class="tile-status" data-drag title="拖动可交换位置">
  <i class="dot gr" data-dot role="img" aria-label="未播放"></i>
  <b class="t-name" data-name>直播间</b>
</header>
<div class="tile-audio-corner" data-audio-corner title="声音控制">
  <button data-t-mute type="button" class="ibtn audio-btn" aria-label="声音控制"></button>
  <div class="tile-volume-popover">
  <input data-t-vol type="range" min="0" max="1" step="0.01" value="1" class="slider t-vol" aria-label="该直播间音量">
  <b data-t-vol-pct class="t-vol-pct">100%</b>
  </div>
</div>
<video muted playsinline class="tile-video" aria-label="直播画面"></video>
<canvas aria-hidden="true" class="tile-dm"></canvas>
<div class="tile-dm-stage" data-dm-stage hidden aria-hidden="true"></div>

<div class="tile-loading" data-loading hidden aria-label="正在加载直播"><div class="tile-spinner"></div><span class="tile-loading-text" data-loading-text>正在连接…</span></div>
<div class="tile-retry" data-retry hidden><span data-retry-text></span><button data-t-retry-now type="button" class="btn mini">立即重试</button></div>
<div class="tile-feedback" data-note role="status" hidden></div>
<div class="tile-overlay">
  <div class="tile-tools" data-tools role="group" aria-label="直播间快捷操作">
    <button data-t-resume type="button" class="ibtn tool-play"></button>
    <span class="tool-divider" aria-hidden="true"></span>
    <button data-t-solo type="button" class="ibtn" data-tool-label="独奏" aria-pressed="false"></button>
    <button data-t-danmaku type="button" class="ibtn" data-tool-label="弹幕" aria-pressed="false"></button>
    <span data-tool-quality-anchor><span class="tool-quality"><select data-t-rate class="sel" aria-label="画质"></select></span></span>
    <span class="tool-divider" aria-hidden="true"></span>
    <button data-t-full type="button" class="ibtn"></button>
    <button data-t-more type="button" class="ibtn" aria-label="更多直播间操作" title="更多操作" aria-haspopup="menu" aria-expanded="false">${iconMarkup("more")}</button>
  </div>
  <div class="tile-more" data-t-more-menu role="menu" aria-label="更多直播间操作" hidden>
    <div data-tool-quality-slot class="tool-menu-quality" role="group" aria-label="画质选择" hidden><span>画质</span></div>
    <button data-tool-action="resume" type="button" role="menuitem" class="tool-menu-item tool-micro-action" data-tool-label="播放 / 暂停" aria-label="播放 / 暂停">${iconMarkup("play")}</button>
    <button data-tool-action="danmaku" type="button" role="menuitem" class="tool-menu-item tool-narrow-action" data-tool-label="弹幕开关" aria-label="弹幕开关">${iconMarkup("chat")}</button>
    <button data-tool-action="solo" type="button" role="menuitem" class="tool-menu-item tool-mini-action" data-tool-label="独奏声音" aria-label="独奏声音">${iconMarkup("solo")}</button>
    <button data-tool-action="full" type="button" role="menuitem" class="tool-menu-item tool-mini-action" data-tool-label="全屏" aria-label="全屏">${iconMarkup("full")}</button>
    <button data-t-reload type="button" role="menuitem" class="tool-menu-item" data-tool-label="重新取流"></button>
    <button data-t-dm-settings type="button" role="menuitem" class="tool-menu-item dm-settings-entry" data-tool-label="弹幕设置" aria-label="弹幕设置" aria-expanded="false">${iconMarkup("sliders")}</button>
    <button data-t-pip type="button" role="menuitem" class="tool-menu-item" data-tool-label="画中画"></button>
    <button data-t-external type="button" role="menuitem" class="tool-menu-item" data-tool-label="打开直播间"></button>
    <span class="tool-menu-divider" role="separator"></span>
    <button data-t-remove type="button" role="menuitem" class="tool-menu-item del" data-tool-label="移除房间"></button>
  </div>
  <section class="tile-settings" data-tile-settings aria-label="弹幕设置" hidden>
    <div class="tile-settings-head">
      <b>弹幕设置</b>
      <button data-settings-close type="button" class="ibtn" aria-label="关闭弹幕设置">${iconMarkup("close")}</button>
    </div>
    <div class="p-danmaku" data-settings-danmaku>${danmakuControlsMarkup()}</div>
  </section>
</div>
</div>
<aside class="tile-dm-sidebar" data-dm-sidebar aria-label="当前房间弹幕栏" hidden>
  <div class="tile-dm-sidebar-head">
    <div class="dm-sidebar-heading"><span class="dm-sb-title">实时弹幕</span><span class="dm-sb-status" data-dm-sb-status role="status">连线中</span></div>
    <button data-dm-sidebar-close type="button" class="ibtn" aria-label="关闭弹幕栏并关闭弹幕" title="关闭弹幕">${iconMarkup("close")}</button>
  </div>
  <div class="tile-dm-sidebar-list" data-dm-sb-list tabindex="0" aria-label="弹幕消息列表"></div>
  <p class="dm-sidebar-empty" data-dm-sb-empty>${iconMarkup("chat")}<b>等待新弹幕</b><span>新消息会出现在这里</span></p>
</aside>`;

export const addRowMarkup = (room, state, checked, actionLabel = "添加") => {
  const name = roomDisplayName(room);
  const letter = escapeHtml((name.charAt(0) || "?").toUpperCase());
  const avatar = room.avatar ? `<img src="${String(room.avatar).replace(/"/g, "&quot;")}" alt="" referrerpolicy="no-referrer" loading="lazy">` : "";
  const sub = escapeHtml(room.category || "");
  return `<div class="add-row${state.disabled ? " is-off" : ""}" data-rid="${room.rid}">
    <input class="chk" type="checkbox" data-chk ${checked ? "checked" : ""} ${state.disabled ? "disabled" : ""} aria-label="选择 ${escapeHtml(name)}">
    <span class="ravatar rava-${Number(String(room.rid).charCodeAt(0) || 0) % 3}">${avatar}<b>${letter}</b></span>
    <span class="rinfo"><b>${escapeHtml(name)}</b><span>${sub}</span></span>
    <span class="${state.badgeClass}">${state.badge}</span>
    <button class="btn mini" data-add-one ${state.disabled ? "disabled" : ""}>${state.disabled ? state.badge : actionLabel}</button>
  </div>`;
};
