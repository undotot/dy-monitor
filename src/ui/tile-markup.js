import { roomDisplayName } from "../core/room-name.js";

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const tileMarkup = () => `
<header class="tile-status" data-drag title="拖动可交换位置">
  <i class="dot gr" data-dot role="img" aria-label="未播放"></i>
  <b class="t-name" data-name>直播间</b>
</header>
<div class="tile-audio-corner" data-audio-corner title="声音控制">
  <button data-t-mute type="button" class="ibtn audio-btn" aria-label="声音控制"></button>
  <input data-t-vol type="range" min="0" max="1" step="0.05" value="1" class="slider t-vol" aria-label="该直播间音量">
</div>
<video muted playsinline class="tile-video" aria-label="直播画面"></video>
<canvas aria-hidden="true" class="tile-dm"></canvas>
<div class="tile-retry" data-retry hidden><span data-retry-text></span><button data-t-retry-now type="button" class="btn mini">立即重试</button></div>
<div class="tile-feedback" data-note role="status" hidden></div>
<div class="tile-overlay">
  <div class="tile-tools" data-tools>
    <button data-t-resume type="button" class="ibtn glass"></button>
    <button data-t-reload type="button" class="ibtn glass"></button>
    <button data-t-solo type="button" class="ibtn glass" aria-pressed="false"></button>
    <button data-t-danmaku type="button" class="ibtn glass" aria-pressed="false"></button>
    <select data-t-rate class="sel glass-sel" aria-label="画质"></select>
    <button data-t-settings type="button" class="ibtn glass" aria-expanded="false"></button>
    <button data-t-pip type="button" class="ibtn glass"></button>
    <button data-t-full type="button" class="ibtn glass"></button>
    <button data-t-external type="button" class="ibtn glass"></button>
    <button data-t-remove type="button" class="ibtn glass del"></button>
  </div>
  <section class="tile-settings" data-tile-settings hidden>
    <form data-edit-form class="p-edit">
      <input data-edit-input aria-label="修改房号" maxlength="2048">
      <button type="submit" class="ibtn"></button>
      <button data-edit-cancel type="button" class="ibtn"></button>
    </form>
    <div class="p-danmaku">
      <label>字号 <select data-dm-size class="sel sel-sm"></select></label>
      <label>速度 <select data-dm-speed class="sel sel-sm"></select></label>
      <label>透明度 <input data-dm-opacity type="range" min="0.1" max="1" step="0.1" class="slider" style="width:110px"></label>
      <label>显示区域 <select data-dm-area class="sel sel-sm"></select></label>
      <label style="flex-direction:column;align-items:stretch;gap:6px">屏蔽词<textarea data-dm-blocked class="p-textarea" maxlength="2048" placeholder="每行一个，或用逗号分隔"></textarea></label>
      <p data-dm-status class="p-alert" role="status"></p>
      <div class="frow"><button data-dm-reset type="button" class="btn mini">恢复弹幕默认</button><button data-dm-apply-all type="button" class="btn mini">应用到全部</button></div>
    </div>
  </section>
</div>`;

export const addRowMarkup = (room, state, checked) => {
  const name = roomDisplayName(room);
  const letter = escapeHtml((name.charAt(0) || "?").toUpperCase());
  const avatar = room.avatar ? `<img src="${String(room.avatar).replace(/"/g, "&quot;")}" alt="" referrerpolicy="no-referrer" loading="lazy">` : "";
  const sub = escapeHtml(room.category || "");
  return `<div class="add-row${state.disabled ? " is-off" : ""}" data-rid="${room.rid}">
    <input class="chk" type="checkbox" data-chk ${checked ? "checked" : ""} ${state.disabled ? "disabled" : ""} aria-label="选择 ${escapeHtml(name)}">
    <span class="ravatar rava-${Number(String(room.rid).charCodeAt(0) || 0) % 3}">${avatar}<b>${letter}</b></span>
    <span class="rinfo"><b>${escapeHtml(name)}</b><span>${sub}</span></span>
    <span class="${state.badgeClass}">${state.badge}</span>
    <button class="btn mini" data-add-one ${state.disabled ? "disabled" : ""}>${state.disabled ? "不可添加" : "添加"}</button>
  </div>`;
};
