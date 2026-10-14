// DOM 冒烟：happy-dom 承载构建产物 dist/douyu-monitor.user.js，端到端过一遍
// 打开 / 关闭、设置抽屉、添加面板、Esc 已移除（不再触碰弹层），以及“暂不加载”不装配上次房间的回归；
// 末尾覆盖添加面板的批量回归：手动房号页可用、勾选精确批量、跨页保留勾选、全选不直接添加、
// 轮播中状态校对，以及“暂不加载”必须把墙上房间收回（不能残留）；
// 末节覆盖左侧主画面、均衡布局、拖拽换位与顶栏收起。
// 运行：npm run build && npm run smoke
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { KEY, HOST_ID } from "../src/core/settings.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(here, "..", "dist", "douyu-monitor.user.js");
let bundle;
try {
  bundle = readFileSync(bundlePath, "utf8");
} catch {
  console.error("找不到构建产物 dist/douyu-monitor.user.js，请先执行 npm run build");
  process.exit(1);
}

/* --- 产物级文案断言（交付物就是这个单文件） --- */
assert.ok(bundle.includes("监控室"), "产物应含“监控室”");
assert.ok(!bundle.includes("斗鱼监控室"), "产物不应再用旧名“斗鱼监控室”");
assert.ok(!bundle.includes("监看台"), "产物不应再有“监看台”");
assert.ok(!bundle.includes("监看墙"), "产物不应再有“监看墙”");
assert.ok(!bundle.includes("快捷键"), "产物不应再有快捷键功能");
assert.ok(/\.tile-tools\s*\{[^}]*width:\s*max-content/.test(bundle), "工具条应 max-content 撑开，不能按半格宽度收缩");
assert.ok(/\.tile-tools\s*\{[^}]*flex-wrap:\s*nowrap/.test(bundle), "工具条应固定单行，不能换行");
assert.ok(!bundle.includes("wr-arrows"), "调宽不再带箭头图标，只留光标手势");
assert.ok(!/rgba\(255, 167, 107/.test(bundle), "不再有橙色描边/光环");
assert.ok(!/\.tile-shell\.is-focused \{[^}]*outline/.test(bundle), "放大主格不加描边，只靠尺寸区分");
assert.ok(/\.tile-video\s*\{[^}]*object-fit:\s*contain/.test(bundle), "视频保持直播流比例完整显示（contain），不拉伸");
assert.ok(/\.tile-video\s*\{[^}]*object-position:\s*center/.test(bundle), "视频居中显示，允许黑边");
assert.ok(!/\.focus-region\s+\.tile-video/.test(bundle), "放大模式小窗不再 cover 裁切");
assert.ok(!/\.is-focused\s+\.tile-video/.test(bundle), "主窗画面不再左偏");
assert.ok(/\.tile-status\s*\{[^}]*border-radius:\s*999px/.test(bundle), "状态栏为胶囊样式");
assert.ok(/\.tile-status\s*\{[^}]*width:\s*auto/.test(bundle), "胶囊宽度显式 auto，随直播间名收缩，不被站点全局 header 样式拉满");
assert.ok(!/\.tile-status\s*\{[^}]*max-width/.test(bundle), "胶囊不设 max-width 固定上限，宽度纯 auto");
assert.ok(!/\.style\.width\s*=/.test(bundle), "全产物不写内联 width：胶囊宽度只能来自样式表的 auto");
assert.ok(!bundle.includes("tile-header-mask"), "胶囊只含状态点与直播间名，不再有顶部遮罩");
assert.ok(/\.wall\s*\{[^}]*gap:\s*0\.5px/.test(bundle) && /rgba\(56, 138, 240/.test(bundle), "画墙缝隙为 0.5px 冷蓝数据线");
assert.ok(/getSearchRecV2\?kw=\$\{encodeURIComponent/.test(bundle), "添加直播间搜索固定走 getSearchRecV2 接口，kw 为搜索关键词");
assert.ok(/videoLoop/.test(bundle) && /\.isLoop/.test(bundle), "轮播标志 videoLoop/isLoop 参与三态映射（轮播中/直播中/未开播）");
assert.ok(/tile-audio-corner/.test(bundle), "右上角包含常驻声音控制胶囊");
assert.ok(/room_name/.test(bundle), "关注列表过滤覆盖 room_name 等标题字段");

/* --- happy-dom 环境 --- */
const win = new Window({ url: "https://www.douyu.com/directory/myFollow" });
const copy = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
copy("window", win);
copy("self", win);
copy("top", win);
copy("document", win.document);
copy("location", win.location);
copy("navigator", win.navigator);
copy("alert", () => {});
copy("MutationObserver", win.MutationObserver);
copy("requestAnimationFrame", win.requestAnimationFrame.bind(win));
copy("cancelAnimationFrame", win.cancelAnimationFrame.bind(win));
copy("getComputedStyle", win.getComputedStyle.bind(win));
for (const name of ["Event", "CustomEvent", "KeyboardEvent", "MouseEvent", "HTMLElement", "HTMLDialogElement", "Notification", "AudioContext"]) {
  if (win[name]) copy(name, win[name]);
}

/* --- GM_* mock：预置一份“上次保存”的工作区（每次询问 + 2 个房间） --- */
const stored = new Map();
stored.set(KEY, {
  schemaVersion: 2,
  layoutMode: 2, capacity: 8, hevc: false, pauseOfficial: true, clock: true,
  resumeMode: "ask",
  audio: { mode: "mix", master: 0.5, followFocus: false, autoMute: true },
  danmakuDefaults: {}, liveAlerts: true, liveAlertSound: false, liveAutoPlay: true,
  drawerVisible: true,
  tiles: [
    { rid: 111111, rate: 1, danmaku: { enabled: true }, audio: { muted: true, volume: 1 } },
    { rid: 222222, rate: 1, danmaku: null, audio: { muted: true, volume: 1 } },
  ],
});
copy("GM_getValue", (k, fallback) => (stored.has(k) ? stored.get(k) : fallback));
copy("GM_setValue", (k, v) => stored.set(k, v));
const menuCommands = [];
copy("GM_registerMenuCommand", (name, fn) => menuCommands.push({ name, fn }));

// 网络桩：关注 / 搜索 / 房间探测可服务（供添加面板回归用），取流等一律快速失败。
// 注意 fetchJson 要求 payload.error === 0，探测接口则直接读 payload.room。
const stubFollowRooms = Array.from({ length: 12 }, (_, i) => ({
  rid: String(400001 + i),
  nickname: `关注主播${i + 1}`,
  isLive: 1,
  roomSrc: "",
}));
const stubJson = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
copy("fetch", (url) => {
  const href = String(url);
  if (href.includes("/japi/weblist/api/getFollowList")) return stubJson({ error: 0, data: { list: stubFollowRooms } });
  if (href.includes("getSearchRecV2")) {
    const kw = decodeURIComponent((href.split("kw=")[1] || "").split("&")[0]);
    return stubJson({
      error: 0,
      data: stubFollowRooms.filter((room) => room.nickname.includes(kw)).map((room) => ({ roomResult: { rid: Number(room.rid), nickName: room.nickname, isLive: room.rid === "400004" ? 2 : 1, isLoop: room.rid === "400012" ? 1 : 0 } })),
    });
  }
  const betard = href.match(/\/betard\/(\d+)/);
  if (betard) {
    // 实测语义：show_status 2=未开播，videoLoop 1=轮播中（开播标志仍为 1）。
    const rid = betard[1];
    return stubJson({ room: { room_id: rid, show_status: rid === "400004" ? 2 : 1, videoLoop: rid === "400012" ? 1 : 0, owner_name: rid === "400012" ? "轮播主播" : `主播${Number(rid) % 100}`, room_src: "" } });
  }
  return Promise.reject(new TypeError("smoke: network disabled"));
});

/* --- 跑产物 --- */
vm.runInThisContext(bundle, { filename: "douyu-monitor.user.js" });

const results = [];
const check = (name, cond) => {
  results.push({ name, ok: Boolean(cond) });
  if (!cond) console.error(`  ✗ ${name}`);
};
const click = (el) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
const esc = () => dialog.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));

const host = win.document.getElementById(HOST_ID);
check("入口挂载进页面", host && host.shadowRoot);
const wrapper = host.shadowRoot.querySelector(".monitor-root");
const query = (s) => wrapper.querySelector(s);
const qa = (s) => [...wrapper.querySelectorAll(s)];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const dialog = query("[data-dialog]");
const wall = query("[data-wall]");
const tilesInWall = () => wall.querySelectorAll(".tile-shell").length;
const prompt = query("[data-resume-prompt]");
const entry = query("[data-entry]");
const drawer = query("[data-drawer]");
const addPanel = query("[data-add-panel]");

check("菜单命令名称已是“打开监控室”", menuCommands.some((m) => m.name === "打开监控室"));

/* 1. 启动即恢复：ask 模式下房间只挂起、不装配（“暂不加载”回归的根源） */
check("启动后墙为空（未擅自装配上次房间）", tilesInWall() === 0);
check("空态占位可见", wall.querySelector(".empty"));
check("启动未装配但房间已挂起（待确认）", prompt.hidden === true);

/* 2. 入口打开 → 恢复询问（上次保存的房间文案） */
click(entry);
check("对话框已打开", dialog.open === true);
check("入口按钮隐藏", entry.hidden === true);
check("恢复询问弹出", prompt.hidden === false);
check("询问标题为加载上次", query("[data-resume-title]").textContent === "是否加载上次的直播间？");
check("确认按钮为加载上次直播间", query("[data-resume-yes]").textContent === "加载上次直播间");
check("取消按钮为暂不加载", query("[data-resume-no]").textContent === "暂不加载");
check("打开后标题为监控室", win.document.title === "监控室");

/* 3. Esc 分层后退已移除：不得触碰询问，原生 Esc 关闭也要拦下 */
esc();
check("Esc 不再收起询问", prompt.hidden === false && dialog.open === true);
const cancelEvent = new win.Event("cancel", { cancelable: true });
dialog.dispatchEvent(cancelEvent);
check("原生 Esc 关面板被拦下（cancel 已 preventDefault）", cancelEvent.defaultPrevented === true && dialog.open === true);

/* 4. 关闭再开：挂起房间仍在，询问再次出现 */
dialog.close();
check("关闭后入口回归", entry.hidden === false);
check("关闭后标题还原", win.document.title !== "监控室");
click(entry);
check("重新打开再次询问", prompt.hidden === false && tilesInWall() === 0);

/* 5. “暂不加载”：墙保持为空，且保存不丢房间（非破坏性写入） */
click(query("[data-resume-no]"));
check("暂不加载后询问收起", prompt.hidden === true);
check("暂不加载后墙仍为空", tilesInWall() === 0);
check("暂不加载后设置抽屉打开", drawer.hidden === false);
const saved = stored.get(KEY);
check("保存的工作区仍保留 2 个房间", Array.isArray(saved?.tiles) && saved.tiles.length === 2);
check("保存的房间号未变", String(saved?.tiles?.[0]?.rid) === "111111" && String(saved?.tiles?.[1]?.rid) === "222222");

/* 6. 抽屉开合 */
click(query("[data-controls-toggle]"));
check("抽屉可收起", drawer.hidden === true);
click(query("[data-controls-toggle]"));
check("抽屉可展开", drawer.hidden === false);
click(query("[data-controls-collapse]"));
check("抽屉折叠按钮可用", drawer.hidden === true);

/* 7. 添加面板与抽屉：Esc 已移除，只能走各自的关闭按钮 */
click(query("[data-add-open]"));
check("添加面板打开", addPanel.hidden === false);
click(query("[data-controls-toggle]"));
check("面板开着时仍可展开抽屉", drawer.hidden === false);
esc();
check("Esc 不再关闭添加面板 / 抽屉", addPanel.hidden === false && drawer.hidden === false);
click(query("[data-add-close]"));
check("添加面板用关闭按钮收起", addPanel.hidden === true);
click(query("[data-controls-collapse]"));
check("抽屉用折叠按钮收起", drawer.hidden === true);

/* 8. 确认加载：房间进墙 */
dialog.close();
click(entry);
check("第三次打开再次询问", prompt.hidden === false && tilesInWall() === 0);
click(query("[data-resume-yes]"));
check("确认后 2 个画格装配进墙", tilesInWall() === 2);
check("确认后询问收起", prompt.hidden === true);
check("恢复旧存档也默认关闭弹幕", qa("[data-wall] [data-t-danmaku]").every((el) => el.getAttribute("aria-pressed") === "false"));
check("计数已更新", /\b2\b/.test(query("[data-count]").textContent));

/* 9. 添加面板批量回归：手动页可用、跨页勾选批量添加、全选只选择 */
click(query("[data-add-open]"));
check("添加面板再次打开", addPanel.hidden === false);
const pickTab = (value) => {
  const radio = qa("[name=add-tab]").find((el) => el.value === value);
  radio.checked = true;
  radio.dispatchEvent(new win.Event("change", { bubbles: true }));
};

// A 回归：手动房号页必须渲染输入框（此前 mode 从未置为 manual，页面永远显示“暂无内容”）
pickTab("manual");
check("手动房号页渲染出输入框", Boolean(query("[data-manual-input]")));
query("[data-manual-input]").value = "300001";
click(query("[data-manual-add]"));
check("手动解析并添加生效", tilesInWall() === 3);
const addedTile = qa("[data-wall] .tile-shell")[2];
check("新建画格右上角有常驻声音控制胶囊", Boolean(addedTile.querySelector(".tile-audio-corner")));
check("新建画格视频原生默认处于静音状态", addedTile.querySelector("video").muted === true);
check("新建画格声音胶囊带有静音样式", addedTile.querySelector(".tile-audio-corner").classList.contains("is-muted"));
query("[data-manual-input]").value = "300002\n300001";
click(query("[data-manual-add]"));
check("重复房间不虚报成功", tilesInWall() === 4 && query("[data-add-status]").textContent.includes("已添加 1 个房间"));

// 勾选精确批量（“勾几个却加一大批”的“添加选中”半边）
pickTab("all");
await sleep(120);
check("页签包含关注·全部/添加历史/手动房号/团播（不含旧搜索标签）", qa("[name=add-tab]").map((el) => el.value).join(",") === "all,history,manual,groups");
check("关注·全部列出 12 行", qa("[data-add-list] [data-rid]").length === 12);
const rows = () => qa("[data-add-list] [data-rid]");
const firstRow = rows()[0];
firstRow.querySelector("[data-chk]").click();
check("勾选不重建列表（行节点引用不变）", rows()[0] === firstRow);
rows()[2].querySelector("[data-chk]").click();
check("勾 2 个按钮计数为 2", query("[data-add-selected]").textContent.includes("（2）"));
click(query("[data-add-selected]"));
check("勾 2 个只加 2 个", tilesInWall() === 6);
check("批量后按钮归零并禁用", query("[data-add-selected]").disabled === true);

// 跨搜索和标签页保留选择，添加时包含不在当前页的房间
rows()[1].querySelector("[data-chk]").click();
check("再勾 1 个按钮计数为 1", query("[data-add-selected]").textContent.includes("（1）"));
const search = query("[data-add-search]");
search.value = "关注主播5";
search.dispatchEvent(new win.Event("input", { bubbles: true }));
await sleep(120);
check("输入过程不搜索（回车才搜）", qa("[data-add-list] [data-rid]").length === 12);
search.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
await sleep(400);
check("回车后才发起搜索", qa("[data-add-list] [data-rid]").length === 1);
check("搜索后原勾选保留", query("[data-add-selected]").textContent.includes("（1）"));
rows()[0].querySelector("[data-chk]").click();
check("不同列表选择累计且去重", query("[data-add-selected]").textContent.includes("（2）"));
pickTab("history");
check("换标签仍保留 2 个选择", query("[data-add-selected]").textContent.includes("（2）"));
click(query("[data-add-selected]"));
check("历史页能添加关注和搜索中选中的房间", tilesInWall() === 8);
check("成功添加后计数归零", query("[data-add-selected]").disabled);
check("新添加房间默认关闭弹幕", qa("[data-wall] [data-t-danmaku]").every((el) => el.getAttribute("aria-pressed") === "false"));
pickTab("all");
await sleep(120);
search.value = "关注主播5";
search.dispatchEvent(new win.Event("input", { bubbles: true }));
await sleep(120);
check("输入仍未搜索", qa("[data-add-list] [data-rid]").length === 12);
search.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
await sleep(400);
check("搜索命中 1 行", qa("[data-add-list] [data-rid]").length === 1);
search.value = "";
search.dispatchEvent(new win.Event("input", { bubbles: true }));
await sleep(120);
check("清空搜索回到关注列表", qa("[data-add-list] [data-rid]").length === 12);

// 输入法的回车键只把中文上屏（isComposing），不直接搜索；上屏完成后沿用同一次回车意图搜一次。
search.value = "关注主播5";
search.dispatchEvent(new win.Event("input", { bubbles: true }));
const composingEnter = new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
Object.defineProperty(composingEnter, "isComposing", { value: true });
search.dispatchEvent(composingEnter);
await sleep(120);
check("输入法上屏回车不直接搜索", qa("[data-add-list] [data-rid]").length === 12);
search.dispatchEvent(new win.Event("compositionend", { bubbles: true }));
await sleep(400);
check("上屏完成后沿用回车意图搜索", qa("[data-add-list] [data-rid]").length === 1);
search.value = "";
search.dispatchEvent(new win.Event("input", { bubbles: true }));
await sleep(120);
check("再次清空搜索回到关注列表", qa("[data-add-list] [data-rid]").length === 12);
const loopRow = rows().find((el) => el.dataset.rid === "400012");
check("轮播中状态被校对出来", loopRow.querySelector(".rbadge").textContent === "轮播中");
const offRow = rows().find((el) => el.dataset.rid === "400004");
check("未开播状态被校对出来（show_status 2 不再误判轮播）", offRow.querySelector(".rbadge").textContent === "未开播");

// 全选覆盖所有状态，只选择；再次点击只取消当前列表的选择。
const before = tilesInWall();
click(query("[data-add-select-all]"));
check("全选不直接添加房间", tilesInWall() === before);
check("全选包含轮播房间", rows().find((el) => el.dataset.rid === "400012").querySelector("[data-chk]").checked);
check("全选跳过已添加房间，剩余 8 个", query("[data-add-selected]").textContent.includes("（8）"));
click(query("[data-add-select-all]"));
check("再次全选取消当前页选择", query("[data-add-selected]").disabled);
click(query("[data-add-select-all]"));
click(query("[data-add-selected]"));
check("点击添加选中后才添加全部选择", tilesInWall() === 16);
check("全选添加包含轮播房间", qa("[data-wall] [data-name]").some((el) => el.textContent === "轮播主播"));
check("旧一键添加按钮已移除", !query("[data-add-live-all]"));

/* 10. 回归：点击“暂不加载”后房间不得留在墙上（续播态拒绝同样清墙） */
dialog.close();
check("关闭后画格保留（布局保留）", tilesInWall() === 16);
click(entry);
check("再次打开是续播态询问", query("[data-resume-title]").textContent === "是否加载并播放当前的房间？");
check("续播态按钮同为“暂不加载”", query("[data-resume-no]").textContent === "暂不加载");
check("续播态显示已就绪 16 个", query("[data-resume-detail]").textContent.includes("16"));
click(query("[data-resume-no]"));
check("点击暂不加载后墙上房间全部收回", tilesInWall() === 0);
const savedAfterPark = stored.get(KEY);
check("收回的 16 个房间完整保留待下次加载", Array.isArray(savedAfterPark?.tiles) && savedAfterPark.tiles.length === 16);
check("工作区保存主播名，恢复时无需显示房号", savedAfterPark.tiles.find((tile) => String(tile.rid) === "400012")?.name === "轮播主播");
dialog.close();
click(entry);
check("下次打开回到“是否加载上次的直播间”", query("[data-resume-title]").textContent === "是否加载上次的直播间？");
check("询问里房间数为 16", query("[data-resume-detail]").textContent.includes("16"));

/* 11. 放大布局：尺寸优先、左侧与底部小房间、小窗等大、无滚动、复用节点 */
click(query("[data-resume-yes]"));
check("确认加载后 16 个画格回墙", tilesInWall() === 16);
let wallWidth = 1280, wallHeight = 720;
wall.getBoundingClientRect = () => ({ left: 0, top: 0, right: wallWidth, bottom: wallHeight, width: wallWidth, height: wallHeight });
const menuOf = (tile) => {
  tile.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
  return qa("[data-ctx] .ctx-item");
};
const tileA = wall.querySelector(".tile-shell");
const videoA = tileA.querySelector("video");
const originalTiles = [...wall.querySelectorAll(".tile-shell")];
click(menuOf(tileA).find((el) => el.textContent.includes("放大该房间")));
check("放大后进入聚焦布局", wall.classList.contains("is-focused"));
check("主房间位于左上", tileA.parentElement === wall && tileA.style.gridColumn === "1" && tileA.style.gridRow === "1");
check("右侧和底部均有小房间", query('[data-focus-region="right"]').hidden === false && query('[data-focus-region="bottom"]').hidden === false);
const smallTiles = originalTiles.filter((tile) => tile !== tileA);
check("主画面至少 640px，小窗等大且不小于 120×60", parseFloat(tileA.style.width) >= 635 && new Set(smallTiles.map((tile) => tile.style.width)).size === 1 && new Set(smallTiles.map((tile) => tile.style.height)).size === 1 && smallTiles.every((tile) => parseFloat(tile.style.width) >= 120 && parseFloat(tile.style.height) >= 60));
check("布局切换复用所有视频节点", originalTiles.every((tile) => wall.contains(tile)) && tileA.querySelector("video") === videoA);
check("房间标题不再显示房号前缀", qa("[data-wall] [data-name]").every((el) => !/^\d+\s*·/.test(el.textContent)));
check("尺寸自动计算，不再显示手动尺寸控件", !query("[data-wall-resize]") && !query("[data-focus-small-width]") && !query("[data-focus-main-width]"));
check("顶部仅保留状态点与主播名", originalTiles.every((tile) => tile.querySelector(".tile-status").children.length === 2 && !tile.querySelector("[data-badge]")));
check("声音按钮位于右上角常驻胶囊内", originalTiles.every((tile) => tile.querySelector(".tile-audio-corner").contains(tile.querySelector("[data-t-mute]"))));
check("状态点含无障碍说明", originalTiles.every((tile) => tile.querySelector("[data-dot]").getAttribute("aria-label")));
const tileB = originalTiles[1];
click(menuOf(tileB).find((el) => el.textContent.includes("放大该房间")));
check("切换主房间复用原视频并自动计算", tileB.parentElement === wall && parseFloat(tileB.style.width) >= 635 && tileA.querySelector("video") === videoA);
wallWidth = 375; wallHeight = 600;
win.dispatchEvent(new win.Event("resize"));
await sleep(30);
check("窄窗口显示尺寸受限提示", !query("[data-focus-hint]").hidden);
check("窄窗口主画面适配宽度", parseFloat(tileB.style.width) <= 375);
const narrowSmallTiles = originalTiles.filter((tile) => tile !== tileB);
check("窄窗口统一缩小，末行同尺寸且无滚动兜底", narrowSmallTiles.every((tile) => tile.style.width === narrowSmallTiles[0].style.width && tile.style.height === narrowSmallTiles[0].style.height) && !query(".focus-region.is-overflow"));
wallWidth = 1280; wallHeight = 720;
win.dispatchEvent(new win.Event("resize"));
await sleep(30);
check("窗口变大后恢复正常布局并取消提示", query("[data-focus-hint]").hidden && parseFloat(tileB.style.width) >= 635);
click(menuOf(tileB).find((el) => el.textContent.includes("恢复平铺")));
check("恢复平铺所有房间回到墙中", !wall.classList.contains("is-focused") && originalTiles.every((tile) => tile.parentElement === wall));
check("恢复平铺清除固定尺寸和定位", originalTiles.every((tile) => !tile.style.width && !tile.style.height && !tile.style.position));
const startDrag = new win.Event("dragstart", { bubbles: true, cancelable: true });
Object.defineProperty(startDrag, "dataTransfer", { value: { setData: () => {}, effectAllowed: "" } });
originalTiles[0].querySelector("[data-drag]").dispatchEvent(startDrag);
originalTiles[1].dispatchEvent(new win.Event("drop", { bubbles: true, cancelable: true }));
check("拖动交换后平铺顺序正确", [...wall.querySelectorAll(".tile-shell")][0] === originalTiles[1]);
click(menuOf(originalTiles[0]).find((el) => el.textContent.includes("放大该房间")));
check("拖动交换后仍可按房间身份放大", originalTiles[0].parentElement === wall && originalTiles[0].classList.contains("is-focused"));
click(menuOf(originalTiles[0]).find((el) => el.textContent.includes("恢复平铺")));

check("不再存在底部常驻状态与时钟", !query(".tile-foot") && !query("[data-clock]") && !query("[data-clock-toggle]"));
check("日常停止状态没有底部文案", qa("[data-wall] [data-note]").every((el) => el.hidden && !el.textContent));

/* 12. 整体顶栏收起与重新展开，状态随工作区保存 */
const globalTopbar = query("[data-topbar]");
const appShell = query(".app-shell");
appShell.getBoundingClientRect = () => ({ left: 100, top: 50, width: 1280, height: 720, right: 1380, bottom: 770 });
appShell.dispatchEvent(new win.PointerEvent("pointermove", { pointerType: "mouse", clientX: 740, clientY: 74 }));
check("顶部中间区域唤起标题栏把手", appShell.classList.contains("topbar-near"));
appShell.dispatchEvent(new win.PointerEvent("pointermove", { pointerType: "mouse", clientX: 900, clientY: 74 }));
check("离开顶部指定区域把手收回", !appShell.classList.contains("topbar-near"));
appShell.dispatchEvent(new win.PointerEvent("pointermove", { pointerType: "touch", clientX: 740, clientY: 74 }));
check("触摸事件不依赖悬停区域", !appShell.classList.contains("topbar-near"));
click(query("[data-topbar-collapse]"));
check("整体顶部栏向上收起，保留展开入口", query(".app-shell").classList.contains("is-topbar-collapsed") && !query("[data-topbar-expand]").hidden && globalTopbar.inert);
check("收起后隐藏旧按钮并将焦点交给展开按钮", query("[data-topbar-collapse]").hidden && query("[data-topbar-expand]").getRootNode().activeElement === query("[data-topbar-expand]"));
appShell.dispatchEvent(new win.PointerEvent("pointermove", { pointerType: "mouse", clientX: 740, clientY: 74 }));
appShell.dispatchEvent(new win.PointerEvent("pointerleave"));
check("鼠标离开监控室后清除顶部把手提示", !appShell.classList.contains("topbar-near"));
check("收起状态随工作区保存", stored.get(KEY).topbarCollapsed === true);
click(query("[data-topbar-expand]"));
check("重新展开顶部栏，恢复控制项可访问性", !query(".app-shell").classList.contains("is-topbar-collapsed") && query("[data-topbar-expand]").hidden && !globalTopbar.inert && globalTopbar.getAttribute("aria-hidden") === "false");
check("恢复展开状态也保存", stored.get(KEY).topbarCollapsed === false);

/* 13. 整个画格可拖拽；放大时交换主区域身份，播放器节点不变 */
const sourceRoom = originalTiles[0], targetRoom = originalTiles[1];
click(menuOf(sourceRoom).find((el) => el.textContent.includes("放大该房间")));
check("整个房间画格都可拖动", sourceRoom.draggable && sourceRoom.tabIndex === 0);
const rootDrag = new win.Event("dragstart", { bubbles: true, cancelable: true });
Object.defineProperty(rootDrag, "dataTransfer", { value: { setData: () => {}, effectAllowed: "" } });
sourceRoom.dispatchEvent(rootDrag);
targetRoom.dispatchEvent(new win.Event("dragover", { bubbles: true, cancelable: true }));
check("拖动时提供源房间与落点提示", sourceRoom.classList.contains("is-dragging") && targetRoom.classList.contains("is-drop-target"));
targetRoom.dispatchEvent(new win.Event("drop", { bubbles: true, cancelable: true }));
check("放大模式拖动交换后目标房间接替左侧主区域", targetRoom.parentElement === wall && targetRoom.classList.contains("is-focused") && targetRoom.style.gridColumn === "1" && !sourceRoom.classList.contains("is-focused"));
check("拖动结束清除提示并保留视频节点", !sourceRoom.classList.contains("is-dragging") && !targetRoom.classList.contains("is-drop-target") && sourceRoom.querySelector("video") === videoA);
click(menuOf(targetRoom).find((el) => el.textContent.includes("恢复平铺")));
sourceRoom.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
check("选中房间带有无障碍选中状态", sourceRoom.getAttribute("aria-current") === "true");
check("选中房间仅名称淡粉染色且画面零边框零图标", /\.tile-shell\.is-selected \.t-name\s*\{[^}]*color:\s*#ffb3c8/.test(bundle) && !/\.tile-shell\.is-selected\s*\{[^}]*outline:/.test(bundle) && !bundle.includes(".tile-shell.is-selected .tile-status::before"));
check("选中状态不强制显示控制器遮挡画面", !bundle.includes(".tile-shell.is-selected .tile-tools"));

/* --- 汇总 --- */
win.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n冒烟：${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.error(`失败 ${failed.length} 项：${failed.map((r) => r.name).join("；")}`);
  process.exit(1);
}
process.exit(0);
