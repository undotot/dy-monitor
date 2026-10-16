import { calculateResearchLayouts } from "./layout-research-engine.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const numberFrom = (value, fallback, min, max) => value !== null && Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
const resolutions = ["auto", "2246x994", "1280x720", "800x600", "390x844", "custom"];
const state = {
  count: Math.round(numberFrom(params.get("count"), 12, 1, 16)),
  ratio: params.get("ratios") === "portrait" ? "portrait" : "landscape",
  resolution: resolutions.includes(params.get("resolution")) ? params.get("resolution") : "auto",
  weight: numberFrom(params.get("weight"), 4, 2, 10), mainId: String(Math.round(numberFrom(params.get("main"), 1, 1, 16))).padStart(2, "0"),
  scope: ["moderate", "frontier", "all"].includes(params.get("scope")) ? params.get("scope") : "moderate",
  view: params.get("view") === "single" ? "single" : "compare", selectedId: params.get("candidate"),
  width: Math.round(numberFrom(params.get("w"), 1920, 32, 16384)), height: Math.round(numberFrom(params.get("h"), 1080, 32, 16384)),
};
let scene = null;
let dimensions = null;
let lastKey = "";
let timer = null;
let generation = 0;
const pad = (value) => String(value).padStart(2, "0");
const percent = (value) => `${(value * 100).toFixed(2)}%`;
const size = (rect) => `${rect.width.toFixed(1)} × ${rect.height.toFixed(1)}`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// 所有几何来自共享引擎；SVG 只作整体等比显示，不对单个画面独立拉伸。
const signalSvg = (plan, label) => {
  const colors = ["#214b60", "#3c3c55", "#2b4945", "#4b3b32", "#30455f", "#463747"];
  const tiles = plan.rects.map((rect) => {
    const short = Math.min(rect.width, rect.height);
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const main = rect.role === "main";
    const margin = short * 0.035;
    const mark = short * 0.06;
    const corners = [[rect.x + margin, rect.y + margin, 1, 1], [rect.x + rect.width - margin, rect.y + margin, -1, 1], [rect.x + margin, rect.y + rect.height - margin, 1, -1], [rect.x + rect.width - margin, rect.y + rect.height - margin, -1, -1]]
      .map(([x, y, dx, dy]) => `<path d="M${x + dx * mark} ${y}H${x}V${y + dy * mark}"/>`).join("");
    return `<g><rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="${main ? "#23546b" : colors[(Number(rect.roomId) - 1) % colors.length]}"/><path d="M${rect.x} ${rect.y + rect.height * 0.78}Q${cx} ${rect.y + rect.height * 0.42} ${rect.x + rect.width} ${rect.y + rect.height * 0.75}V${rect.y + rect.height}H${rect.x}Z" fill="#b6d8eb" opacity=".035"/><circle cx="${cx}" cy="${cy}" r="${short * 0.22}" fill="none" stroke="#adcfe2" stroke-opacity=".18" stroke-width="${short / 500}"/><text x="${cx}" y="${cy + short * 0.075}" text-anchor="middle" fill="#d8e9f2" font-family="Bahnschrift,Arial,sans-serif" font-size="${short * 0.25}" font-weight="300">${escapeHtml(rect.roomId)}</text><text x="${cx}" y="${cy + short * 0.32}" text-anchor="middle" fill="#a8c4d7" opacity=".7" font-family="Consolas,monospace" font-size="${short * 0.037}" letter-spacing="${short * 0.005}">${main ? "FOCUS" : "SIGNAL"} / ${state.ratio === "portrait" ? "9:16" : "16:9"}</text><g fill="none" stroke="${main ? "#f3a77e" : "#a6c2d5"}" stroke-opacity=".45" stroke-width="${short / 180}">${corners}</g><rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="none" stroke="${main ? "#f3a77e" : "#9bb8cc"}" stroke-opacity="${main ? ".8" : ".18"}" stroke-width="${short / 220}"/></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${plan.width} ${plan.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(label)}" class="block w-full bg-black">${tiles}</svg>`;
};

const measure = () => {
  const rect = $("research-viewport").getBoundingClientRect();
  const actual = { width: Math.max(1, rect.width - 2 * $("research-viewport").clientLeft), height: Math.max(1, rect.height - 2 * $("research-viewport").clientTop) };
  if (state.resolution === "auto") return actual;
  if (state.resolution === "custom") return { width: state.width, height: state.height };
  const [width, height] = state.resolution.split("x").map(Number);
  return { width, height };
};

const syncUrl = () => {
  const query = new URLSearchParams({ count: String(state.count), ratios: state.ratio, resolution: state.resolution, weight: String(state.weight), main: state.mainId, scope: state.scope, view: state.view });
  if (state.view === "single" && state.selectedId) query.set("candidate", state.selectedId);
  if (state.resolution === "custom") { query.set("w", String(state.width)); query.set("h", String(state.height)); }
  try { history.replaceState(null, "", `${location.pathname}?${query}`); } catch { /* 离线运行不依赖 history。 */ }
};

const syncControls = () => {
  $("research-resolution").value = state.resolution;
  $("research-ratio").value = state.ratio;
  $("research-weight").value = String(state.weight);
  $("research-weight-value").value = `${state.weight}×`;
  $("research-custom").hidden = state.resolution !== "custom";
  $("research-width").value = String(state.width);
  $("research-height").value = String(state.height);
  $("research-back").hidden = state.view !== "single";
  $("research-filters").hidden = state.view === "single";
  for (const button of document.querySelectorAll("[data-count]")) button.setAttribute("aria-current", String(Number(button.dataset.count) === state.count));
  for (const button of document.querySelectorAll("[data-scope]")) button.setAttribute("aria-pressed", String(button.dataset.scope === state.scope));
  $("research-main").replaceChildren(...Array.from({ length: state.count }, (_, index) => new Option(`房间 ${pad(index + 1)}`, pad(index + 1))));
  $("research-main").value = state.mainId;
};

const tagFor = (plan) => {
  if (plan.layoutShape === "equal-grid") return "没有适中解 · 等大回退";
  if (!plan.research.moderate) return "面积差较大 · 对照";
  if (plan.research.sizePreferred && plan.research.coveragePreferred) return "大小与覆盖兼顾";
  if (plan.research.sizePreferred) return "副窗优先";
  if (plan.research.coveragePreferred) return "覆盖优先";
  return plan.research.frontier ? "有效取舍" : "其他画墙比例备选";
};

const renderGallery = (plans) => {
  const fragment = document.createDocumentFragment();
  for (const plan of plans) {
    const index = scene.candidates.indexOf(plan) + 1;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.candidateId = plan.research.id;
    button.dataset.mainArea = String(Math.round((plan.research.area ?? 1) * 1e6) / 1e6);
    button.dataset.columns = String(plan.units.columns);
    button.dataset.rows = String(plan.units.rows);
    button.dataset.layoutShape = plan.layoutShape;
    button.setAttribute("aria-label", `查看调研 ${pad(index)}：${plan.research.title}，主窗 ${plan.research.span}`);
    button.className = "group overflow-hidden rounded-lg border border-white/10 bg-[#111722] text-left transition hover:border-[#f3a77e]/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f3a77e]";
    const main = plan.rects.find((rect) => rect.role === "main");
    const small = plan.rects.find((rect) => rect.role === "secondary");
    button.innerHTML = `<span class="flex items-start justify-between gap-2 px-3 py-3"><span><span class="block text-[10px] text-[#8495ad]">调研 ${pad(index)} · 主窗 ${plan.research.span}</span><span class="mt-1 block text-xs text-[#dce5f3]">${plan.research.title}</span></span><span class="shrink-0 rounded border border-[#f3a77e]/20 bg-[#f3a77e]/5 px-1.5 py-1 text-[9px] text-[#f3a77e]">${tagFor(plan)}</span></span><span class="block bg-black">${signalSvg(plan, `${state.count} 房 ${plan.research.title}`)}</span><span class="grid grid-cols-3 gap-2 border-t border-white/[0.06] px-3 py-3"><span><span class="block text-[10px] text-[#7f8da3]">主 / 副面积</span><b class="font-mono text-lg font-normal text-[#f3a77e]">${plan.research.area === null ? "单窗" : `${plan.research.area.toFixed(2)}×`}</b></span><span><span class="block text-[10px] text-[#7f8da3]">视频覆盖</span><b class="font-mono text-lg font-normal">${percent(plan.metrics.videoCoverage)}</b></span><span><span class="block text-[10px] text-[#7f8da3]">宽 / 高倍数</span><b class="font-mono text-xs font-normal text-[#afbdd1]">${small ? `${(main.width / small.width).toFixed(1)} / ${(main.height / small.height).toFixed(1)}` : "—"}</b></span></span><span class="block border-t border-white/[0.06] px-3 py-2 text-[10px] leading-5 text-[#93a5be]">${plan.research.regions}<span class="block font-mono">主 ${size(main)} · 副 ${small ? size(small) : "无"}</span></span>`;
    button.addEventListener("click", () => { state.selectedId = plan.research.id; state.view = "single"; scheduleRender(); });
    fragment.append(button);
  }
  $("research-grid").replaceChildren(fragment);
};

const renderDetail = (plan) => {
  const main = plan.rects.find((rect) => rect.role === "main");
  const small = plan.rects.find((rect) => rect.role === "secondary");
  $("research-detail-stats").innerHTML = `<span class="text-[#f3a77e]">${tagFor(plan)}</span><span>主窗 ${plan.research.span} · 面积 ${plan.research.area?.toFixed(2) ?? "—"}×</span><span>覆盖 ${percent(plan.metrics.videoCoverage)}</span><span>外围留白 ${percent(plan.metrics.outerMarginRatio)}</span><span>${plan.research.regions}</span><span>主 ${size(main)} · 副 ${small ? size(small) : "无"}</span>`;
  const host = $("research-detail-wall");
  const scale = Math.min(host.clientWidth / plan.width, host.clientHeight / plan.height);
  const width = plan.width * scale;
  const height = plan.height * scale;
  host.innerHTML = `<div data-detail-candidate="${escapeHtml(plan.research.id)}" data-count="${state.count}" class="absolute bg-black" style="left:${(host.clientWidth - width) / 2}px;top:${(host.clientHeight - height) / 2}px;width:${width}px;height:${height}px">${signalSvg(plan, `${state.count} 房 ${plan.research.title}，副窗全部等大`)}</div>`;
  host.dataset.mainArea = String(Math.round((plan.research.area ?? 1) * 1e6) / 1e6);
  $("research-title").textContent = `${pad(state.count)} 房 · ${plan.research.title} · 主窗 ${plan.research.span}`;
};

const handleRender = async () => {
  const current = ++generation;
  if (Number(state.mainId) > state.count) state.mainId = "01";
  syncControls();
  $("research-loading").hidden = false;
  $("research-empty").hidden = true;
  await new Promise(requestAnimationFrame);
  if (current !== generation) return;
  try {
    dimensions = measure();
    $("research-dimensions").value = `${dimensions.width.toFixed(0)} × ${dimensions.height.toFixed(0)} px`;
    const key = `${dimensions.width}/${dimensions.height}/${state.count}/${state.ratio}/${state.mainId}/${state.weight}`;
    if (key !== lastKey) {
      const ratio = state.ratio === "portrait" ? 9 / 16 : 16 / 9;
      scene = calculateResearchLayouts({ ...dimensions, rooms: Array.from({ length: state.count }, (_, index) => ({ id: pad(index + 1), ratio })), mainRoomId: state.mainId, mainWeight: state.weight });
      if (!scene || scene.status !== "ready") throw new Error(scene?.reason ?? "当前输入无法生成排列。");
      lastKey = key;
    }
    const plans = scene.candidates.filter((plan) => {
      if (state.scope === "all") return true;
      if (state.scope === "frontier") return plan.research.frontier;
      return plan.research.moderate;
    });
    const selected = scene.candidates.find((plan) => plan.research.id === state.selectedId);
    // 数量或比例改变后，过期选择回到候选列表，避免展示另一个数量的旧坐标。
    if (state.view === "single" && !selected) { state.view = "compare"; state.selectedId = null; }
    $("research-gallery").hidden = state.view === "single";
    $("research-detail").hidden = state.view !== "single";
    $("research-back").hidden = state.view !== "single";
    $("research-filters").hidden = state.view === "single";
    $("research-title").textContent = `${pad(state.count)} 房 · ${state.scope === "all" ? "全部有效行列组合" : state.scope === "frontier" ? "覆盖率与大小的有效取舍" : "适中主窗的多种排列"}`;
    $("research-summary").textContent = `${scene.moderateCount} 个适中候选 / ${scene.candidates.length} 个全部候选 · 优先面积 ${scene.range.min.toFixed(1)}～${scene.range.max.toFixed(1)}× · 各方案副窗始终等大`;
    renderGallery(plans);
    if (state.view === "single") renderDetail(selected);
    $("research-hint").textContent = state.view === "single" ? "灰色仅表示预览区，黑色为目标画墙外围留白 · 返回可比较其他行列组合" : "点击卡片看大图 · 相同主窗跨度也可能有不同的侧栏列数和底栏行数";
    $("research-audit").textContent = `${scene.candidates.length} / ${scene.candidates.length} 几何检查通过 · 无内部空槽 · 保持源比例`;
    $("research-audit").dataset.valid = "true";
    $("research-viewport").dataset.count = String(state.count);
    if (!plans.length && state.view === "compare") { $("research-empty").hidden = false; $("research-empty").querySelector("p").textContent = "当前筛选没有候选，可切换到全部候选。"; }
    syncUrl();
  } catch (error) {
    $("research-empty").hidden = false;
    $("research-empty").querySelector("p").textContent = error instanceof Error ? error.message : "生成预览失败，请调整输入。";
    $("research-audit").textContent = "当前预览未完成";
    $("research-audit").dataset.valid = "false";
    $("research-grid").replaceChildren();
    $("research-detail-wall").replaceChildren();
  } finally { if (current === generation) $("research-loading").hidden = true; }
};

const scheduleRender = () => { generation++; clearTimeout(timer); timer = setTimeout(() => { void handleRender(); }, 40); };
const resetSelection = () => { state.view = "compare"; state.selectedId = null; };
for (let count = 1; count <= 16; count++) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.count = String(count);
  button.textContent = pad(count);
  button.setAttribute("aria-label", `调研 ${count} 个房间`);
  button.className = "h-7 w-7 shrink-0 rounded font-mono text-[11px] text-[#8a99af] hover:bg-white/5 aria-[current=true]:bg-[#f3a77e] aria-[current=true]:text-[#1a120c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f3a77e] md:w-8";
  button.addEventListener("click", () => { state.count = count; resetSelection(); scheduleRender(); });
  $("research-counts").append(button);
}
for (const button of document.querySelectorAll("[data-scope]")) button.addEventListener("click", () => { state.scope = button.dataset.scope; resetSelection(); scheduleRender(); });
$("research-resolution").addEventListener("change", (event) => { state.resolution = event.target.value; $("research-custom-error").textContent = ""; scheduleRender(); });
$("research-ratio").addEventListener("change", (event) => { state.ratio = event.target.value; resetSelection(); scheduleRender(); });
$("research-main").addEventListener("change", (event) => { state.mainId = event.target.value; scheduleRender(); });
$("research-weight").addEventListener("input", (event) => { state.weight = Number(event.target.value); scheduleRender(); });
$("research-back").addEventListener("click", () => { resetSelection(); scheduleRender(); });
$("research-example").addEventListener("click", () => { state.count = 12; state.ratio = "landscape"; state.resolution = "2246x994"; state.weight = 4; state.mainId = "01"; state.scope = "moderate"; resetSelection(); scheduleRender(); });
$("research-custom").addEventListener("submit", (event) => {
  event.preventDefault();
  const width = Number($("research-width").value);
  const height = Number($("research-height").value);
  if (![width, height].every((value) => Number.isInteger(value) && value >= 32 && value <= 16384)) { $("research-custom-error").textContent = "宽高必须为 32～16384 的整数"; return; }
  state.width = width; state.height = height;
  $("research-custom-error").textContent = "";
  scheduleRender();
});
$("research-fullscreen").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if ($("research-viewport").requestFullscreen) await $("research-viewport").requestFullscreen();
    else { $("research-hint").textContent = "当前浏览器不支持全屏，请使用窗口最大化。"; return; }
    scheduleRender();
  } catch { $("research-hint").textContent = "全屏未能开启，请使用窗口最大化。"; }
});
document.addEventListener("keydown", (event) => {
  if (event.target.closest("input,select,textarea") || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  state.count = Math.min(16, Math.max(1, state.count + (event.key === "ArrowRight" ? 1 : -1)));
  resetSelection(); scheduleRender();
});
const observer = new ResizeObserver(scheduleRender);
observer.observe($("research-viewport"));
window.addEventListener("resize", scheduleRender);
document.addEventListener("fullscreenchange", scheduleRender);
window.addEventListener("pagehide", () => { observer.disconnect(); clearTimeout(timer); }, { once: true });
void handleRender();
