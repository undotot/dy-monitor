// 等尺寸小窗的独立设计原型；不参与正式应用构建。
import { DEFAULT_RATIO, calculateDesign as calculatePrevious, validateDesign as validatePrevious } from "./focus-replan-layout.js";

export const DESIGNS = Object.freeze([
  { id: "U", title: "大主窗铺满", rule: "同宽同高 / 视频占用优先", note: "优先实际视频占用，主画面更大；小窗可能较窄、裁切较多。", description: "单侧条带与完整 L 形网格使用同一小窗宽高。主视频保留单窗最大面积的至少 52%，观看尺寸合适时优先实际视频占用，因此可能得到更大的主画面和更窄的小窗。" },
  { id: "V", title: "固定 16:9", rule: "同宽同高 / 主画面优先", note: "小窗统一 16:9；横屏原画完整，其他比例裁切，允许窗外黑底。", description: "全部小窗采用相同的 16:9 尺寸。先保留主视频单窗最大面积的至少 60%，再求最大统一小窗；尾行不放大，剩余区域用黑底。" },
  { id: "W", title: "减少裁切", rule: "同宽同高 / 最差保留率优先", note: "使用同尺寸铺满候选，优先照顾被裁切最多的小窗。", description: "使用与 U 相同的完整网格候选，主视频保留单窗最大面积的至少 52%。在观看尺寸合适时，优先最差原画保留率，再比较平均保留率。" }
]);
const area = (rectangle) => rectangle.width * rectangle.height;
const normalizeRatio = (ratio) => Number.isFinite(ratio) && ratio > 0 ? ratio : DEFAULT_RATIO;
const fit = (width, height, ratio, cover = false) => {
  const videoWidth = cover ? Math.max(width, height * ratio) : Math.min(width, height * ratio);
  return { width: videoWidth, height: videoWidth / ratio };
};
const quality = (candidate) => Math.min(1, candidate.mainVideo.width / 640, candidate.mainVideo.height / 360, Math.min(candidate.cell.width, candidate.cell.height) / 112.5);
const makeCandidate = (input, main, cell, slots, signature, complete) => {
  const { width, height, mainRatio, ratios, gap, mode } = input;
  if (![main.width, main.height, cell.width, cell.height].every((value) => Number.isFinite(value) && value > 0)) return null;
  const mainVideo = fit(main.width, main.height, mainRatio);
  const target = area(fit(width, height, mainRatio)) * (mode === "V" ? .6 : .52);
  if (area(mainVideo) < target - 1e-7 || area(mainVideo) < area(cell) * (ratios.length > 1 ? 2.5 : 1.5) - 1e-7) return null;
  const retained = ratios.map((ratio) => Math.min(cell.width / cell.height / ratio, ratio / (cell.width / cell.height)));
  return { mode, width, height, gap, main, mainVideo, cell, slots, signature, complete, uniform: true,
    minimumRetention: Math.min(...retained), averageRetention: retained.reduce((sum, value) => sum + value, 0) / retained.length,
    visibleArea: area(mainVideo) + area(cell) * ratios.length, mainArea: area(mainVideo),
    rightCount: slots.filter((slot) => slot.region === "right").length };
};
const rectangle = (width, height) => ({ x: 0, y: 0, width, height });
const createSlots = (count, columns, cell, gap, x, y, region) => Array.from({ length: count }, (_, index) => ({
  x: x + index % columns * (cell.width + gap), y: y + Math.floor(index / columns) * (cell.height + gap), region
}));

// 单侧一边贴墙，另一边连续变化；候选包含观看尺寸门槛和各源比例断点。
const createStrips = (input) => {
  const { width, height, ratios, gap } = input, count = ratios.length;
  const candidates = [], desiredRatios = [...ratios, Math.sqrt(Math.min(...ratios) * Math.max(...ratios)), 1, DEFAULT_RATIO];
  for (const side of ["right", "bottom"]) {
    for (let columns = 1; columns <= count; columns++) {
      if (count % columns) continue;
      const rows = count / columns;
      const horizontal = side === "right";
      const fixed = horizontal ? (height - (rows - 1) * gap) / rows : (width - (columns - 1) * gap) / columns;
      if (fixed <= 0) continue;
      const create = (size) => {
        const cell = { width: horizontal ? size : fixed, height: horizontal ? fixed : size };
        const main = rectangle(horizontal ? width - columns * (size + gap) : width, horizontal ? height : height - rows * (size + gap));
        const slots = createSlots(count, columns, cell, gap, horizontal ? main.width + gap : 0, horizontal ? 0 : main.height + gap, side);
        return makeCandidate(input, main, cell, slots, `${input.mode}:strip:${side}:${columns}`, true);
      };
      let low = 0, high = horizontal ? width / columns : height / rows;
      for (let iteration = 0; iteration < 40; iteration++) {
        const middle = (low + high) / 2;
        if (create(middle)) low = middle;
        else high = middle;
      }
      if (low <= 1e-8) continue;
      const values = new Set([low, low * .85, low * .95, 112.5, 112.5 * .85, ...desiredRatios.map((ratio) => horizontal ? fixed * ratio : fixed / ratio)]);
      for (const size of values) {
        if (size > low + 1e-7 || size <= 0) continue;
        const candidate = create(size);
        if (candidate) candidates.push(candidate);
      }
    }
  }
  return candidates;
};

// 完整 L 形由同一网格减去左上主窗矩形，不产生尾行空格或不同尺寸。
const createFullGrids = (input) => {
  const { width, height, ratios, gap } = input, count = ratios.length;
  const candidates = [];
  for (let rightColumns = 1; rightColumns < count; rightColumns++) {
    for (let bottomRows = 1; bottomRows < count; bottomRows++) {
      for (let mainColumns = 1; mainColumns < count; mainColumns++) {
        const remaining = count - bottomRows * (rightColumns + mainColumns);
        if (remaining <= 0 || remaining % rightColumns) continue;
        const mainRows = remaining / rightColumns, columns = rightColumns + mainColumns, rows = mainRows + bottomRows;
        const cell = { width: (width - (columns - 1) * gap) / columns, height: (height - (rows - 1) * gap) / rows };
        const main = rectangle(mainColumns * (cell.width + gap) - gap, mainRows * (cell.height + gap) - gap);
        const rightCount = rightColumns * rows;
        const slots = [...createSlots(rightCount, rightColumns, cell, gap, main.width + gap, 0, "right"),
          ...createSlots(count - rightCount, mainColumns, cell, gap, 0, main.height + gap, "bottom")];
        const candidate = makeCandidate(input, main, cell, slots, `${input.mode}:grid:${mainColumns}:${mainRows}:${rightColumns}:${bottomRows}`, true);
        if (candidate) candidates.push(candidate);
      }
    }
  }
  return candidates;
};

const createFixedRatio = (input) => {
  const { width, height, ratios, gap } = input, count = ratios.length;
  const candidates = [];
  for (let rightCount = count >= 4 ? 1 : 0; rightCount <= (count >= 4 ? count - 1 : count); rightCount++) {
    const bottomCount = count - rightCount;
    for (let rightColumns = 1; rightColumns <= Math.max(1, rightCount); rightColumns++) {
      for (let bottomColumns = 1; bottomColumns <= Math.max(1, bottomCount); bottomColumns++) {
        const rightRows = Math.ceil(rightCount / rightColumns), bottomRows = Math.ceil(bottomCount / bottomColumns);
        const create = (size) => {
          const cell = { width: size * DEFAULT_RATIO, height: size };
          const rightWidth = rightCount ? rightColumns * (cell.width + gap) - gap : 0;
          const bottomHeight = bottomCount ? bottomRows * (cell.height + gap) - gap : 0;
          const main = rectangle(width - rightWidth - (rightCount ? gap : 0), height - bottomHeight - (bottomCount ? gap : 0));
          if (rightCount && rightRows * (cell.height + gap) - gap > main.height + 1e-7 || bottomCount && bottomColumns * (cell.width + gap) - gap > width + 1e-7) return null;
          const slots = [...createSlots(rightCount, rightColumns, cell, gap, main.width + gap, 0, "right"),
            ...createSlots(bottomCount, bottomColumns, cell, gap, 0, main.height + gap, "bottom")];
          return makeCandidate(input, main, cell, slots, `V:fixed:${rightCount}:${rightColumns}:${bottomColumns}`, false);
        };
        let low = 0, high = Math.max(width, height);
        for (let iteration = 0; iteration < 36; iteration++) {
          const middle = (low + high) / 2;
          if (create(middle)) low = middle;
          else high = middle;
        }
        if (low > 1e-8) { const candidate = create(low); if (candidate) candidates.push(candidate); }
      }
    }
  }
  return candidates;
};

const compareCandidates = (candidate, previous, input) => {
  if (!previous) return true;
  const ordered = input.mode === "U" ? [[candidate.visibleArea, previous.visibleArea, input.width * input.height * .002]]
    : input.mode === "V" ? [[area(candidate.cell), area(previous.cell), .01]]
      : [[candidate.minimumRetention, previous.minimumRetention, .002], [candidate.averageRetention, previous.averageRetention, .002]];
  for (const [value, previousValue, tolerance] of ordered) {
    if (Math.abs(value - previousValue) > tolerance) return value > previousValue;
  }
  if (candidate.signature === input.previous && previous.signature !== input.previous) return true;
  if (previous.signature === input.previous) return false;
  return candidate.mainArea > previous.mainArea + .01;
};

export const calculateDesign = ({ mode = "U", width, height, mainRatio = DEFAULT_RATIO, secondaryRatios = [], gap = 1, previous = null }) => {
  if (mode === "current") return calculatePrevious({ mode, width, height, mainRatio, secondaryRatios, gap, previous });
  if (!DESIGNS.some((design) => design.id === mode) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || secondaryRatios.length > 15) return null;
  const ratios = secondaryRatios.map(normalizeRatio);
  gap = Math.min(Math.max(0, Number.isFinite(gap) ? gap : 1), width / (ratios.length + 2) / 4, height / (ratios.length + 2) / 4);
  const input = { mode, width, height, mainRatio: normalizeRatio(mainRatio), ratios, gap, previous };
  if (!ratios.length) return { ...input, main: rectangle(width, height), mainVideo: fit(width, height, input.mainRatio), placements: [], signature: `${mode}:single`, complete: true, uniform: true };
  const candidates = mode === "V" ? createFixedRatio(input) : [...createStrips(input), ...createFullGrids(input)];
  const bestQuality = Math.max(0, ...candidates.map(quality));
  const eligible = candidates.filter((candidate) => quality(candidate) >= bestQuality * .85 - 1e-7);
  const dual = ratios.length >= 4 ? eligible.filter((candidate) => candidate.rightCount && candidate.rightCount < ratios.length) : [];
  let best = null;
  for (const candidate of dual.length ? dual : eligible) if (compareCandidates(candidate, best, input)) best = candidate;
  if (!best) return null;
  const placements = best.slots.map((slot, index) => {
    const video = fit(best.cell.width, best.cell.height, ratios[index], true);
    return { ...slot, ...best.cell, index, ratio: ratios[index], video, fit: "cover", retained: area(best.cell) / area(video) };
  });
  const { slots, ...plan } = best;
  return { ...plan, placements, quality: quality(best), qualityReference: bestQuality };
};

export const validateDesign = (plan, ratios) => {
  const failures = validatePrevious(plan, ratios);
  if (plan?.uniform && plan.placements.length) {
    const first = plan.placements[0];
    if (plan.placements.some((room) => Math.abs(room.width - first.width) > 1e-7 || Math.abs(room.height - first.height) > 1e-7)) failures.push("小窗宽高不一致");
  }
  return failures;
};
