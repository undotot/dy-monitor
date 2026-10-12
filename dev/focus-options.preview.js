import { MODES, DEFAULT_RATIO, calculatePreviewLayout, getRatios, summarizePlan, validatePlan } from "./focus-options-layout.js";

const profileLabels = { landscape: "全横屏 16:9", mixed: "横竖混合", varied: "多种比例", portrait: "全竖屏 9:16" };
const state = { mode: document.body.dataset.startMode || "D", count: 4, profile: "mixed", width: 1280, height: 720, mainRatio: DEFAULT_RATIO, gap: 1 };
const cache = new Map();
const previousSignatures = new Map();
const percent = (value) => `${(value * 100).toFixed(1)}%`;
const sizeLabel = (rectangle) => `${rectangle.width.toFixed(1)} × ${rectangle.height.toFixed(1)}`;
const element = (id) => document.getElementById(id);
const ratioLabel = (ratio) => Math.abs(ratio - 16 / 9) < 1e-6 ? "16:9" : Math.abs(ratio - 9 / 16) < 1e-6 ? "9:16" : Math.abs(ratio - 4 / 3) < 1e-6 ? "4:3" : ratio === 1 ? "1:1" : "21:9";
const chipClasses = "min-w-9 border border-[#cbd0c3] px-2.5 py-1.5 font-mono text-sm hover:border-[#536258] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d26939] aria-pressed:border-[#d26939] aria-pressed:bg-[#d26939] aria-pressed:text-white";

// 链接记录预览条件；刷新与文件双击都能还原，不需要本地存储或网络。
const handleReadHash = () => {
  const params = new URLSearchParams(location.hash.slice(1));
  if (MODES.some((mode) => mode.id === params.get("mode"))) state.mode = params.get("mode");
  if (Object.hasOwn(profileLabels, params.get("profile"))) state.profile = params.get("profile");
  for (const [key, min, max] of [["count", 1, 16], ["width", 100, 7680], ["height", 100, 4320], ["gap", 0, 8]]) {
    if (!params.has(key)) continue;
    const value = Number(params.get(key));
    if (Number.isFinite(value) && value >= min && value <= max && (key === "gap" || Number.isInteger(value))) state[key] = value;
  }
  const ratio = Number(params.get("mainRatio"));
  if ([16 / 9, 9 / 16, 4 / 3, 21 / 9].includes(ratio)) state.mainRatio = ratio;
};

const getPlan = (mode, count = state.count) => {
  const key = JSON.stringify([mode, count, state.profile, state.width, state.height, state.mainRatio, state.gap]);
  if (cache.has(key)) return cache.get(key);
  const stabilityKey = `${mode}:${count}:${state.profile}:${state.mainRatio}:${state.gap}`;
  const plan = calculatePreviewLayout({ ...state, mode, secondaryRatios: getRatios(count, state.profile), previous: previousSignatures.get(stabilityKey) });
  if (plan) previousSignatures.set(stabilityKey, plan.signature);
  if (cache.size > 500) cache.clear();
  cache.set(key, plan);
  return plan;
};

const drawHatching = (ctx, width, height) => {
  ctx.fillStyle = "#23342b";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#35473b";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -height; x < width; x += 16) { ctx.moveTo(x, height); ctx.lineTo(x + height, 0); }
  ctx.stroke();
};

// 原比例模拟图的四角和圆形完整可见；黑色仅用于容器与视频比例不一致的部分。
const drawVideo = (ctx, rectangle, video, index, ratio, main = false) => {
  const { x, y, width, height } = rectangle;
  ctx.fillStyle = "#000";
  ctx.fillRect(x, y, width, height);
  const videoX = main ? x : x + (width - video.width) / 2;
  const videoY = y + (height - video.height) / 2;
  const colors = main ? ["#b8cbb5", "#506953"] : [["#72afb5", "#2d6168"], ["#d0a67a", "#775033"], ["#9aa8ce", "#455479"], ["#b5b28b", "#5f6340"]][index % 4];
  ctx.save();
  ctx.beginPath(); ctx.rect(videoX, videoY, video.width, video.height); ctx.clip();
  const gradient = ctx.createLinearGradient(videoX, videoY, videoX + video.width, videoY + video.height);
  gradient.addColorStop(0, colors[0]); gradient.addColorStop(1, colors[1]);
  ctx.fillStyle = gradient; ctx.fillRect(videoX, videoY, video.width, video.height);
  ctx.fillStyle = "#ffffff12";
  ctx.beginPath(); ctx.moveTo(videoX, videoY + video.height * .78);
  ctx.lineTo(videoX + video.width * .32, videoY + video.height * .3);
  ctx.lineTo(videoX + video.width * .61, videoY + video.height * .81);
  ctx.lineTo(videoX + video.width, videoY + video.height * .55);
  ctx.lineTo(videoX + video.width, videoY + video.height); ctx.lineTo(videoX, videoY + video.height); ctx.fill();
  const short = Math.min(video.width, video.height);
  ctx.strokeStyle = "#ffffff38"; ctx.lineWidth = Math.max(.5, short * .006);
  ctx.beginPath(); ctx.arc(videoX + video.width * .74, videoY + video.height * .3, short * .14, 0, Math.PI * 2); ctx.stroke();
  const inset = short * .055, length = short * .075;
  ctx.strokeStyle = "#fff7d9bb"; ctx.lineWidth = Math.max(1, short * .007);
  for (const [cornerX, cornerY, directionX, directionY] of [[videoX + inset, videoY + inset, 1, 1], [videoX + video.width - inset, videoY + inset, -1, 1], [videoX + inset, videoY + video.height - inset, 1, -1], [videoX + video.width - inset, videoY + video.height - inset, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(cornerX, cornerY + directionY * length); ctx.lineTo(cornerX, cornerY); ctx.lineTo(cornerX + directionX * length, cornerY); ctx.stroke();
  }
  ctx.fillStyle = "#f7f5e9"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.max(12, short * (main ? .12 : .2))}px Georgia, serif`;
  ctx.fillText(main ? "主画面 01" : String(index + 2).padStart(2, "0"), videoX + video.width / 2, videoY + video.height * .52, video.width * .7);
  if (short > 46) {
    ctx.font = `${Math.max(9, short * .07)}px Consolas, monospace`;
    ctx.fillStyle = "#ffffffbc";
    ctx.fillText(ratioLabel(ratio), videoX + video.width / 2, videoY + video.height * .69, video.width * .7);
  }
  ctx.restore();
};

const drawPlan = (canvas, plan, count) => {
  // 预览外框也采用墙面比例，窄屏条件不会出现额外的 16:9 画布留白。
  const renderWidth = canvas.id ? 1280 : 640;
  const renderScale = Math.min(renderWidth / state.width, renderWidth * .5625 / state.height);
  canvas.width = Math.max(1, Math.round(state.width * renderScale));
  canvas.height = Math.max(1, Math.round(state.height * renderScale));
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#16231e"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!plan) { ctx.fillStyle = "#f0c29d"; ctx.font = "22px sans-serif"; ctx.fillText("没有可行布局，请调整条件", 24, 60); return; }
  const scale = Math.min(canvas.width / state.width, canvas.height / state.height);
  const offsetX = (canvas.width - state.width * scale) / 2;
  const offsetY = (canvas.height - state.height * scale) / 2;
  ctx.save(); ctx.translate(offsetX, offsetY); ctx.scale(scale, scale);
  drawHatching(ctx, state.width, state.height);
  drawVideo(ctx, plan.main, plan.mainVideo, 0, state.mainRatio, true);
  for (const room of plan.placements) drawVideo(ctx, room, room.video, room.index, getRatios(count, state.profile)[room.index]);
  ctx.strokeStyle = "#b4c7ad"; ctx.lineWidth = 1 / scale; ctx.strokeRect(.5 / scale, .5 / scale, state.width - 1 / scale, state.height - 1 / scale);
  ctx.restore();
  const summary = summarizePlan(plan);
  canvas.setAttribute("aria-label", `${plan.mode}，${count} 格，主窗在左上，右侧 ${summary.rightCount} 小窗，底部 ${summary.bottomCount} 小窗，小窗内黑边 ${percent(summary.smallBlackRatio)}，布局占屏 ${percent(summary.layoutFillRatio)}，实际视频占用 ${percent(summary.fillRatio)}`);
};

const makeCanvas = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 640; canvas.height = 360; canvas.className = "block h-auto w-full bg-[#16231e]";
  canvas.setAttribute("role", "img");
  return canvas;
};

const handleSyncControls = () => {
  for (const button of element("count-controls").children) button.setAttribute("aria-pressed", String(Number(button.dataset.count) === state.count));
  for (const button of element("profile-controls").children) button.setAttribute("aria-pressed", String(button.dataset.profile === state.profile));
  for (const button of element("size-controls").children) button.setAttribute("aria-pressed", String(button.dataset.size === `${state.width},${state.height}`));
  element("custom-width").value = state.width; element("custom-height").value = state.height; element("custom-gap").value = state.gap;
  element("main-ratio").value = String(state.mainRatio);
  element("form-message").textContent = "";
};

const handleRenderComparison = () => {
  const fragment = document.createDocumentFragment();
  for (const mode of MODES) {
    const button = document.createElement("button");
    button.type = "button"; button.dataset.mode = mode.id;
    button.className = "group block min-w-0 border border-[#c6cebd] bg-[#fbfaf6] p-3 text-left transition hover:border-[#8b9f84] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d26939] aria-pressed:border-[#d26939] aria-pressed:bg-[#f8eee4] aria-pressed:ring-1 aria-pressed:ring-[#d26939]";
    button.setAttribute("aria-pressed", String(state.mode === mode.id));
    button.setAttribute("aria-label", `选择${mode.id === "current" ? "当前算法对照" : `方案 ${mode.id}`}`);
    const plan = getPlan(mode.id);
    button.innerHTML = `<div class="mb-2 flex items-center justify-between gap-2"><span class="text-sm font-semibold">${mode.id === "current" ? "对照" : mode.id} <span class="ml-1">${mode.title}</span></span><span class="font-mono text-[10px] text-[#919b88]">${state.count} 格</span></div>`;
    const canvas = makeCanvas(); drawPlan(canvas, plan, state.count); button.append(canvas);
    const text = document.createElement("p"); text.className = "mt-2 flex justify-between gap-2 text-[11px] text-[#6b7a63]";
    if (plan) { const summary = summarizePlan(plan); text.textContent = `占屏 ${percent(summary.layoutFillRatio)} · 小窗黑边 ${percent(summary.smallBlackRatio)}`; }
    else text.textContent = "没有可行布局";
    button.append(text); button.addEventListener("click", () => { state.mode = mode.id; handleRender(); }); fragment.append(button);
  }
  element("comparison").replaceChildren(fragment);
};

const handleRenderDetail = () => {
  const mode = MODES.find((item) => item.id === state.mode), plan = getPlan(state.mode);
  element("detail-title").textContent = `${state.mode === "current" ? "当前算法对照" : `方案 ${state.mode}`} / ${mode.title}`;
  element("detail-condition").textContent = `${state.count} 格 · ${state.width}×${state.height} · ${profileLabels[state.profile]}${state.gap !== 1 && state.mode !== "current" ? ` · 当前 1px / 新版 ${state.gap}px` : ""}`;
  element("detail-subtitle").textContent = mode.subtitle;
  element("detail-description").textContent = mode.description;
  element("choice").textContent = state.mode === "current" ? "当前算法 · 仅作对照" : `${state.mode} · ${mode.title}`;
  drawPlan(element("detail-canvas"), plan, state.count);
  const before = getPlan("current");
  drawPlan(element("before-canvas"), before, state.count);
  const metricMarkup = (values) => values.map(([label, value]) => `<div class="border-t border-[#e3e5dc] pt-2"><dt class="text-[11px] text-[#74806e]">${label}</dt><dd class="mt-1 font-mono text-sm text-[#355d48]">${value}</dd></div>`).join("");
  const metricValues = (value) => {
    const metrics = summarizePlan(value);
    return [["目标占屏 · 允许主窗黑边", percent(metrics.layoutFillRatio)], ["小窗内黑边", percent(metrics.smallBlackRatio)], ["窗口覆盖 · 含所有黑边", percent(metrics.coveredRatio)], ["实际视频占用", percent(metrics.fillRatio)], ["主窗容器 / px", sizeLabel(value.main)], ["小窗分布", `右 ${metrics.rightCount} / 下 ${metrics.bottomCount}`]];
  };
  element("before-metrics").innerHTML = before ? metricMarkup(metricValues(before)) : "没有可行布局";
  if (!plan) { element("detail-metrics").textContent = "没有可行布局"; return; }
  const summary = summarizePlan(plan);
  element("detail-metrics").innerHTML = metricMarkup(metricValues(plan));
  element("geometry-note").textContent = state.mode === "D" ? !plan.placements.length ? "单窗覆盖整墙；主视频完整显示。" : plan.justified
    ? `贴边铺满，仅留 ${plan.gap}px 分隔线。${state.count <= 4 ? "少量房间允许单侧排布。" : summary.rightCount && summary.bottomCount ? "小窗位于右侧和底部。" : "当前比例使用单分区铺满。"}最短小视频边 ${summary.minShortSide.toFixed(1)}px${plan.constrained ? "，部分窗口低于参考尺寸。" : "。"}`
    : state.count === 2 ? "双窗几何限制：唯一小窗的比例与整墙相同，无法在完整显示且主窗更大的条件下用两个矩形铺满。保留的窗外空位单独显示。"
    : "当前几何约束下没有完整贴边候选，保留原比例布局；窗外空位单独统计。"
    : `窗外空位与分隔线 ${percent(summary.vacantRatio)}；最短小视频边 ${summary.minShortSide.toFixed(1)}px。`;
};

const handleRenderAtlas = () => {
  const fragment = document.createDocumentFragment();
  let validationFailures = 0;
  for (let count = 1; count <= 16; count++) {
    const plan = getPlan(state.mode, count), failures = validatePlan(plan, getRatios(count, state.profile), state.mode !== "current");
    validationFailures += failures.length;
    const button = document.createElement("button"); button.type = "button";
    button.className = "min-w-0 border border-[#c7cfbf] bg-[#fbfaf6] p-3 text-left hover:border-[#829b7c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d26939] aria-pressed:border-[#d26939] aria-pressed:ring-1 aria-pressed:ring-[#d26939]";
    button.setAttribute("aria-label", `查看 ${count} 格大图`); button.setAttribute("aria-pressed", String(count === state.count));
    button.innerHTML = `<div class="mb-2 flex justify-between text-xs"><span class="font-semibold"><span class="mr-2 font-mono text-[#a45c38]">${String(count).padStart(2, "0")}</span>${count} 格</span><span class="font-mono text-[#788b70]">目标占屏 ${plan ? percent(summarizePlan(plan).layoutFillRatio) : "—"}</span></div>`;
    const pair = document.createElement("div"); pair.className = "grid grid-cols-2 gap-2";
    for (const [label, comparedPlan] of [["当前算法", getPlan("current", count)], [state.mode === "current" ? "当前算法" : `方案 ${state.mode}`, plan]]) {
      const figure = document.createElement("div");
      const caption = document.createElement("p"); caption.className = "mb-1 text-[10px] text-[#788b70]"; caption.textContent = label;
      const canvas = makeCanvas(); drawPlan(canvas, comparedPlan, count); figure.append(caption, canvas); pair.append(figure);
    }
    button.append(pair);
    const description = document.createElement("p"); description.className = "mt-2 font-mono text-[10px] text-[#7d8a74]";
    const summary = plan && summarizePlan(plan);
    description.textContent = failures.length ? failures.join(" · ") : `右 ${summary.rightCount} / 下 ${summary.bottomCount} · 小窗黑边 ${percent(summary.smallBlackRatio)} · 主窗 ${Math.round(plan.main.width)}×${Math.round(plan.main.height)}`;
    button.append(description);
    button.addEventListener("click", () => { state.count = count; handleRender(); element("detail").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }); });
    fragment.append(button);
  }
  element("atlas").replaceChildren(fragment);
  element("validation-status").textContent = validationFailures ? `${validationFailures} 项几何检查失败` : state.mode === "current" ? "16 种数量 · 对照布局均无重叠或溢出" : "16 种数量 · 原比例 / 小窗无黑边 / 无重叠 / 边界检查通过";
};

const handleRender = () => {
  const started = performance.now();
  try {
    handleSyncControls(); handleRenderComparison(); handleRenderDetail(); handleRenderAtlas();
    history.replaceState(null, "", `#${new URLSearchParams(Object.entries(state).map(([key, value]) => [key, String(value)]))}`);
    element("render-status").textContent = `预览就绪 · ${Math.round(performance.now() - started)}ms · 本地计算`;
  } catch (error) {
    console.error(error);
    element("render-status").textContent = "预览计算失败，请刷新或恢复预设条件。";
  }
};

const handleSubmit = (event) => {
  event.preventDefault();
  const width = Number(element("custom-width").value), height = Number(element("custom-height").value), gap = Number(element("custom-gap").value);
  if (!Number.isInteger(width) || width < 100 || width > 7680 || !Number.isInteger(height) || height < 100 || height > 4320 || !Number.isFinite(gap) || gap < 0 || gap > 8 || !element("custom-gap").value.trim()) {
    element("form-message").textContent = "宽度需为 100–7680 的整数，高度需为 100–4320 的整数，间隔需为 0–8。";
    return;
  }
  const button = element("apply-size"); button.disabled = true; button.textContent = "计算中…";
  requestAnimationFrame(() => {
    Object.assign(state, { width, height, gap }); handleRender();
    button.disabled = false; button.textContent = "应用";
    element("form-message").textContent = `已应用 ${width}×${height}，间隔 ${gap}px。`;
  });
};

for (let count = 1; count <= 16; count++) {
  const button = document.createElement("button"); button.type = "button"; button.dataset.count = String(count);
  button.className = chipClasses; button.textContent = String(count); button.setAttribute("aria-label", `${count} 格`);
  button.addEventListener("click", () => { state.count = count; handleRender(); }); element("count-controls").append(button);
}
for (const button of element("profile-controls").children) button.addEventListener("click", () => { state.profile = button.dataset.profile; handleRender(); });
for (const button of element("size-controls").children) button.addEventListener("click", () => { [state.width, state.height] = button.dataset.size.split(",").map(Number); handleRender(); });
element("main-ratio").addEventListener("change", (event) => { state.mainRatio = Number(event.target.value); handleRender(); });
element("custom-form").addEventListener("submit", handleSubmit);
window.addEventListener("hashchange", () => { handleReadHash(); handleRender(); });
handleReadHash(); handleRender();
