import { LAYOUT_VARIANTS, calculateLayoutVariant, compareLayoutVariants, auditLayoutVariant } from "./recursive-layout-variants.js";
import { DEFAULT_FOCUS_MAIN_WEIGHT } from "./recursive-layout-engine.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const comparisonPage = document.body.dataset.previewKind === "comparison";
const priority = ["balanced", "coverage"].includes(params.get("priority")) ? params.get("priority") : "compromise";
const asNumber = (value, fallback, min, max) => Number.isFinite(Number(value)) && value !== null ? Math.min(max, Math.max(min, Number(value))) : fallback;
const state = {
  count: Math.round(asNumber(params.get("count"), 8, 1, 16)),
  anchor: "auto",
  ratioMode: ["landscape", "portrait", "mixed"].includes(params.get("ratios")) ? params.get("ratios") : "landscape",
  weight: asNumber(params.get("weight"), priority === "compromise" ? DEFAULT_FOCUS_MAIN_WEIGHT : 4, 2, 10),
  priority,
  mainId: "01",
  mainRatio: "auto",
  view: ["overview", "compare", "single"].includes(params.get("view")) ? params.get("view") : comparisonPage ? "compare" : "single",
  scheme: LAYOUT_VARIANTS.some((variant) => variant.id === params.get("scheme")) ? params.get("scheme") : "auto",
  resolution: ["auto", "2246x994", "1920x1080", "2560x1440", "1280x720", "800x600", "390x844", "custom"].includes(params.get("resolution")) ? params.get("resolution") : "auto",
  customWidth: Math.round(asNumber(params.get("w"), 1920, 32, 16384)),
  customHeight: Math.round(asNumber(params.get("h"), 1080, 32, 16384)),
  guides: false,
};
const iconPaths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  maximize: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
};
const icon = (name) => `<svg class="h-full w-full" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name]}</svg>`;
for (const node of document.querySelectorAll("[data-icon]")) node.innerHTML = icon(node.dataset.icon);

const pad = (number) => String(number).padStart(2, "0");
const percent = (value) => `${(value * 100).toFixed(value > 0 && value < 0.001 ? 3 : 2)}%`;
const ratioLabel = (ratio) => {
  for (const [value, label] of [[16 / 9, "16:9"], [9 / 16, "9:16"], [4 / 3, "4:3"], [1, "1:1"], [21 / 9, "21:9"]]) if (Math.abs(value - ratio) < 1e-7) return label;
  return ratio.toFixed(2);
};
const makeRooms = (count, mainId = state.mainId) => Array.from({ length: count }, (_, index) => {
  const id = pad(index + 1);
  const ratios = state.ratioMode === "mixed" ? [16 / 9, 9 / 16, 4 / 3, 16 / 9, 1, 21 / 9] : [state.ratioMode === "portrait" ? 9 / 16 : 16 / 9];
  return { id, ratio: id === mainId && state.mainRatio !== "auto" ? Number(state.mainRatio) : ratios[index % ratios.length] };
});

// 信号图具备准确的源比例；四角边框和圆形能直接暴露裁切与拉伸。
const signalCache = new Map();
const signalFor = (room) => {
  const key = `${room.id}/${room.ratio}`;
  if (signalCache.has(key)) return signalCache.get(key);
  const height = 900;
  const width = height * room.ratio;
  const colors = [["#173f56", "#429da8"], ["#36334c", "#a88aaf"], ["#29423d", "#8fae89"], ["#433329", "#c5a07a"], ["#293b51", "#87a4cf"], ["#3d333d", "#bc8f9c"]];
  const [base, accent] = colors[(Number(room.id) - 1) % colors.length];
  const centerX = width / 2;
  const radius = Math.min(width, height) * 0.22;
  const numberSize = Math.min(width, height) * 0.24;
  const marks = [[20, 20, 1, 1], [width - 20, 20, -1, 1], [20, height - 20, 1, -1], [width - 20, height - 20, -1, -1]].map(([x, y, dx, dy]) => `<path d="M${x + dx * 44},${y}H${x}V${y + dy * 44}"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="${base}"/><stop offset="1" stop-color="#101a27"/></linearGradient><radialGradient id="light"><stop stop-color="${accent}" stop-opacity=".13"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient><pattern id="grid" width="75" height="75" patternUnits="userSpaceOnUse"><path d="M75 0H0V75" fill="none" stroke="#d8e9ff" stroke-opacity=".055" stroke-width="1"/></pattern></defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/><rect width="${width}" height="${height}" fill="url(#grid)"/>
    <ellipse cx="${centerX}" cy="450" rx="${width * 0.7}" ry="620" fill="url(#light)"/>
    <path d="M0 650 Q${width * 0.25} 410 ${width * 0.48} 620 T${width} 520 V900H0Z" fill="${accent}" opacity=".065"/>
    <circle cx="${centerX}" cy="420" r="${radius}" fill="none" stroke="${accent}" stroke-opacity=".34" stroke-width="1.5"/>
    <path d="M${centerX - radius - 20} 420H${centerX + radius + 20}M${centerX} ${420 - radius - 20}V${420 + radius + 20}" stroke="${accent}" stroke-opacity=".12"/>
    <text x="${centerX}" y="465" fill="#d6e5f1" opacity=".9" font-family="Bahnschrift,Arial,sans-serif" font-size="${numberSize}" font-weight="300" text-anchor="middle">${room.id}</text>
    <text x="${centerX}" y="${Math.min(800, 465 + numberSize * 0.43)}" fill="${accent}" font-family="Consolas,monospace" font-size="${Math.min(24, width / 20)}" letter-spacing="5" text-anchor="middle">SIGNAL ${room.id} / ${ratioLabel(room.ratio)}</text>
    <g fill="none" stroke="${accent}" stroke-width="2" stroke-opacity=".6">${marks}</g><rect x="1" y="1" width="${width - 2}" height="898" fill="none" stroke="${accent}" stroke-opacity=".18"/>
  </svg>`;
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  signalCache.set(key, source);
  return source;
};

const roomNodes = new Map();
const setBox = (node, rect) => Object.assign(node.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
const createRoom = (rect) => {
  const node = document.createElement("button");
  node.type = "button";
  node.dataset.roomId = rect.roomId;
  node.className = "absolute overflow-hidden bg-black text-left focus-visible:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#f3a77e]";
  node.innerHTML = '<img draggable="false" class="pointer-events-none block h-full w-full select-none object-contain object-center" alt=""><span data-status class="pointer-events-none absolute left-2 top-2 flex max-w-[calc(100%-16px)] items-center gap-1.5 rounded-full border border-white/10 bg-[#0d1520]/75 px-2 py-1 text-[10px] backdrop-blur-md"><i data-dot class="h-1 w-1 shrink-0 rounded-full bg-[#91b7cd]"></i><span data-name class="truncate"></span></span><span data-role class="pointer-events-none absolute right-2 top-2 rounded border border-[#f3a77e]/25 bg-[#18110d]/75 px-1.5 py-0.5 text-[9px] text-[#f3a77e]">主窗</span><span data-size class="pointer-events-none absolute bottom-2 left-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[9px] text-[#cbd9eb]"></span><span data-border class="pointer-events-none absolute inset-0 border border-[#a6bcd5]/30"></span>';
  const handleFocusRoom = () => {
    if (state.mainId === rect.roomId) return;
    stopCycle();
    state.mainId = rect.roomId;
    scheduleRender();
  };
  node.addEventListener("dblclick", handleFocusRoom);
  node.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); handleFocusRoom(); } });
  return node;
};

let plans = new Map();
let dimensions = { width: 0, height: 0 };
let generation = 0;
let renderTimer = null;
let cycleTimer = null;
let lastSceneKey = "";
let lastComparisonKey = "";
let recommendation = null;
let comparisonCount = LAYOUT_VARIANTS.length;

const sizeDifferenceLabel = (plan) => {
  const main = plan.rects.find((rect) => rect.role === "main");
  const secondary = plan.rects.find((rect) => rect.role === "secondary");
  if (!secondary) return "单房间";
  return `主/副面积 ${plan.metrics.mainToAverageVideo.toFixed(2)}× · 宽 ${(main.width / secondary.width).toFixed(2)}× / 高 ${(main.height / secondary.height).toFixed(2)}×`;
};

const measureViewport = () => {
  const rect = $("viewport").getBoundingClientRect();
  // clientWidth 会取整；去掉边框后保留真实小数尺寸。
  const width = Math.max(1, rect.width - 2 * $("viewport").clientLeft);
  const height = Math.max(1, rect.height - 2 * $("viewport").clientTop);
  if (state.resolution === "custom") return { width: state.customWidth, height: state.customHeight, hostWidth: width, hostHeight: height };
  if (state.resolution !== "auto") {
    const [customWidth, customHeight] = state.resolution.split("x").map(Number);
    return { width: customWidth, height: customHeight, hostWidth: width, hostHeight: height };
  }
  return { width, height, hostWidth: width, hostHeight: height };
};

const syncUrl = () => {
  const query = new URLSearchParams({ count: String(state.count), anchor: state.anchor, ratios: state.ratioMode, weight: String(state.weight), priority: state.priority, view: state.view, scheme: state.scheme, resolution: state.resolution });
  if (state.resolution === "custom") { query.set("w", String(state.customWidth)); query.set("h", String(state.customHeight)); }
  // file:// 预览也可直接运行，部分浏览器不允许该协议修改 history。
  try { history.replaceState(null, "", `${location.pathname}?${query}`); } catch { /* 预览功能不依赖 URL 持久化。 */ }
};

const syncControls = () => {
  for (const button of document.querySelectorAll("[data-count]")) button.setAttribute("aria-current", button.dataset.count === String(state.count) ? "true" : "false");
  $("ratio-mode").value = state.ratioMode;
  $("variant-select").value = state.scheme;
  $("priority-select").value = state.priority;
  $("selection-mode").textContent = state.scheme === "auto" ? "自动" : "手动";
  $("resolution-mode").value = state.resolution;
  $("custom-width").value = String(state.customWidth);
  $("custom-height").value = String(state.customHeight);
  $("custom-resolution").hidden = state.resolution !== "custom";
  $("main-weight").value = String(state.weight);
  $("weight-value").value = `${state.weight}×`;
  $("guides").checked = state.guides;
  $("view-toggle").setAttribute("aria-pressed", String(state.view === "overview"));
  $("view-label").textContent = state.view === "overview" ? "单场景预览" : "1–16 总览";
  $("overview").hidden = state.view !== "overview";
  $("comparison").hidden = state.view !== "compare";
  $("compare-toggle").setAttribute("aria-pressed", String(state.view === "compare"));
  $("compare-label").textContent = state.view === "compare" ? "返回画墙" : "多方案对比";
  $("wall").hidden = state.view !== "single";
  $("scene-title").textContent = state.view === "overview" ? "1–16 房间总览" : state.view === "compare" ? `${pad(state.count)} 房 · 等大排列对比` : `${pad(state.count)} 房间`;
  $("main-room").replaceChildren(...Array.from({ length: state.count }, (_, index) => {
    const option = new Option(`房间 ${pad(index + 1)}`, pad(index + 1));
    option.selected = option.value === state.mainId;
    return option;
  }));
  syncUrl();
};

const renderWall = (plan, hostWidth, hostHeight) => {
  const scale = Math.min(hostWidth / plan.width, hostHeight / plan.height);
  const actualWidth = plan.width * scale;
  const actualHeight = plan.height * scale;
  const wall = $("wall");
  setBox(wall, { x: (hostWidth - actualWidth) / 2, y: (hostHeight - actualHeight) / 2, width: plan.width, height: plan.height });
  wall.style.transformOrigin = "top left";
  wall.style.transform = `scale(${scale})`;
  // 固定分辨率缩略显示时，灰色外框只表示预览区；黑色仅表示目标画墙留白。
  $("viewport").classList.toggle("!bg-[#192130]", scale < 0.999);
  wall.classList.toggle("outline", scale < 0.999);
  wall.classList.toggle("outline-1", scale < 0.999);
  wall.classList.toggle("outline-[#43516a]", scale < 0.999);
  wall.dataset.count = String(plan.rects.length);
  wall.dataset.layoutShape = plan.layoutShape;
  wall.dataset.variant = plan.variant.id;
  wall.dataset.selectionMode = plan.selection.mode;
  wall.setAttribute("aria-label", `${plan.rects.length} 房间布局，${plan.positionLabel}`);
  const activeIds = new Set(plan.rects.map((rect) => rect.roomId));
  for (const [id, node] of roomNodes) if (!activeIds.has(id)) { node.remove(); roomNodes.delete(id); }
  for (const rect of plan.rects) {
    let node = roomNodes.get(rect.roomId);
    if (!node) { node = createRoom(rect); roomNodes.set(rect.roomId, node); wall.append(node); }
    setBox(node, rect);
    const main = rect.role === "main";
    node.dataset.role = rect.role;
    node.setAttribute("aria-label", `房间 ${rect.roomId}，${ratioLabel(rect.ratio)}，${main ? "当前主窗" : "双击或按回车设为主窗"}`);
    node.title = `房间 ${rect.roomId} · ${ratioLabel(rect.ratio)} · ${rect.width.toFixed(1)} × ${rect.height.toFixed(1)}`;
    const image = node.querySelector("img");
    const source = signalFor({ id: rect.roomId, ratio: rect.ratio });
    if (image.getAttribute("src") !== source) image.src = source;
    image.alt = `模拟信号 ${rect.roomId}，源比例 ${ratioLabel(rect.ratio)}，四角标记和完整圆形`;
    node.querySelector("[data-name]").textContent = `SIGNAL ${rect.roomId}`;
    node.querySelector("[data-role]").hidden = !main || rect.width < 150;
    node.querySelector("[data-status]").hidden = rect.width < 90 || rect.height < 60;
    node.querySelector("[data-dot]").classList.toggle("!bg-[#f3a77e]", main);
    node.querySelector("[data-size]").textContent = `${rect.width.toFixed(1)} × ${rect.height.toFixed(1)} · ${ratioLabel(rect.ratio)}`;
    node.querySelector("[data-size]").hidden = !state.guides || rect.width < 120 || rect.height < 45;
    node.querySelector("[data-border]").hidden = !state.guides;
    node.querySelector("[data-border]").classList.toggle("!border-[#f3a77e]/70", main);
  }
  $("scale-indicator").textContent = scale < 0.999 ? `缩放 ${(scale * 100).toFixed(0)}% · 灰色为预览区` : "1:1";
};

const thumbnailSvg = (plan) => {
  if (plan.status === "infeasible") return `<svg xmlns="http://www.w3.org/2000/svg" class="block w-full bg-black" viewBox="0 0 ${plan.width} ${plan.height}" aria-hidden="true"><text x="50%" y="50%" fill="#c78269" text-anchor="middle" dominant-baseline="middle" font-size="${Math.min(plan.width / 18, plan.height / 8)}">当前方案不可用</text></svg>`;
  const shapes = plan.rects.map((rect) => `<g><rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="#020304"/><image href="${signalFor({ id: rect.roomId, ratio: rect.ratio })}" x="${rect.video.x}" y="${rect.video.y}" width="${rect.video.width}" height="${rect.video.height}" preserveAspectRatio="xMidYMid meet"/>${rect.role === "main" ? `<rect x="${rect.x + 1}" y="${rect.y + 1}" width="${Math.max(0, rect.width - 2)}" height="${Math.max(0, rect.height - 2)}" fill="none" stroke="#f3a77e" stroke-width="${plan.width / 450}" opacity=".75"/>` : ""}</g>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" class="block w-full bg-black" viewBox="0 0 ${plan.width} ${plan.height}" aria-hidden="true">${shapes}</svg>`;
};

const renderOverview = () => {
  const fragment = document.createDocumentFragment();
  for (let count = 1; count <= 16; count++) {
    const plan = plans.get(count);
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.overviewCount = String(count);
    button.setAttribute("aria-label", `查看 ${count} 房间布局`);
    button.className = "group overflow-hidden rounded-md border border-white/10 bg-[#111722] text-left transition hover:border-[#f3a77e]/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f3a77e]";
    const feasible = plan.status !== "infeasible";
    button.dataset.feasible = String(feasible);
    button.dataset.layoutShape = plan.layoutShape ?? "infeasible";
    button.dataset.variant = plan.variant.id;
    button.innerHTML = `${thumbnailSvg(plan)}<span class="flex items-center justify-between gap-1 px-2.5 py-2"><span class="text-[11px] text-[#d8e1ee]"><b class="mr-1.5 font-mono text-[#f3a77e]">${pad(count)}</b>房间</span><span class="text-[9px] text-[#a2b0c3]">${feasible ? `${state.scheme === "auto" ? "自动 · " : ""}${plan.positionLabel}` : "方案不可用"}</span><span class="font-mono text-[10px] text-[#8192aa]">${feasible ? percent(plan.metrics.videoCoverage) : "不可行"}</span></span>${feasible ? `<span class="block border-t border-white/[0.06] px-2.5 py-1.5 font-mono text-[9px] text-[#a7b4c7]">${sizeDifferenceLabel(plan)}${plan.layoutShape === "equal-grid" ? " · 自动回退" : ""}</span>` : ""}`;
    button.addEventListener("click", () => { stopCycle(); state.count = count; state.view = "single"; if (Number(state.mainId) > count) state.mainId = "01"; scheduleRender(); });
    fragment.append(button);
  }
  $("overview-grid").replaceChildren(fragment);
};

const renderComparison = (items) => {
  const fragment = document.createDocumentFragment();
  for (const plan of items) {
    const metadata = plan.variant;
    const feasible = plan.status === "ready";
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.variant = metadata.id;
    button.dataset.feasible = String(feasible);
    const recommended = feasible && recommendation?.variant.id === metadata.id;
    button.dataset.recommended = String(recommended);
    button.disabled = !feasible;
    button.setAttribute("aria-label", `查看方案 ${metadata.letter}：${metadata.title}`);
    button.setAttribute("aria-pressed", String(state.scheme === metadata.id || state.scheme === "auto" && recommended));
    button.className = "overflow-hidden rounded-lg border border-white/10 bg-[#111722] text-left transition hover:border-[#f3a77e]/60 aria-pressed:border-[#f3a77e]/70 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f3a77e]";
    const excessive = state.priority !== "coverage" && feasible && plan.metrics.mainToAverageVideo > plan.selection.sizeRange?.max + 1e-7;
    const badge = metadata.id === "grid" ? "全等大 · 自动回退" : excessive ? "差距过大 · 手动可选" : recommended ? "自动推荐 · 小窗等大" : feasible ? "小窗全部等大" : "当前数量不可行";
    const main = feasible ? plan.rects.find((rect) => rect.role === "main") : null;
    const sizes = feasible ? `<span class="block border-t border-white/[0.06] px-3 py-2 font-mono text-[10px] leading-4 text-[#9aabc2]">主窗 ${main.width.toFixed(0)} × ${main.height.toFixed(0)}<span class="mt-1 block text-[#73859f]">副窗 ${plan.metrics.secondarySizes.map((size) => `${size.count} 窗 ${size.width.toFixed(0)} × ${size.height.toFixed(0)}`).join(" / ") || "无"}</span><span class="mt-1 block text-[#a7b4c7]">${sizeDifferenceLabel(plan)}</span></span>` : "";
    const numbers = feasible ? `<span class="grid grid-cols-3 gap-2 border-t border-white/[0.06] px-3 py-3"><span><span class="block text-[10px] text-[#7f8da3]">视频覆盖</span><b class="font-mono text-lg font-normal text-[#e2ebf8]">${percent(plan.metrics.videoCoverage)}</b></span><span><span class="block text-[10px] text-[#7f8da3]">外围留白</span><b class="font-mono text-sm font-normal text-[#c78269]">${percent(plan.metrics.outerMarginRatio)}</b></span><span><span class="block text-[10px] text-[#7f8da3]">主 / 副窗面积</span><b class="font-mono text-sm font-normal text-[#afbdd1]">${plan.metrics.mainToLargestVideo?.toFixed(2) ?? "—"}×</b></span></span>` : `<span class="block px-3 py-3 text-xs text-[#c78269]">${plan.reason}</span>`;
    button.innerHTML = `<span class="flex items-center justify-between gap-2 px-3 py-3"><span class="flex min-w-0 items-center gap-2"><b class="font-mono text-sm font-normal text-[#f3a77e]">${metadata.letter}</b><span class="truncate text-xs text-[#dce5f3]">${metadata.title}</span></span><span class="shrink-0 rounded border border-white/10 px-1.5 py-1 text-[9px] text-[#7fd6b0]">${badge}</span></span>${thumbnailSvg(plan)}${numbers}${sizes}<span class="block min-h-12 border-t border-white/[0.06] px-3 py-2 text-[10px] leading-4 text-[#8d9bb0]">${metadata.description}</span>`;
    button.addEventListener("click", () => { stopCycle(); state.scheme = metadata.id === "grid" ? "auto" : metadata.id; state.view = "single"; lastComparisonKey = ""; scheduleRender(); });
    fragment.append(button);
  }
  $("comparison-grid").replaceChildren(fragment);
  comparisonCount = items.length;
  $("comparison-availability").value = `${items.filter((item) => item.status === "ready").length} / ${items.length} 种结构可行`;
  for (const option of $("variant-select").options) option.disabled = option.value !== "auto" && items.find((item) => item.variant.id === option.value)?.status !== "ready";
  $("comparison-resolution").value = `${dimensions.width.toFixed(0)} × ${dimensions.height.toFixed(0)} · ${state.count} 房`;
};

const renderMetrics = (plan, elapsed) => {
  const metrics = plan.metrics;
  const main = plan.rects.find((rect) => rect.role === "main");
  $("metric-video").value = (metrics.videoCoverage * 100).toFixed(2);
  for (const [id, value] of [["box", metrics.boxCoverage], ["letterbox", metrics.letterboxRatio], ["empty", metrics.emptyRatio], ["gap", metrics.gapRatio]]) $(`metric-${id}`).value = percent(value);
  $("metric-outer").value = percent(metrics.outerMarginRatio);
  const marginLabel = { "left-right": "仅左右", "top-bottom": "仅上下", none: "无外围留白" }[metrics.marginAxis];
  $("metric-margin").value = marginLabel;
  $("metric-content").value = `${plan.bounds.width.toFixed(0)} × ${plan.bounds.height.toFixed(0)}`;
  $("metric-content-ratio").value = `${metrics.contentRatio.toFixed(4)}:1`;
  $("content-resolution").value = `拼接 ${plan.bounds.width.toFixed(0)} × ${plan.bounds.height.toFixed(0)}`;
  $("position-strategy").value = plan.positionLabel;
  $("constraint-badge").textContent = "所有方案 · 小窗全部等大";
  $("secondary-label").textContent = "等大小窗";
  $("secondary-heading").textContent = "副窗分布 · 全部等大";
  const limitNote = plan.layoutShape === "equal-grid" ? " 已按约定采用全部窗口等大的回退方案。" : metrics.prominenceLimited ? " 当前约束限制了主窗放大幅度。" : metrics.weightLimited ? " 等大小窗与完整矩形限制了主窗可选倍数，面积目标无法精确满足。" : "";
  const selectionReason = state.scheme === "auto" ? plan.selection.reason : `手动选择 ${plan.variant.letter} · ${plan.variant.title}。${recommendation ? `自动推荐 ${recommendation.variant.letter}，覆盖率 ${percent(recommendation.metrics.videoCoverage)}。` : ""}`;
  $("layout-note").textContent = `${selectionReason} ${plan.autoReason}${limitNote}`;
  const priorityLabel = state.priority === "compromise" ? "综合均衡 · 主窗适度放大" : state.priority === "balanced" ? "大小均匀" : "覆盖最全";
  $("layout-explanation").value = state.view === "overview" ? `${priorityLabel} · ${state.scheme === "auto" ? "各数量自动选优" : "使用手动排列"} · 小窗全部等大` : selectionReason;
  $("layout-explanation").title = $("layout-explanation").value;
  $("layout-explanation").title = $("layout-explanation").value;
  $("bar-video").style.width = percent(metrics.videoCoverage);
  $("bar-letterbox").style.width = percent(metrics.letterboxRatio);
  $("bar-empty").style.width = percent(metrics.outerMarginRatio);
  $("metric-main-size").value = `${main.width.toFixed(0)} × ${main.height.toFixed(0)}`;
  $("metric-main-share").value = `${percent(metrics.targetMainShare)} / ${percent(metrics.mainShare)}`;
  $("metric-dominance").value = metrics.mainToLargestVideo === null ? "单房间" : `${metrics.mainToLargestVideo.toFixed(2)}×`;
  const secondary = plan.rects.find((rect) => rect.role === "secondary");
  $("metric-linear").value = secondary ? `${(main.width / secondary.width).toFixed(2)}× / ${(main.height / secondary.height).toFixed(2)}×` : "单房间";
  $("metric-secondary-size").value = metrics.secondarySize ? `${metrics.secondarySize.width.toFixed(1)} × ${metrics.secondarySize.height.toFixed(1)}` : "无副窗";
  $("secondary-resolution").value = metrics.secondarySize ? `${metrics.secondarySize.width.toFixed(1)} × ${metrics.secondarySize.height.toFixed(1)}` : "";
  $("region-counts").innerHTML = [["left", "左侧"], ["right", "右侧"], ["bottom", "底部"]].map(([region, label]) => `<div class="rounded border border-white/[0.07] bg-white/[0.02] px-2 py-2 text-center"><span class="block font-mono text-lg text-[#c0d0e4]">${plan.rects.filter((rect) => rect.region === region).length}</span><span class="text-[10px] text-[#718097]">${label}</span></div>`).join("");
  $("compute-time").value = `${plan.candidateCount} 候选 · 16 场景 ${elapsed.toFixed(0)} ms`;
  $("footer-summary").value = `${state.view === "overview" ? "16 SCENES" : state.view === "compare" ? `${comparisonCount} VARIANTS` : `${pad(state.count)} ROOMS`} / ${state.scheme === "auto" ? "AUTO → " : "手动 "}${plan.variant.letter} · ${plan.positionLabel} / 外围 ${percent(metrics.outerMarginRatio)} · ${marginLabel}`;
};

const showError = (message) => {
  $("loading").hidden = true;
  $("error-state").hidden = false;
  $("error-title").textContent = "暂时无法生成预览";
  $("retry").hidden = false;
  $("error-message").textContent = message;
  $("audit-status").textContent = "布局计算未完成";
};

// 不可行是约束检查结果。清空上一场景的几何数据，总览仍保留其他可行场景。
const renderInfeasible = (plan) => {
  $("wall").replaceChildren();
  roomNodes.clear();
  $("wall").dataset.count = "0";
  $("wall").dataset.layoutShape = "infeasible";
  $("wall").dataset.variant = "infeasible";
  $("wall").dataset.selectionMode = state.scheme === "auto" ? "auto" : "manual";
  $("wall").setAttribute("aria-label", "当前源比例无法满足布局约束");
  $("viewport").classList.remove("!bg-[#192130]");
  $("wall").classList.remove("outline", "outline-1", "outline-[#43516a]");
  for (const node of document.querySelectorAll('output[id^="metric-"]')) node.value = "—";
  for (const id of ["bar-video", "bar-letterbox", "bar-empty"]) $(id).style.width = "0%";
  $("region-counts").replaceChildren();
  $("content-resolution").value = "无法生成完整矩形";
  $("secondary-resolution").value = "当前排列不可行";
  $("position-strategy").value = "方案不可用";
  $("scale-indicator").textContent = "";
  $("layout-note").textContent = plan.reason;
  $("layout-explanation").value = plan.reason;
  $("layout-explanation").title = plan.reason;
  $("constraint-badge").textContent = "所有方案 · 小窗全部等大";
  $("compute-time").value = "当前输入下没有可行方案";
  $("footer-summary").value = `${pad(state.count)} ROOMS / 当前方案不可用`;
  $("error-state").hidden = state.view !== "single";
  $("error-title").textContent = "当前输入不满足所选方案";
  $("error-message").textContent = plan.reason;
  $("retry").hidden = true;
};

let elapsed = 0;
const handleRender = async () => {
  const currentGeneration = ++generation;
  if (Number(state.mainId) > state.count) state.mainId = "01";
  syncControls();
  dimensions = measureViewport();
  $("window-resolution").value = `窗口 ${innerWidth} × ${innerHeight}`;
  $("wall-resolution").value = `${dimensions.width.toFixed(0)} × ${dimensions.height.toFixed(0)} px`;
  const key = `${dimensions.width}/${dimensions.height}/${state.anchor}/${state.ratioMode}/${state.weight}/${state.mainId}/${state.mainRatio}/${state.scheme}/${state.priority}`;
  $("error-state").hidden = true;
  try {
    if (key !== lastSceneKey || plans.size !== 16) {
      $("loading").hidden = false;
      $("audit-status").textContent = "正在检查 1–16 房";
      const started = performance.now();
      const nextPlans = new Map();
      for (let count = 1; count <= 16; count++) {
        if (currentGeneration !== generation) return;
        const mainRoomId = Number(state.mainId) <= count ? state.mainId : "01";
        const plan = calculateLayoutVariant({ ...dimensions, rooms: makeRooms(count, mainRoomId), mainRoomId, anchor: state.anchor, mainWeight: state.weight, priority: state.priority, previous: plans.get(count) }, state.scheme);
        if (plan?.status !== "infeasible") {
          const audit = auditLayoutVariant(plan, count);
          if (!audit.valid) throw new Error(`${count} 房：${audit.errors.join("；")}`);
        }
        nextPlans.set(count, plan);
        if (count % 4 === 0) {
          $("loading-label").textContent = `正在计算布局 ${count} / 16`;
          await new Promise(requestAnimationFrame);
        }
      }
      if (currentGeneration !== generation) return;
      plans = nextPlans;
      lastSceneKey = key;
      elapsed = performance.now() - started;
      renderOverview();
    }
    const comparisonKey = `${key}/${state.count}`;
    if (comparisonKey !== lastComparisonKey) {
      const comparisons = compareLayoutVariants({ ...dimensions, rooms: makeRooms(state.count), mainRoomId: state.mainId, mainWeight: state.weight, priority: state.priority, anchor: state.anchor });
      for (const item of comparisons) if (item.status === "ready") {
        const audit = auditLayoutVariant(item, state.count);
        if (!audit.valid) throw new Error(`${item.variant.title}：${audit.errors.join("；")}`);
      }
      const automatic = state.scheme === "auto" ? plans.get(state.count) : calculateLayoutVariant({ ...dimensions, rooms: makeRooms(state.count), mainRoomId: state.mainId, mainWeight: state.weight, priority: state.priority });
      recommendation = automatic?.status === "ready" ? automatic : null;
      renderComparison(comparisons);
      lastComparisonKey = comparisonKey;
    }
    const plan = plans.get(state.count);
    $("l-shape-demo").disabled = getLShapeCounts().length === 0;
    for (const button of document.querySelectorAll("#count-navigation [data-count]")) {
      const item = plans.get(Number(button.dataset.count));
      button.title = `${button.dataset.count} 房 · ${item.positionLabel ?? "方案不可用"}`;
    }
    const feasible = plan.status !== "infeasible";
    if (feasible) {
      renderWall(plan, dimensions.hostWidth, dimensions.hostHeight);
      renderMetrics(plan, elapsed);
    } else renderInfeasible(plan);
    const readyCount = [...plans.values()].filter((item) => item.status === "ready").length;
    $("audit-status").textContent = feasible || state.view === "overview"
      ? `${readyCount} / 16 当前排列可用 · 小窗全部等大 · 无内部黑边 · 完整矩形`
      : "当前方案不可用 · 可切换其他方案";
    $("audit-status").dataset.valid = String(feasible);
    $("loading").hidden = true;
  } catch (error) {
    if (currentGeneration !== generation) return;
    $("audit-status").dataset.valid = "false";
    showError(error instanceof Error ? error.message : "未知错误，请重新计算。");
  }
};

const scheduleRender = () => {
  generation++;
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => { void handleRender(); }, 40);
};
const stopCycle = () => {
  clearInterval(cycleTimer);
  cycleTimer = null;
  $("cycle").setAttribute("aria-pressed", "false");
  $("cycle-label").textContent = "轮播";
  $("cycle-icon").innerHTML = icon("play");
};

for (let count = 1; count <= 16; count++) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.count = String(count);
  button.setAttribute("aria-label", `${count} 个房间`);
  button.className = "h-7 w-7 shrink-0 rounded font-mono text-[11px] text-[#8a99af] transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f3a77e] aria-[current=true]:bg-[#f3a77e] aria-[current=true]:font-semibold aria-[current=true]:text-[#1a120c] md:w-8";
  button.textContent = pad(count);
  button.addEventListener("click", () => { stopCycle(); state.count = count; scheduleRender(); });
  $("count-navigation").append(button);
}
$("ratio-mode").addEventListener("change", (event) => { state.ratioMode = event.target.value; scheduleRender(); });
$("main-weight").addEventListener("input", (event) => { state.weight = Number(event.target.value); $("weight-value").value = `${state.weight}×`; scheduleRender(); });
$("main-room").addEventListener("change", (event) => { state.mainId = event.target.value; scheduleRender(); });
$("main-ratio").addEventListener("change", (event) => { state.mainRatio = event.target.value; scheduleRender(); });
$("guides").addEventListener("change", (event) => { state.guides = event.target.checked; scheduleRender(); });
$("view-toggle").addEventListener("click", () => { state.view = state.view === "overview" ? "single" : "overview"; scheduleRender(); });
$("compare-toggle").addEventListener("click", () => { stopCycle(); state.view = state.view === "compare" ? "single" : "compare"; scheduleRender(); });
$("variant-select").addEventListener("change", (event) => { stopCycle(); state.scheme = event.target.value; scheduleRender(); });
$("priority-select").addEventListener("change", (event) => { stopCycle(); state.priority = event.target.value; scheduleRender(); });
const getLShapeCounts = () => {
  const counts = [];
  for (let count = 1; count <= 16; count++) {
    const mainRoomId = Number(state.mainId) <= count ? state.mainId : "01";
    const plan = calculateLayoutVariant({ ...dimensions, rooms: makeRooms(count, mainRoomId), mainRoomId, mainWeight: state.weight, priority: state.priority }, "balanced");
    if (plan?.layoutShape === "l-shape") counts.push(count);
  }
  return counts.sort((a, b) => Math.abs(a - state.count) - Math.abs(b - state.count) || a - b);
};
const handleLShapeDemo = () => {
  const counts = getLShapeCounts();
  if (!counts.length) return;
  stopCycle();
  state.count = counts[0];
  state.scheme = "balanced";
  state.view = "single";
  scheduleRender();
};
$("l-shape-demo").addEventListener("click", handleLShapeDemo);
$("resolution-mode").addEventListener("change", (event) => {
  state.resolution = event.target.value;
  $("custom-resolution").hidden = state.resolution !== "custom";
  $("custom-error").textContent = "";
  scheduleRender();
});
$("custom-resolution").addEventListener("submit", (event) => {
  event.preventDefault();
  const width = Number($("custom-width").value);
  const height = Number($("custom-height").value);
  if (![width, height].every((value) => Number.isInteger(value) && value >= 32 && value <= 16384)) {
    $("custom-error").textContent = "宽高必须为 32–16384 的整数";
    return;
  }
  $("custom-error").textContent = "";
  state.customWidth = width;
  state.customHeight = height;
  scheduleRender();
});
$("cycle").addEventListener("click", () => {
  if (cycleTimer) { stopCycle(); return; }
  state.view = "single";
  state.count = 1;
  scheduleRender();
  $("cycle").setAttribute("aria-pressed", "true");
  $("cycle-icon").innerHTML = icon("pause");
  $("cycle-label").textContent = "暂停";
  cycleTimer = setInterval(() => { state.count = state.count % 16 + 1; scheduleRender(); }, 2200);
});
$("fullscreen").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if ($("viewport").requestFullscreen) await $("viewport").requestFullscreen();
    else { $("audit-status").textContent = "当前浏览器不支持全屏，可使用浏览器的最大化功能"; return; }
    scheduleRender();
  } catch { $("audit-status").textContent = "全屏未能开启，请使用浏览器最大化功能"; }
});
$("retry").addEventListener("click", () => { lastSceneKey = ""; scheduleRender(); });
document.addEventListener("keydown", (event) => {
  if (event.target.closest("input,select,textarea") || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  stopCycle();
  state.count = Math.max(1, Math.min(16, state.count + (event.key === "ArrowRight" ? 1 : -1)));
  scheduleRender();
});
document.addEventListener("visibilitychange", () => { if (document.hidden) stopCycle(); });
document.addEventListener("fullscreenchange", scheduleRender);
const resizeObserver = new ResizeObserver(scheduleRender);
resizeObserver.observe($("viewport"));
window.addEventListener("resize", scheduleRender);
window.addEventListener("pagehide", () => { stopCycle(); resizeObserver.disconnect(); clearTimeout(renderTimer); }, { once: true });
void handleRender();
