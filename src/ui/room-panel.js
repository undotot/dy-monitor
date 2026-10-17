import { iconMarkup } from "./icons.js";

// 当前房间的统一面板：PC 检查器与 iPad 底部房间面板共用同一份结构，
// 这样两端的状态、按钮和文案不会分叉。
export const roomPanelMarkup = () => `
<div class="room-panel" data-room-panel>
  <div class="room-identity">
    <span class="room-avatar" data-room-avatar>?</span>
    <div class="room-identity-copy">
      <b class="room-name" data-room-name>未选择房间</b>
      <span class="room-meta" data-room-meta>在画墙轻点一路，或从房间库选择</span>
    </div>
  </div>
  <div class="room-state-line"><i class="dot gr" data-room-dot></i><span data-room-status>未选择</span><span class="room-sep"></span><span data-room-quality>—</span></div>
  <div class="room-primary">
    <button class="room-action" type="button" data-room-act="play"><span class="ic">${iconMarkup("play")}</span><span data-room-play-label>播放</span></button>
    <button class="room-action" type="button" data-room-act="mute"><span class="ic">${iconMarkup("volume")}</span><span data-room-mute-label>静音</span></button>
    <button class="room-action" type="button" data-room-act="solo"><span class="ic">${iconMarkup("solo")}</span><span>独奏</span></button>
    <button class="room-action" type="button" data-room-act="focus"><span class="ic">${iconMarkup("layers")}</span><span data-room-focus-label>放大</span></button>
  </div>
  <section class="room-block">
    <div class="room-block-head"><span>声音</span><b data-room-volume-pct>100%</b></div>
    <div class="room-volume-row">
      <button class="room-step" type="button" data-room-act="vol-down" aria-label="音量减 5%">−</button>
      <input class="room-range" data-room-volume type="range" min="0" max="1" step="0.05" value="1" aria-label="该直播间音量">
      <button class="room-step" type="button" data-room-act="vol-up" aria-label="音量加 5%">＋</button>
    </div>
    <p class="room-hint" data-room-volume-hint hidden>iPad 上逐路音量可能不生效，请以系统音量为主；静音与独奏仍然可用。</p>
  </section>
  <section class="room-block">
    <div class="room-block-head"><span>弹幕</span><span class="room-pill" data-room-dm-state>已关闭</span></div>
    <div class="room-kv"><span data-room-dm-summary>跟随全局</span><span class="room-kv-actions"><button type="button" data-room-act="dm-toggle">开关</button><button type="button" data-room-act="dm-settings">设置</button></span></div>
  </section>
  <section class="room-block">
    <div class="room-block-head"><span>画质</span></div>
    <select class="room-select" data-room-rate aria-label="画质"></select>
  </section>
  <div class="room-rows">
    <button type="button" data-room-act="reload"><span class="ic">${iconMarkup("retry")}</span>重新取流</button>
    <button type="button" data-room-act="replace"><span class="ic">${iconMarkup("edit")}</span>替换房号</button>
    <button type="button" data-room-act="external"><span class="ic">${iconMarkup("external")}</span>打开直播间</button>
  </div>
  <div class="room-rows room-capabilities">
    <button type="button" data-room-act="fullscreen" data-capability="fullscreen"><span class="ic">${iconMarkup("full")}</span>全屏</button>
    <button type="button" data-room-act="pip" data-capability="pip"><span class="ic">${iconMarkup("pip")}</span>弹幕画中画</button>
  </div>
  <button class="room-remove" type="button" data-room-act="remove"><span class="ic">${iconMarkup("trash")}</span>移除房间</button>
</div>`;

export const inspectorMarkup = () => `
<aside class="inspector" data-inspector aria-label="当前房间与房间库">
  <div class="inspector-head">
    <div class="inspector-tabs" role="tablist" aria-label="检查器视图">
      <button class="is-active" type="button" role="tab" data-insp-tab="room" aria-selected="true">当前房间</button>
      <button type="button" role="tab" data-insp-tab="library" aria-selected="false">房间库</button>
    </div>
    <button class="inspector-close" type="button" data-inspector-close aria-label="收起检查器" title="收起检查器">${iconMarkup("chevrr")}</button>
  </div>
  <div class="inspector-pane" data-insp-pane="room">${roomPanelMarkup()}</div>
  <div class="inspector-pane" data-insp-pane="library" hidden>
    <div class="library-toolbar"><button class="btn primary" type="button" data-insp-add><span class="ic">${iconMarkup("search")}</span>添加房间</button></div>
    <div class="library-list" data-insp-library></div>
  </div>
</aside>`;

export const commandBarMarkup = () => `
<div class="command-bar" data-command-bar aria-label="当前房间操作">
  <div class="cb-empty" data-cb-empty>
    <span>轻点画面选择房间</span>
    <button class="btn primary mini" type="button" data-cb-add>${iconMarkup("plus")}添加房间</button>
  </div>
  <div class="cb-selected" data-cb-selected hidden>
    <div class="cb-copy"><b data-cb-name></b><span><i class="dot gr" data-cb-dot></i><span data-cb-status></span></span></div>
    <div class="cb-actions">
      <button type="button" data-cb-act="play"><span class="ic">${iconMarkup("play")}</span><span data-cb-play-label>播放</span></button>
      <button type="button" data-cb-act="mute"><span class="ic">${iconMarkup("volume")}</span><span data-cb-mute-label>静音</span></button>
      <button type="button" data-cb-act="solo"><span class="ic">${iconMarkup("solo")}</span><span>独奏</span></button>
      <button type="button" data-cb-act="focus"><span class="ic">${iconMarkup("layers")}</span><span data-cb-focus-label>放大</span></button>
      <button type="button" data-cb-act="danmaku"><span class="ic">${iconMarkup("chat")}</span><span>弹幕</span></button>
      <button type="button" data-cb-act="more"><span class="ic">${iconMarkup("more")}</span><span>更多</span></button>
    </div>
  </div>
</div>`;

export const roomSheetMarkup = () => `
<div class="room-sheet-backdrop" data-room-sheet-close data-room-sheet-backdrop hidden></div>
<section class="room-sheet" data-room-sheet hidden aria-label="当前房间操作">
  <div class="room-sheet-grab" aria-hidden="true"></div>
  <div class="room-sheet-head"><div><b data-sheet-name>当前房间</b><span data-sheet-status>未选择</span></div><button type="button" data-room-sheet-close aria-label="关闭房间面板">${iconMarkup("close")}</button></div>
  <div class="room-sheet-body">${roomPanelMarkup()}</div>
</section>`;
