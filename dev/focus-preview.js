// 本地浏览器 QA：复用实际画格、布局和尺寸观察模块，不发送任何直播请求。
import { createContext } from "../src/app/context.js";
import { initLayout } from "../src/app/layout.js";
import { initTile } from "../src/app/tile.js";
import { shellMarkup } from "../src/ui/shell-markup.js";
import { initTopbar } from "../src/app/topbar.js";
import { initStatus } from "../src/app/status.js";

const mount = document.querySelector("[data-preview-mount]");
mount.innerHTML = shellMarkup();
const appShell = mount.querySelector(".app-shell");
mount.append(appShell);
mount.querySelector("dialog").remove();
mount.querySelector("[data-entry]").remove();
const wall = document.querySelector("[data-wall]");
const ctx = createContext();
Object.assign(ctx, {
  wrapper: document.body, wall, appShell, opened: true,
  els: Object.fromEntries([["count", "data-count"], ["health", "data-health"], ["audioMode", "data-audio-mode"], ["masterGain", "data-master-gain"], ["masterPct", "data-master-pct"]].map(([name, attribute]) => [name, document.querySelector(`[${attribute}]`)])),
  paintSlider: () => {}, applyAudioAll: () => {}, refreshSoloButtons: () => {}, soloTargetId: () => null,
  save: () => {}, stop: () => {}, log: () => {}, showExitConfirm: () => {}, setAudioMode: () => {}, openContextMenu: () => {}, toggleMute: () => {}
});
ctx.emptyEl = document.createElement("div");
ctx.emptyEl.hidden = true;
wall.append(ctx.emptyEl);
initLayout(ctx);
initTopbar(ctx);
initStatus(ctx);
initTile(ctx);
const names = ["星海", "晚风", "小橘", "长夜", "清溪", "云游", "阿北", "一叶", "山川", "初晴", "夏野", "秋禾", "微光", "北辰", "南岸", "暮色"];
const colors = ["#24485a", "#54446b", "#465f51", "#6a5145", "#334a70", "#5b3654", "#3a5e68", "#5b5d36"];
let mixed = false;
const handlePosters = () => {
  for (const tile of ctx.tiles.values()) {
    const index = Number(tile.rid) - 100001;
    const ratio = mixed && index % 4 === 3 ? 9 / 16 : 16 / 9;
    const posterWidth = 540 * ratio;
    // QA 专用的模拟固有比例；实际播放器由 loadedmetadata 提供此数据。
    Object.defineProperties(tile.video, { videoWidth: { configurable: true, get: () => posterWidth }, videoHeight: { configurable: true, get: () => 540 } });
    const poster = `<svg xmlns="http://www.w3.org/2000/svg" width="${posterWidth}" height="540"><rect width="100%" height="100%" fill="${colors[index % colors.length]}"/><circle cx="75%" cy="30%" r="90" fill="#fff" opacity=".08"/><path d="M0 470L300 200L600 470L900 300L960 470V540H0Z" fill="#fff" opacity=".07"/><text x="50%" y="50%" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="36">${names[index]} · 模拟画面</text></svg>`;
    tile.video.poster = `data:image/svg+xml,${encodeURIComponent(poster)}`;
  }
  ctx.handleLayout();
};
const handleRoomCount = (count) => {
  for (const tile of [...ctx.tiles.values()]) if (Number(tile.rid) - 100001 >= count) ctx.removeTile(tile);
  for (let index = 0; index < count; index++) {
    const rid = String(100001 + index);
    if (![...ctx.tiles.values()].some((tile) => tile.rid === rid)) ctx.addTile(rid, 1, false, null, null, names[index]);
  }
  handlePosters();
  ctx.setFocus([...ctx.tiles.keys()][0]);
  ctx.select([...ctx.tiles.keys()][0]);
};
for (const button of document.querySelectorAll("[data-room-count]")) button.addEventListener("click", () => handleRoomCount(Number(button.dataset.roomCount)));
document.querySelector("[data-preview-mixed]").addEventListener("click", (event) => {
  mixed = !mixed;
  event.currentTarget.setAttribute("aria-pressed", String(mixed));
  handlePosters();
});
handleRoomCount(8);
const handleViewport = (width, height) => {
  appShell.style.width = `${width}px`;
  appShell.style.height = `${height + document.querySelector("[data-topbar]").offsetHeight}px`;
  ctx.handleLayout();
};
for (const button of document.querySelectorAll("[data-viewport]")) button.addEventListener("click", () => handleViewport(...button.dataset.viewport.split(",").map(Number)));
document.querySelector("[data-preview-grid]").addEventListener("click", () => ctx.setFocus(null));
handleViewport(1280, 720);
ctx.setFocus([...ctx.tiles.keys()][0]);
ctx.select([...ctx.tiles.keys()][0]);
