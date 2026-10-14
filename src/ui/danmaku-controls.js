import { iconMarkup } from "./icons.js";

export const danmakuSegments = (field, choices, global = false) => `<div class="dm-segments" role="group" aria-label="${field === "mode" ? "弹幕显示方式" : field === "area" ? "飘屏弹幕范围" : "飘屏弹幕版式"}">${choices.map(([value, label]) => `<button type="button" class="dm-segment" ${global ? "data-dm-global-choice" : "data-dm-choice"}="${field}" data-value="${value}" aria-pressed="false">${label}</button>`).join("")}</div>`;

export const danmakuControlsMarkup = (global = false) => `
  <div class="dm-panel-summary"><div><b>${global ? "全部房间" : "显示弹幕"}</b><span ${global ? "data-dm-global-summary" : "data-dm-summary"} role="status">弹幕已关闭</span></div><button ${global ? "data-dm-global-toggle" : "data-dm-toggle"} type="button" class="dm-power" aria-pressed="false" aria-label="${global ? "开启全部弹幕" : "开启弹幕"}">${iconMarkup("chatOff")}<span>开启</span></button></div>
  <div class="dm-control-group"><span class="dm-control-label">显示方式</span>
    ${danmakuSegments("mode", [["scroll", "飘屏弹幕"], ["sidebar", "弹幕栏"]], global)}
    <p class="dm-hint" data-dm-mode-hint>弹幕从画面上方飘过。</p>
  </div>
  <div class="dm-control-group" ${global ? "data-dm-defaults-area-wrap" : "data-dm-area-wrap"}><span class="dm-control-label">飘屏范围</span>
    ${danmakuSegments("area", [["0.25", "1/4 屏"], ["0.5", "半屏"], ["0.75", "3/4 屏"], ["1", "全屏"]], global)}
  </div>
  <div class="dm-control-group" ${global ? "data-dm-defaults-style-wrap" : "data-dm-style-wrap"}><span class="dm-control-label">飘屏版式</span>
    ${danmakuSegments("style", [["simple", "简单"], ["normal", "正常"]], global)}
  </div>
  <p ${global ? "data-dm-global-status" : "data-dm-status"} class="dm-connection-status" role="status">${global ? "调整即时应用到现有房间，单房可独立修改。" : "弹幕已关闭"}</p>
`;
