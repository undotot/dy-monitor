import { DEFAULT_RATIO, getRatios, summarizeDesign } from "./focus-replan-layout.js";
import * as originalDesigns from "./focus-replan-layout.js";
import * as uniformDesigns from "./focus-uniform-layout.js";
import * as shortSideDesigns from "./focus-short-side-layout.js";
import * as strictFillDesigns from "./focus-strict-fill-layout.js";
import * as percentNativeDesigns from "./focus-percent-native-layout.js";

const isStrictFill = document.body.dataset.layoutAlgorithm === "strict-fill";
const isUniform = isStrictFill || document.body.dataset.layoutAlgorithm === "uniform";
const isPercentNative = document.body.dataset.layoutAlgorithm === "percent-native";
const isShortSide = isPercentNative || document.body.dataset.layoutAlgorithm === "short-side";
const { DESIGNS, calculateDesign, validateDesign } = isPercentNative ? percentNativeDesigns : isStrictFill ? strictFillDesigns : isShortSide ? shortSideDesigns : isUniform ? uniformDesigns : originalDesigns;
const state = { mode: document.body.dataset.startMode || "P", count: isUniform || isShortSide ? 4 : 3, profile: isUniform || isShortSide ? "mixed" : "landscape", width: 1280, height: 720, mainRatio: DEFAULT_RATIO, gap: isStrictFill || isPercentNative ? 0 : 1, vacancies: false };
const profiles = { landscape: "全横屏", mixed: "横竖混合", varied: "多种比例", portrait: "全竖屏" };
const cache = new Map(), previousSignatures = new Map();
const element = (id) => document.getElementById(id);
const percent = (value) => `${(value * 100).toFixed(1)}%`;
const dimensions = (rectangle) => `${rectangle.width.toFixed(1)} × ${rectangle.height.toFixed(1)}`;
const ratioLabel = (ratio) => Math.abs(ratio - DEFAULT_RATIO) < 1e-6 ? "16:9" : Math.abs(ratio - 9 / 16) < 1e-6 ? "9:16" : Math.abs(ratio - 4 / 3) < 1e-6 ? "4:3" : ratio === 1 ? "1:1" : "21:9";
const buttonClasses = "min-w-9 border border-[#cbd0c3] px-2.5 py-1.5 font-mono text-sm hover:border-[#536258] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d26939] aria-pressed:border-[#d26939] aria-pressed:bg-[#d26939] aria-pressed:text-white";

const handleReadHash = () => {
  const params = new URLSearchParams(location.hash.slice(1));
  if (DESIGNS.some((design) => design.id === params.get("mode"))) state.mode = params.get("mode");
  if (Object.hasOwn(profiles, params.get("profile"))) state.profile = params.get("profile");
  for (const [key, minimum, maximum] of [["count", 1, 16], ["width", 100, 7680], ["height", 100, 4320], ["gap", 0, 8]]) {
    if (!params.has(key)) continue;
    const value = Number(params.get(key));
    if (Number.isFinite(value) && value >= minimum && value <= maximum && (key === "gap" || Number.isInteger(value))) state[key] = value;
  }
  const mainRatio = Number(params.get("mainRatio"));
  if ([DEFAULT_RATIO, 9 / 16, 4 / 3, 21 / 9].includes(mainRatio)) state.mainRatio = mainRatio;
  if (params.has("vacancies")) state.vacancies = params.get("vacancies") === "true";
};

const getPlan = (mode, count = state.count) => {
  const key = JSON.stringify([mode, count, state.profile, state.width, state.height, state.mainRatio, state.gap]);
  if (cache.has(key)) return cache.get(key);
  const stabilityKey = `${mode}:${count}:${state.profile}:${state.mainRatio}:${state.gap}`;
  const plan = calculateDesign({ ...state, mode, secondaryRatios: getRatios(count, state.profile), previous: previousSignatures.get(stabilityKey) });
  if (plan) previousSignatures.set(stabilityKey, plan.signature);
  if (cache.size > 400) cache.clear();
  cache.set(key, plan);
  return plan;
};

const drawBackground = (context, width, height) => {
  context.fillStyle = state.vacancies ? "#23342b" : "#000";
  context.fillRect(0, 0, width, height);
  if (!state.vacancies) return;
  context.strokeStyle = "#405541"; context.lineWidth = 1;
  context.beginPath();
  for (let x = -height; x < width; x += 16) { context.moveTo(x, height); context.lineTo(x + height, 0); }
  context.stroke();
};

// 容器先裁剪，再绘制按源比例缩放的模拟图；cover 超出部分真实不可见。
const drawVideo = (context, rectangle, video, index, ratio, main = false) => {
  const { x, y, width, height } = rectangle;
  const videoX = main ? x : x + (width - video.width) / 2;
  const videoY = y + (height - video.height) / 2;
  const colors = main ? ["#b8cbb5", "#506953"] : [["#72afb5", "#2d6168"], ["#d0a67a", "#775033"], ["#9aa8ce", "#455479"], ["#b5b28b", "#5f6340"]][index % 4];
  context.fillStyle = "#000"; context.fillRect(x, y, width, height);
  context.save(); context.beginPath(); context.rect(x, y, width, height); context.clip();
  const gradient = context.createLinearGradient(videoX, videoY, videoX + video.width, videoY + video.height);
  gradient.addColorStop(0, colors[0]); gradient.addColorStop(1, colors[1]);
  context.fillStyle = gradient; context.fillRect(videoX, videoY, video.width, video.height);
  context.fillStyle = "#ffffff12";
  context.beginPath(); context.moveTo(videoX, videoY + video.height * .78);
  context.lineTo(videoX + video.width * .32, videoY + video.height * .3); context.lineTo(videoX + video.width * .61, videoY + video.height * .81);
  context.lineTo(videoX + video.width, videoY + video.height * .55); context.lineTo(videoX + video.width, videoY + video.height); context.lineTo(videoX, videoY + video.height); context.fill();
  const short = Math.min(video.width, video.height);
  context.strokeStyle = "#ffffff38"; context.lineWidth = Math.max(.5, short * .006);
  context.beginPath(); context.arc(videoX + video.width * .74, videoY + video.height * .3, short * .14, 0, Math.PI * 2); context.stroke();
  const inset = short * .055, length = short * .075;
  context.strokeStyle = "#fff7d9bb"; context.lineWidth = Math.max(1, short * .007);
  for (const [cornerX, cornerY, directionX, directionY] of [[videoX + inset, videoY + inset, 1, 1], [videoX + video.width - inset, videoY + inset, -1, 1], [videoX + inset, videoY + video.height - inset, 1, -1], [videoX + video.width - inset, videoY + video.height - inset, -1, -1]]) {
    context.beginPath(); context.moveTo(cornerX, cornerY + directionY * length); context.lineTo(cornerX, cornerY); context.lineTo(cornerX + directionX * length, cornerY); context.stroke();
  }
  context.fillStyle = "#f7f5e9"; context.textAlign = "center"; context.textBaseline = "middle";
  context.font = `600 ${Math.max(12, short * (main ? .12 : .18))}px Georgia, serif`;
  context.fillText(main ? "主画面 01" : String(index + 2).padStart(2, "0"), videoX + video.width / 2, videoY + video.height * .52, Math.min(video.width, width) * .75);
  if (short > 45) {
    context.font = `${Math.max(9, short * .07)}px Consolas, monospace`;
    context.fillStyle = "#ffffffbc"; context.fillText(ratioLabel(ratio), videoX + video.width / 2, videoY + video.height * .68, Math.min(video.width, width) * .75);
  }
  context.restore();
  if (rectangle.fit === "cover" && rectangle.retained < .995 && Math.min(width, height) > 40) {
    context.fillStyle = "#982b23"; context.fillRect(x, y, Math.min(84, width), 23);
    context.fillStyle = "#fff"; context.font = "12px Consolas, monospace"; context.textAlign = "left"; context.textBaseline = "middle";
    context.fillText(`裁切 ${Math.round((1 - rectangle.retained) * 100)}%`, x + 5, y + 11, Math.min(75, width - 8));
  }
};

const drawPlan = (canvas, plan, count) => {
  const resolution = canvas.id ? 1280 : 640;
  const renderScale = Math.min(resolution / state.width, resolution * .5625 / state.height);
  canvas.width = Math.max(1, Math.round(state.width * renderScale)); canvas.height = Math.max(1, Math.round(state.height * renderScale));
  const context = canvas.getContext("2d");
  if (!plan) { context.fillStyle = "#23342b"; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = "#fff"; context.font = "18px sans-serif"; context.fillText("没有可行布局", 15, 35); canvas.setAttribute("aria-label", "没有可行布局"); return; }
  const scale = Math.min(canvas.width / state.width, canvas.height / state.height);
  context.save(); context.translate((canvas.width - state.width * scale) / 2, (canvas.height - state.height * scale) / 2); context.scale(scale, scale);
  drawBackground(context, state.width, state.height);
  drawVideo(context, plan.main, plan.mainVideo, 0, state.mainRatio, true);
  const ratios = getRatios(count, state.profile);
  for (const room of plan.placements) drawVideo(context, room, room.video, room.index, ratios[room.index]);
  context.restore();
  const summary = summarizeDesign(plan);
  canvas.setAttribute("aria-label", `${plan.mode}，${count} 格，主画面实际占屏 ${percent(summary.mainVideoRatio)}，主画面为最大小画面的 ${summary.mainProminence.toFixed(1)} 倍，小窗黑边 ${percent(summary.smallBlackRatio)}，平均原画保留 ${percent(summary.averageRetention)}，窗口覆盖 ${percent(summary.coveredRatio)}`);
};

const makeCanvas = () => {
  const canvas = document.createElement("canvas"); canvas.className = "block h-auto w-full bg-black"; canvas.setAttribute("role", "img"); return canvas;
};

const handleRenderDesigns = () => {
  const fragment = document.createDocumentFragment();
  for (const design of DESIGNS) {
    const button = document.createElement("button"); button.type = "button"; button.dataset.mode = design.id;
    button.setAttribute("aria-label", `预览方案 ${design.id} ${design.title}`); button.setAttribute("aria-pressed", String(state.mode === design.id));
    button.className = "flex min-w-0 flex-col border border-[#c6cebd] bg-[#fbfaf6] p-3 text-left hover:border-[#8b9f84] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d26939] aria-pressed:border-[#d26939] aria-pressed:bg-[#f8eee4] aria-pressed:ring-1 aria-pressed:ring-[#d26939]";
    button.innerHTML = `<p class="mb-1 text-sm font-semibold"><span class="mr-2 font-mono text-[#a4522f]">${design.id}</span>${design.title}</p><p class="mb-2 min-h-10 text-[10px] leading-5 text-[#74806e]">${design.rule}</p>`;
    const plan = getPlan(design.id), canvas = makeCanvas(); drawPlan(canvas, plan, state.count); button.append(canvas);
    const caption = document.createElement("p"); caption.className = "mt-2 text-[11px] leading-5 text-[#536258]";
    const summary = summarizeDesign(plan);
    caption.textContent = summary ? `主画面 ${percent(summary.mainVideoRatio)} · 原画保留 ${percent(summary.averageRetention)} · 窗口覆盖 ${percent(summary.coveredRatio)}` : "没有可行布局";
    if (isPercentNative && plan) caption.textContent += ` · 主窗黑边 ${percent(1 - plan.mainVideo.width * plan.mainVideo.height / (plan.main.width * plan.main.height))}`;
    const note = document.createElement("p"); note.className = "mt-1 text-[10px] leading-5 text-[#788b70]";
    const sizeNote = plan?.placements.length ? isUniform ? `所有小窗 ${dimensions(plan.placements[0])}px。 ` : isShortSide ? `共同短边 ${Math.min(plan.placements[0].width, plan.placements[0].height).toFixed(1)}px。 ` : "" : "";
    note.textContent = sizeNote + (design.note || (design.id === "P" ? "完整画面与严格拼满；主视频大小受几何限制。" : design.id === "Q" ? "主视频更大；保留部分窗外黑底。" : "主视频更大、规整铺满；可能裁切小窗四周。"));
    button.append(caption, note); button.addEventListener("click", () => { state.mode = design.id; handleRender(); }); fragment.append(button);
  }
  element("designs").replaceChildren(fragment);
};

const metricsMarkup = (plan) => {
  const metrics = summarizeDesign(plan);
  if (!metrics) return "没有可行布局";
  const firstSmall = plan.placements[0];
  const equalSmallSizes = firstSmall && plan.placements.every((room) => Math.abs(room.width - firstSmall.width) < 1e-7 && Math.abs(room.height - firstSmall.height) < 1e-7);
  const smallSize = !firstSmall ? "无小窗" : equalSmallSizes ? dimensions(firstSmall) : "宽高不一致";
  const shortSides = plan.placements.map((room) => Math.min(room.video.width, room.video.height));
  const sharedShortSide = !shortSides.length ? "无小窗" : Math.max(...shortSides) - Math.min(...shortSides) < 1e-7 ? shortSides[0].toFixed(1) : "短边不一致";
  const values = [["主画面实际占屏", percent(metrics.mainVideoRatio)], ["主画面 / 最大小画面", plan.placements.length ? `${metrics.mainProminence.toFixed(1)} 倍` : "单窗"],
    ["平均原画保留", percent(metrics.averageRetention)], ["小窗内黑边", percent(metrics.smallBlackRatio)], ["窗口覆盖 · 含黑底", percent(metrics.coveredRatio)],
    ["全部视频实际占屏", percent(metrics.fillRatio)], ["窗外背景 + 间隔", percent(metrics.backgroundRatio)], ["小窗最低原画保留", percent(metrics.minimumRetention)],
    ["主视频实际尺寸 / px", dimensions(plan.mainVideo)], ["主窗容器 / px", dimensions(plan.main)], isShortSide ? ["统一小视频短边 / px", sharedShortSide] : isUniform ? ["统一小窗尺寸 / px", smallSize] : ["最短小视频边 / px", metrics.minimumShort.toFixed(1)], ["小窗分布", `右 ${metrics.rightCount} / 下 ${metrics.bottomCount}`]];
  if (isPercentNative) values.push(["主窗内部黑边", percent(1 - plan.mainVideo.width * plan.mainVideo.height / (plan.main.width * plan.main.height))], ["主窗宽 / 墙宽", percent(plan.main.width / plan.width)], ["主窗高 / 墙高", percent(plan.main.height / plan.height)]);
  return values.map(([label, value], index) => `<div class="border-t border-[#e3e5dc] pt-2"><dt class="text-[10px] leading-5 text-[#74806e]">${label}</dt><dd class="mt-0.5 font-mono ${index < 3 ? "text-lg text-[#355d48]" : "text-[11px] text-[#40543c]"}">${value}</dd></div>`).join("");
};

const handleRenderComparison = () => {
  const design = DESIGNS.find((item) => item.id === state.mode), current = getPlan("current"), after = getPlan(state.mode);
  element("comparison-title").textContent = `${design.id} / ${design.title} · 与当前算法对照`;
  element("selected").textContent = `新方案 ${design.id} · ${design.title}`;
  element("condition").textContent = `${state.count} 格 · ${state.width}×${state.height} · ${profiles[state.profile]}${state.gap !== 1 ? ` · 当前 1px / 新版 ${state.gap}px` : ""}`;
  drawPlan(element("before"), current, state.count); drawPlan(element("after"), after, state.count);
  element("before-metrics").innerHTML = metricsMarkup(current); element("after-metrics").innerHTML = metricsMarkup(after);
  const summary = summarizeDesign(after);
  element("geometry-note").textContent = `${design.description}${summary ? ` 当前主画面实际 ${dimensions(after.mainVideo)}px，${summary.rightCount && summary.bottomCount ? "小窗在右侧与底部" : summary.rightCount ? "小窗在右侧" : summary.bottomCount ? "小窗在底部" : "单窗整面显示"}。` : ""}`;
  const threeWide = state.count === 3 && state.profile === "landscape" && Math.abs(state.width / state.height - DEFAULT_RATIO) < 1e-6 && state.mainRatio === DEFAULT_RATIO;
  element("boundary-note").textContent = isShortSide ? `当前有效要求：只统一短边，完整原画 100%，不裁切、不拉伸、无小窗黑边。${after?.placements.length ? ` 所有小窗短边 ${Math.min(after.placements[0].width, after.placements[0].height).toFixed(1)}px；长边按源比例变化。` : ""}尾行不单独放大；剩余主界面背景如实统计。` : isUniform ? `本页将同宽同高作为硬约束，右侧与底部的小窗共用尺寸；尾行不放大。${after?.placements.length ? ` 当前统一尺寸 ${dimensions(after.placements[0])}px。` : ""}横竖比例不同的小视频采用等比裁切，主画面完整显示。${state.count === 4 ? "4 格若按同尺寸完整 L 形铺满，主窗只能与小窗等大；U/W 采用单侧条带以保留大主画面。" : ""}` : threeWide ? "3 格全横屏的取舍：完整小窗 + 三个矩形严格铺满，会让主画面实际大小接近小窗。P 接受这个限制；Q 用部分黑底换取大主画面；R 用等比裁切换取大主画面和铺满。" : after?.fallback ? "当前条件不存在满足约束的原比例贴边候选；P 使用完整画面兜底，窗外背景如实统计。" : "画面放大按实际主视频面积计算。主容器的黑边和窗外黑底都不能当作视频画面。";
  if (isStrictFill) element("boundary-note").textContent = `严格铺满：默认 0px 间隔，窗口覆盖 100%，没有窗外空位；主窗位于左上。${after?.placements.length ? ` 所有小窗同为 ${dimensions(after.placements[0])}px。` : ""}小视频等比裁切，无拉伸、无黑边；主视频完整显示，允许窗内黑边。设置间隔后，窗口与指定分隔线共同覆盖整墙。`;
  if (isPercentNative && after) {
    element("boundary-note").textContent += " 主窗黑边与窗外空位分别统计。百分比宽高分别以墙面宽高为基准；窗口比例变化时重新求解。";
    const table = element("percent-geometry");
    if (table) table.innerHTML = [after.percentages.main, ...after.percentages.placements].map((rectangle, index) => `<tr><td class="p-2">${index ? `小窗 ${index + 1}` : "主窗"}</td>${[rectangle.x, rectangle.y, rectangle.width, rectangle.height].map((value) => `<td class="p-2">${value.toFixed(3)}%</td>`).join("")}</tr>`).join("");
  }
};

const handleRenderAtlas = () => {
  const fragment = document.createDocumentFragment();
  let failures = 0;
  for (let count = 1; count <= 16; count++) {
    const plan = getPlan(state.mode, count), current = getPlan("current", count), problems = validateDesign(plan, getRatios(count, state.profile));
    failures += problems.length;
    const button = document.createElement("button"); button.type = "button"; button.setAttribute("aria-label", `查看 ${count} 格对照`); button.setAttribute("aria-pressed", String(count === state.count));
    button.className = "min-w-0 border border-[#c7cfbf] bg-[#fbfaf6] p-3 text-left hover:border-[#829b7c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d26939] aria-pressed:border-[#d26939] aria-pressed:ring-1 aria-pressed:ring-[#d26939]";
    const summary = summarizeDesign(plan);
    button.innerHTML = `<div class="mb-2 flex justify-between gap-2 text-xs"><span class="font-semibold"><span class="mr-2 font-mono text-[#a45c38]">${String(count).padStart(2, "0")}</span>${count} 格</span><span class="font-mono text-[#788b70]">主画面 ${summary ? percent(summary.mainVideoRatio) : "—"}</span></div>`;
    const pair = document.createElement("div"); pair.className = "grid grid-cols-2 gap-2";
    for (const [label, comparedPlan] of [["当前算法", current], [`新方案 ${state.mode}`, plan]]) {
      const figure = document.createElement("div"), caption = document.createElement("p"); caption.className = "mb-1 text-[10px] text-[#788b70]"; caption.textContent = label;
      const canvas = makeCanvas(); drawPlan(canvas, comparedPlan, count); figure.append(caption, canvas); pair.append(figure);
    }
    const caption = document.createElement("p"); caption.className = "mt-2 font-mono text-[10px] leading-5 text-[#7d8a74]";
    caption.textContent = problems.length ? problems.join(" / ") : `${summary.mainProminence.toFixed(1)} 倍 · 原画保留 ${percent(summary.averageRetention)} · 窗口覆盖 ${percent(summary.coveredRatio)}`;
    button.append(pair, caption); button.addEventListener("click", () => { state.count = count; handleRender(); element("comparison").scrollIntoView({ behavior: "instant", block: "start" }); }); fragment.append(button);
  }
  element("atlas").replaceChildren(fragment);
  element("validation").textContent = failures ? `${failures} 项几何检查失败` : isShortSide ? "1–16 格 · 短边一致 / 完整原画 / 无重叠检查通过" : isUniform ? "1–16 格 · 同宽同高 / 比例 / 无重叠检查通过" : "1–16 格 · 比例 / 边界 / 无重叠检查通过";
  if (isStrictFill && !failures) element("validation").textContent = "1–16 格 · 严格覆盖 / 同宽同高 / 左上主窗检查通过";
};

const handleSyncControls = () => {
  for (const button of element("counts").children) button.setAttribute("aria-pressed", String(Number(button.dataset.count) === state.count));
  element("profile").value = state.profile; element("main-ratio").value = String(state.mainRatio);
  const size = `${state.width},${state.height}`; element("size").value = ["1280,720", "1920,1080", "1024,768", "375,600"].includes(size) ? size : "custom";
  element("width").value = state.width; element("height").value = state.height; element("gap").value = state.gap;
  element("vacancies").checked = state.vacancies; element("form-message").textContent = "";
};

const handleRender = () => {
  const started = performance.now();
  try {
    handleSyncControls(); handleRenderDesigns(); handleRenderComparison(); handleRenderAtlas();
    history.replaceState(null, "", `#${new URLSearchParams(Object.entries(state).map(([key, value]) => [key, String(value)]))}`);
    element("render-status").textContent = `预览就绪 · ${Math.round(performance.now() - started)}ms · 本地计算`;
  } catch (error) {
    console.error(error); element("render-status").textContent = "预览计算失败，请恢复预设条件或刷新。";
  }
};

const handleSubmit = (event) => {
  event.preventDefault();
  const width = Number(element("width").value), height = Number(element("height").value), gap = Number(element("gap").value);
  if (!Number.isInteger(width) || width < 100 || width > 7680 || !Number.isInteger(height) || height < 100 || height > 4320 || !Number.isFinite(gap) || gap < 0 || gap > 8 || !element("gap").value.trim()) {
    element("form-message").textContent = "宽度为 100–7680 的整数，高度为 100–4320 的整数，间隔为 0–8。"; return;
  }
  const button = element("apply"); button.disabled = true; button.textContent = "计算中…";
  requestAnimationFrame(() => {
    Object.assign(state, { width, height, gap }); handleRender();
    button.disabled = false; button.textContent = "应用"; element("form-message").textContent = `已应用 ${width}×${height}，间隔 ${gap}px。`;
  });
};

for (let count = 1; count <= 16; count++) {
  const button = document.createElement("button"); button.type = "button"; button.className = buttonClasses; button.textContent = String(count); button.dataset.count = String(count); button.setAttribute("aria-label", `${count} 格`);
  button.addEventListener("click", () => { state.count = count; handleRender(); }); element("counts").append(button);
}
element("profile").addEventListener("change", (event) => { state.profile = event.target.value; handleRender(); });
element("main-ratio").addEventListener("change", (event) => { state.mainRatio = Number(event.target.value); handleRender(); });
element("size").addEventListener("change", (event) => {
  if (event.target.value === "custom") { element("custom-settings").open = true; element("width").focus(); return; }
  [state.width, state.height] = event.target.value.split(",").map(Number); handleRender();
});
element("vacancies").addEventListener("change", (event) => { state.vacancies = event.target.checked; handleRender(); });
element("custom-form").addEventListener("submit", handleSubmit);
window.addEventListener("hashchange", () => { handleReadHash(); handleRender(); });
handleReadHash(); handleRender();
