// DOM 冒烟：happy-dom 承载构建产物 dist/douyu-monitor.user.js，端到端过一遍
// 打开 / 关闭、设置抽屉、添加面板、Esc 已移除（不再触碰弹层），以及“暂不加载”不装配上次房间的回归；
// 末尾覆盖添加面板的批量回归：手动房号页可用、勾选精确批量、搜索清残留勾选、一键添加需二次确认、
// 轮播中状态校对，以及“暂不加载”必须把墙上房间收回（不能残留）；
// 末节覆盖放大模式分界线拖动调宽（自由调宽、主格不小于侧栏、宽度会话内记住）。
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
assert.ok(!/rgba\(255, 157, 107/.test(bundle), "不再有橙色描边/光环");
assert.ok(!/\.tile-shell\.is-focused \{[^}]*outline/.test(bundle), "放大主格不加描边，只靠尺寸区分");
assert.ok(!/\.wall\.is-focused \{[^}]*gap/.test(bundle), "放大态缝隙与平铺一致，不另加宽");
assert.ok(/\.wall\s*\{[^}]*gap: 1px/.test(bundle), "画墙缝隙为 1px 纯缝隙");

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
    { rid: 111111, rate: 1, danmaku: null, audio: { muted: true, volume: 1 } },
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
      data: stubFollowRooms.filter((room) => room.nickname.includes(kw)).map((room) => ({ roomResult: { rid: Number(room.rid), nickName: room.nickname, isLive: 1 } })),
    });
  }
  const betard = href.match(/\/betard\/(\d+)/);
  if (betard) return stubJson({ room: { room_id: betard[1], show_status: betard[1] === "400012" ? 2 : 1, owner_name: `房间${betard[1]}`, room_src: "" } });
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
check("计数已更新", /\b2\b/.test(query("[data-count]").textContent));

/* 9. 添加面板批量回归：手动页可用、勾选精确批量、搜索清残留、一键需二次确认 */
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
query("[data-manual-input]").value = "300002\n300001";
click(query("[data-manual-add]"));
check("重复房间不虚报成功", tilesInWall() === 4 && query("[data-add-status]").textContent.includes("已添加 1 个房间"));

// 勾选精确批量（“勾几个却加一大批”的“添加选中”半边）
pickTab("all");
await sleep(120);
check("页签只剩关注·全部/添加历史/手动房号", qa("[name=add-tab]").map((el) => el.value).join(",") === "all,history,manual");
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

// C 回归边角：换到搜索清掉残留勾选，计数不再虚高
rows()[1].querySelector("[data-chk]").click();
check("再勾 1 个按钮计数为 1", query("[data-add-selected]").textContent.includes("（1）"));
const search = query("[data-add-search]");
search.value = "关注主播5";
search.dispatchEvent(new win.Event("input", { bubbles: true }));
await sleep(400);
check("搜索后残留勾选被清空", query("[data-add-selected]").textContent.includes("（0）"));
check("搜索命中 1 行", qa("[data-add-list] [data-rid]").length === 1);
search.value = "";
search.dispatchEvent(new win.Event("input", { bubbles: true }));
await sleep(120);
check("清空搜索回到关注列表", qa("[data-add-list] [data-rid]").length === 12);
const loopRow = rows().find((el) => el.dataset.rid === "400012");
check("轮播中状态被校对出来", loopRow.querySelector(".rbadge").textContent === "轮播中");

// 你报的 bug 半边：一键添加必须二次确认，不能与勾选混淆直接进一大批
const before = tilesInWall();
click(query("[data-add-live-all]"));
check("一键添加先弹确认而非直接加房", tilesInWall() === before && query("[data-toast]").hidden === false);
check("确认条提供“添加全部”", query("[data-toast-actions]").textContent.includes("添加全部"));
const toastBtn = (label) => [...query("[data-toast-actions]").querySelectorAll("button")].find((b) => b.textContent === label);
click(toastBtn("取消"));
check("取消后未添加任何房间", tilesInWall() === before);
click(query("[data-add-live-all]"));
click(toastBtn("添加全部"));
check("确认后直播中的房间全部添加", tilesInWall() > before && query("[data-add-status]").textContent.includes("已添加"));
check("一键只加直播中的 9 个，轮播中不加", tilesInWall() === 15 && !qa("[data-wall] [data-name]").some((el) => el.textContent.startsWith("400012")));

/* 10. 回归：点击“暂不加载”后房间不得留在墙上（续播态拒绝同样清墙） */
dialog.close();
check("关闭后画格保留（布局保留）", tilesInWall() === 15);
click(entry);
check("再次打开是续播态询问", query("[data-resume-title]").textContent === "是否加载并播放当前的房间？");
check("续播态按钮同为“暂不加载”", query("[data-resume-no]").textContent === "暂不加载");
check("续播态显示已就绪 15 个", query("[data-resume-detail]").textContent.includes("15"));
click(query("[data-resume-no]"));
check("点击暂不加载后墙上房间全部收回", tilesInWall() === 0);
const savedAfterPark = stored.get(KEY);
check("收回的 15 个房间完整保留待下次加载", Array.isArray(savedAfterPark?.tiles) && savedAfterPark.tiles.length === 15);
dialog.close();
click(entry);
check("下次打开回到“是否加载上次的直播间”", query("[data-resume-title]").textContent === "是否加载上次的直播间？");
check("询问里房间数为 15", query("[data-resume-detail]").textContent.includes("15"));

/* 11. 放大模式：分界线自由调宽（主格不小于侧栏、宽度会话内记住、平铺不带拖拽条） */
click(query("[data-resume-yes]"));
check("确认加载后 15 个画格回墙", tilesInWall() === 15);
const menuOf = (tile) => {
  tile.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
  return qa("[data-ctx] .ctx-item");
};
const tileA = wall.querySelector(".tile-shell");
check("右键菜单给出放大入口", menuOf(tileA).some((el) => el.textContent.includes("放大该房间")));
click(menuOf(tileA).find((el) => el.textContent.includes("放大该房间")));
check("放大后墙进入聚焦布局", wall.classList.contains("is-focused"));
check("聚焦布局为主格 + 280px 侧栏", wall.style.gridTemplateColumns === "minmax(0,1fr) 280px");
const resizeEl = query("[data-wall-resize]");
check("分界拖拽条存在", Boolean(resizeEl));
wall.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1200, width: 1200, height: 800 });
const drag = (el, type, x, y) => el.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
drag(resizeEl, "pointerdown", 920, 300);
drag(resizeEl, "pointermove", 800, 340);
check("拖动后侧栏宽度自由变 400px", wall.style.gridTemplateColumns === "minmax(0,1fr) 400px");
drag(resizeEl, "pointerup", 800, 340);
drag(resizeEl, "pointerdown", 1100, 300);
drag(resizeEl, "pointermove", 300, 300);
drag(resizeEl, "pointerup", 300, 300);
check("主格不小于缩小的侧栏：侧栏夹在墙宽一半 600px", wall.style.gridTemplateColumns === "minmax(0,1fr) 600px");
drag(resizeEl, "pointerdown", 600, 300);
drag(resizeEl, "pointermove", 1195, 300);
drag(resizeEl, "pointerup", 1195, 300);
check("侧栏收窄留 120px 可用性下限", wall.style.gridTemplateColumns === "minmax(0,1fr) 120px");
const tileB = wall.querySelectorAll(".tile-shell")[1];
click(menuOf(tileB).find((el) => el.textContent.includes("放大该房间")));
check("切换聚焦目标宽度会话内记住（120px）", wall.style.gridTemplateColumns === "minmax(0,1fr) 120px");
click(menuOf(tileB).find((el) => el.textContent.includes("恢复平铺")));
check("恢复平铺后回到等分网格", !wall.classList.contains("is-focused") && wall.style.gridTemplateColumns.startsWith("repeat("));

/* --- 汇总 --- */
win.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n冒烟：${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.error(`失败 ${failed.length} 项：${failed.map((r) => r.name).join("；")}`);
  process.exit(1);
}
process.exit(0);
