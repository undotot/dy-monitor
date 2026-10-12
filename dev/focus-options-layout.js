// 设计预览专用：不接入正式应用，不改变现有播放器与布局。
import { calculateFocusLayout } from "../src/core/focus-layout.js";

export const DEFAULT_RATIO = 16 / 9;
export const MODES = Object.freeze([
  { id: "A", title: "等高 · 原比例", subtitle: "统一高度 / 横屏为主", description: "所有小窗等高，每路按真实比例计算宽度。保持统一尺寸，并按主窗容器与小窗画面面积减少空位。", axis: "height", factors: [1] },
  { id: "B", title: "等宽 · 原比例", subtitle: "列对齐 / 混合比例", description: "所有小窗等宽，每路按真实比例计算高度。竖屏更高，横屏更矮；列对齐，完整显示且窗内无黑边。", axis: "width", factors: [1] },
  { id: "C", title: "分区 · 原比例", subtitle: "两区高度差最多 25%", description: "右侧与底部分别等高，允许两区高度最多相差 25%。优先满足观看尺寸，再减少排布空位。", axis: "height", factors: [0.8, 0.9, 1, 1.1, 1.25] },
  { id: "D", title: "贴边 · 铺满优先", subtitle: "3–4 格新增单侧铺满 / 同条件对照", description: "3–4 格比较右侧整列、底部整行与双分区，不再强制两侧都有小窗。更多房间优先比较双分区；必要时使用单分区铺满。主窗在左上，允许黑边；小窗完整显示、保持比例、无黑边。", axis: "justified", factors: [1] },
  { id: "current", title: "当前算法", subtitle: "代码原样 / 对照", description: "所有小窗共享宽高和比例，视频 contain。混合比例会产生窗内黑边，且可能只出现在一个方向。", axis: "current", factors: [1] }
]);

const ratioOf = (value) => Number.isFinite(value) && value > 0 ? value : DEFAULT_RATIO;
export const fitVideo = (width, height, ratio) => {
  const videoWidth = Math.min(width, height * ratioOf(ratio));
  return { width: videoWidth, height: videoWidth / ratioOf(ratio) };
};

export const getRatios = (count, profile) => Array.from({ length: count - 1 }, (_, index) => {
  if (profile === "portrait") return 9 / 16;
  // 从第一个小窗就加入竖屏，3 格也能看出不同方案的区别。
  if (profile === "mixed") return index % 3 === 0 ? 9 / 16 : DEFAULT_RATIO;
  if (profile === "varied") return [9 / 16, DEFAULT_RATIO, 4 / 3, 1, 21 / 9][index % 5];
  return DEFAULT_RATIO;
});

const chunkRooms = (rooms, size) => {
  const groups = [];
  for (let index = 0; index < rooms.length; index += size) groups.push(rooms.slice(index, index + size));
  return groups;
};

// 等高方案按行排，等宽方案按列排；保持输入顺序，不按比例重排房间。
const measureRegion = (groups, axis, size, gap, withPlacements = false) => {
  if (!groups.length) return { width: 0, height: 0, placements: [] };
  let width = 0, height = 0;
  const placements = [];
  for (const group of groups) {
    let cursor = 0;
    for (const room of group) {
      const roomWidth = axis === "height" ? size * room.ratio : size;
      const roomHeight = axis === "height" ? size : size / room.ratio;
      if (withPlacements) placements.push({ index: room.index, ratio: room.ratio,
        x: axis === "height" ? cursor : width, y: axis === "height" ? height : cursor,
        width: roomWidth, height: roomHeight, video: { width: roomWidth, height: roomHeight } });
      cursor += (axis === "height" ? roomWidth : roomHeight) + gap;
    }
    const span = cursor - gap;
    if (axis === "height") { width = Math.max(width, span); height += size + gap; }
    else { width += size + gap; height = Math.max(height, span); }
  }
  return { width: axis === "width" ? width - gap : width, height: axis === "height" ? height - gap : height, placements };
};

// 单调谓词二分求可用尺寸，不依赖像素取整或 3～16 格的硬编码表。
const lastTrue = (high, predicate) => {
  let low = 0;
  for (let iteration = 0; iteration < 36; iteration++) {
    const middle = (low + high) / 2;
    if (predicate(middle)) low = middle;
    else high = middle;
  }
  return low;
};

const toCurrentPlan = (options) => {
  const plan = calculateFocusLayout(options);
  if (!plan) return null;
  return { ...plan, mode: "current", width: options.width, height: options.height,
    main: { ...plan.main, x: 0, y: 0 },
    placements: plan.placements.map((room) => ({ ...room, ratio: ratioOf(options.secondaryRatios[room.index]),
      x: room.x + (room.region === "right" ? plan.main.width + plan.gap : 0),
      y: room.y + (room.region === "bottom" ? plan.main.height + plan.gap : 0) })) };
};

/** @typedef {{index:number, region:string, x:number, y:number, width:number, height:number, ratio:number, video:{width:number,height:number}}} Placement */
/**
 * 只优化保持房间顺序的行/列候选；不宣称任意矩形装箱的全局最优。
 * C 的五个比例是预览候选，正式实现时可将连续优化与性能作为进一步评估项。
 */
export const calculatePreviewLayout = ({ mode = "A", width, height, mainRatio = DEFAULT_RATIO, secondaryRatios = [], gap = 1, previous = null }) => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const ratios = secondaryRatios.map(ratioOf);
  if (mode === "current") return toCurrentPlan({ width, height, mainRatio, secondaryRatios: ratios, previous });
  if (!MODES.some((item) => item.id === mode) || ratios.length > 15) return null;
  if (!ratios.length) {
    const main = { x: 0, y: 0, width, height }, mainVideo = fitVideo(width, height, mainRatio);
    return { mode, width, height, gap: 0, main, mainVideo, placements: [], rightCount: 0, bottomCount: 0,
      quality: Math.min(1, width / 640, height / 360), constrained: width < 640 || height < 360,
      justified: true, signature: `${mode}:single`, layoutArea: width * height, layoutFillRatio: 1,
      videoArea: mainVideo.width * mainVideo.height, fillRatio: mainVideo.width * mainVideo.height / (width * height) };
  }
  if (mode === "D") return calculateJustifiedLayout({ width, height, mainRatio, secondaryRatios: ratios, gap, previous });
  const config = MODES.find((item) => item.id === mode);
  mainRatio = ratioOf(mainRatio);
  gap = Math.min(Math.max(0, Number.isFinite(gap) ? gap : 1), width / (ratios.length + 2) / 4, height / (ratios.length + 2) / 4);
  const rooms = ratios.map((ratio, index) => ({ ratio, index }));
  const wallArea = width * height;
  // 主窗允许黑边，容器的观看尺寸与视频固有比例无关。
  const mainTargets = { width: 640, height: 360 };
  let best = null;

  const isBetter = (candidate) => {
    if (!best) return true;
    if (Math.abs(candidate.quality - best.quality) > 1e-7) return candidate.quality > best.quality;
    if (Math.abs(candidate.layoutArea - best.layoutArea) > wallArea * 0.005) return candidate.layoutArea > best.layoutArea;
    if (candidate.signature === previous && best.signature !== previous) return true;
    if (best.signature === previous && candidate.signature !== previous) return false;
    if (Math.abs(candidate.layoutArea - best.layoutArea) > 0.01) return candidate.layoutArea > best.layoutArea;
    if (Math.abs(candidate.sizeDifference - best.sizeDifference) > 1e-7) return candidate.sizeDifference < best.sizeDifference;
    return candidate.main.width * candidate.main.height > best.main.width * best.main.height + 0.01;
  };

  const minimumRightCount = rooms.length === 1 ? 0 : 1;
  const maximumRightCount = rooms.length === 1 ? 1 : rooms.length - 1;
  for (let rightCount = minimumRightCount; rightCount <= maximumRightCount; rightCount++) {
    for (let rightGroupSize = rightCount ? 1 : 0; rightGroupSize <= rightCount; rightGroupSize++) {
      const rightGroups = chunkRooms(rooms.slice(0, rightCount), rightGroupSize);
      for (let bottomGroupSize = rooms.length > rightCount ? 1 : 0; bottomGroupSize <= rooms.length - rightCount; bottomGroupSize++) {
        const bottomGroups = chunkRooms(rooms.slice(rightCount), bottomGroupSize);
        for (const factor of config.factors) {
          const rightShortFactor = Math.min(...rooms.slice(0, rightCount).map((room) => config.axis === "height" ? Math.min(room.ratio, 1) * factor : Math.min(1, 1 / room.ratio)));
          const bottomShortFactor = Math.min(...rooms.slice(rightCount).map((room) => config.axis === "height" ? Math.min(room.ratio, 1) : Math.min(1, 1 / room.ratio)));
          const minimumShortFactor = Math.min(rightShortFactor, bottomShortFactor);
          const areaCoefficient = rooms.reduce((sum, room) => sum + (config.axis === "height" ? room.ratio * (room.index < rightCount ? factor ** 2 : 1) : 1 / room.ratio), 0);
          const largestAreaCoefficient = Math.max(...rooms.map((room) => config.axis === "height" ? room.ratio * (room.index < rightCount ? factor ** 2 : 1) : 1 / room.ratio));

          const measure = (size, withPlacements = false) => {
            const right = measureRegion(rightGroups, config.axis, size * factor, gap, withPlacements);
            const bottom = measureRegion(bottomGroups, config.axis, size, gap, withPlacements);
            const main = { x: 0, y: 0, width: width - right.width - (rightCount ? gap : 0), height: height - bottom.height - (rooms.length > rightCount ? gap : 0) };
            const mainVideo = fitVideo(main.width, main.height, mainRatio);
            const mainQuality = Math.min(main.width / mainTargets.width, main.height / mainTargets.height);
            const smallQuality = size * minimumShortFactor / 112.5;
            const feasible = main.width > 0 && main.height > 0 && right.height <= main.height + 1e-7 && bottom.width <= width + 1e-7
              && main.width * main.height >= 1.5 * largestAreaCoefficient * size ** 2 - 1e-7;
            return { right, bottom, main, mainVideo, mainQuality, smallQuality, feasible };
          };

          const maximum = lastTrue(Math.max(width, height) * 2, (size) => measure(size).feasible);
          if (maximum < 1e-7) continue;
          const balanced = lastTrue(maximum, (size) => { const value = measure(size); return value.smallQuality <= value.mainQuality; });
          const mainMinimum = lastTrue(maximum, (size) => measure(size).mainQuality >= 1);
          const values = new Set([maximum, balanced, 112.5 / minimumShortFactor, mainMinimum]);
          // 主窗自由比例：尺寸端点参与分配面积评分，主视频比例不改变排布。
          for (const size of values) {
            if (size <= 0 || size > maximum + 1e-7) continue;
            const measured = measure(size);
            if (!measured.feasible) continue;
            const videoArea = measured.mainVideo.width * measured.mainVideo.height + areaCoefficient * size ** 2;
            const layoutArea = measured.main.width * measured.main.height + areaCoefficient * size ** 2;
            const quality = Math.min(1, measured.mainQuality, measured.smallQuality);
            const candidate = { mode, width, height, gap, ...measured, quality, videoArea, layoutArea, layoutFillRatio: layoutArea / wallArea, fillRatio: videoArea / wallArea,
              rightCount, bottomCount: rooms.length - rightCount, size, factor, sizeDifference: Math.abs(Math.log(factor)),
              constrained: quality < 1 - 1e-7, signature: `${mode}:${rightCount}:${rightGroupSize}:${bottomGroupSize}:${factor}` };
            if (isBetter(candidate)) best = candidate;
          }
        }
      }
    }
  }
  if (!best) return null;
  const [, rightCount, rightGroupSize, bottomGroupSize] = best.signature.split(":").map((value, index) => index ? Number(value) : value);
  const right = measureRegion(chunkRooms(rooms.slice(0, rightCount), rightGroupSize), config.axis, best.size * best.factor, gap, true);
  const bottom = measureRegion(chunkRooms(rooms.slice(rightCount), bottomGroupSize), config.axis, best.size, gap, true);
  best.placements = [...right.placements.map((room) => ({ ...room, region: "right", x: room.x + best.main.width + gap })),
    ...bottom.placements.map((room) => ({ ...room, region: "bottom", y: room.y + best.main.height + gap }))];
  return best;
};

// D 枚举所有连续分组，不按视频比例重新排序。最多 15 个小窗，组合数有界。
const createBandRanges = (ratios) => {
  const ranges = new Map();
  for (let start = 0; start < ratios.length; start++) {
    let ratioSum = 0, inverseSum = 0, minimum = Infinity, maximum = 0;
    for (let end = start + 1; end <= ratios.length; end++) {
      const ratio = ratios[end - 1];
      ratioSum += ratio; inverseSum += 1 / ratio; minimum = Math.min(minimum, ratio); maximum = Math.max(maximum, ratio);
      ranges.set(`${start}:${end}`, { start, end, count: end - start, ratioSum, inverseSum, minimum, maximum });
    }
  }
  return ranges;
};

const createPartitions = (start, end, ranges) => {
  if (start === end) return [{ bands: [], signature: "0", rowSlope: 0, rowGap: 0, columnSlope: 0, columnGap: 0 }];
  const partitions = [];
  for (let mask = 0; mask < 2 ** (end - start - 1); mask++) {
    const bands = [];
    let cursor = start;
    for (let boundary = start + 1; boundary <= end; boundary++) {
      if (boundary !== end && !(mask & 2 ** (boundary - start - 1))) continue;
      bands.push(ranges.get(`${cursor}:${boundary}`)); cursor = boundary;
    }
    partitions.push({ bands, signature: bands.map((band) => band.count).join("-"),
      rowSlope: bands.reduce((sum, band) => sum + 1 / band.ratioSum, 0),
      rowGap: bands.reduce((sum, band) => sum + (band.count - 1) / band.ratioSum, 0),
      columnSlope: bands.reduce((sum, band) => sum + 1 / band.inverseSum, 0),
      columnGap: bands.reduce((sum, band) => sum + (band.count - 1) / band.inverseSum, 0) });
  }
  return partitions;
};

const measureJustifiedRegion = (partition, axis, width, height, gap) => {
  let largestArea = 0, minimumShort = Infinity, area = 0;
  for (const band of partition.bands) {
    if (axis === "height") {
      const bandHeight = (width - (band.count - 1) * gap) / band.ratioSum;
      if (bandHeight <= 0) return null;
      largestArea = Math.max(largestArea, bandHeight ** 2 * band.maximum);
      minimumShort = Math.min(minimumShort, bandHeight * Math.min(1, band.minimum));
      area += bandHeight ** 2 * band.ratioSum;
    } else {
      const bandWidth = (height - (band.count - 1) * gap) / band.inverseSum;
      if (bandWidth <= 0) return null;
      largestArea = Math.max(largestArea, bandWidth ** 2 / band.minimum);
      minimumShort = Math.min(minimumShort, bandWidth * Math.min(1, 1 / band.maximum));
      area += bandWidth ** 2 * band.inverseSum;
    }
  }
  return { largestArea, minimumShort, area };
};

const placeJustifiedRegion = (partition, axis, width, height, ratios, gap, region, offsetX, offsetY) => {
  const placements = [];
  let bandCursor = 0;
  for (const band of partition.bands) {
    const size = axis === "height" ? (width - (band.count - 1) * gap) / band.ratioSum : (height - (band.count - 1) * gap) / band.inverseSum;
    let cursor = 0;
    for (let index = band.start; index < band.end; index++) {
      const roomWidth = axis === "height" ? size * ratios[index] : size;
      const roomHeight = axis === "height" ? size : size / ratios[index];
      placements.push({ index, ratio: ratios[index], region, x: offsetX + (axis === "height" ? cursor : bandCursor),
        y: offsetY + (axis === "height" ? bandCursor : cursor), width: roomWidth, height: roomHeight, video: { width: roomWidth, height: roomHeight } });
      cursor += (axis === "height" ? roomWidth : roomHeight) + gap;
    }
    bandCursor += size + gap;
  }
  return placements;
};

const calculateJustifiedLayout = ({ width, height, mainRatio, secondaryRatios, gap, previous }) => {
  gap = Math.min(Math.max(0, Number.isFinite(gap) ? gap : 1), width / (secondaryRatios.length + 2) / 4, height / (secondaryRatios.length + 2) / 4);
  // 只有完整贴边候选都不可行时才保留原比例兜底，不用观看尺寸软目标否决铺满。
  const fallbackPrevious = previous?.startsWith("D:fallback:") ? previous.slice(11) : null;
  const fallbacks = ["A", "B", "C"].map((mode) => calculatePreviewLayout({ mode, width, height, mainRatio, secondaryRatios, gap, previous: fallbackPrevious })).filter(Boolean);
  let fallback = fallbacks[0];
  for (const plan of fallbacks.slice(1)) if (plan.quality > fallback.quality + 1e-7 || Math.abs(plan.quality - fallback.quality) <= 1e-7 && plan.layoutArea > fallback.layoutArea) fallback = plan;
  if (!fallback) return null;
  let best = { ...fallback, mode: "D", fallbackMode: fallback.mode, justified: false, signature: `D:fallback:${fallback.signature}` };
  const qualityFloor = fallback.quality * .8;
  const wallArea = width * height;
  const ranges = createBandRanges(secondaryRatios);
  let bestSingle = null, bestDual = null;

  const isBetter = (candidate, incumbent) => {
    if (!incumbent) return true;
    // 铺满候选之间仅差分隔线面积时，优先观看尺寸，避免为省几条线缩小小窗。
    if (Math.abs(candidate.layoutArea - incumbent.layoutArea) > wallArea * .005) return candidate.layoutArea > incumbent.layoutArea;
    if (Math.abs(candidate.quality - incumbent.quality) > 1e-7) return candidate.quality > incumbent.quality;
    if (candidate.signature === previous && incumbent.signature !== previous) return true;
    if (incumbent.signature === previous && candidate.signature !== previous) return false;
    const mainAreaDifference = candidate.main.width * candidate.main.height - incumbent.main.width * incumbent.main.height;
    if (Math.abs(mainAreaDifference) > .01) return mainAreaDifference > 0;
    return candidate.layoutArea > incumbent.layoutArea + .01;
  };

  // 3–4 格的整列/整行属于正式候选；更多格数也保留单区，解决源比例与墙面方向冲突。
  for (let rightCount = 0; rightCount <= secondaryRatios.length; rightCount++) {
    const rightPartitions = createPartitions(0, rightCount, ranges);
    const bottomPartitions = createPartitions(rightCount, secondaryRatios.length, ranges);
    for (const bottom of bottomPartitions) {
      for (const bottomAxis of ["height", "width"]) {
        const bottomHeight = !bottom.bands.length ? 0 : bottomAxis === "height" ? width * bottom.rowSlope - gap * bottom.rowGap + (bottom.bands.length - 1) * gap
          : (width - (bottom.bands.length - 1) * gap + gap * bottom.columnGap) / bottom.columnSlope;
        const mainHeight = height - bottomHeight - (bottom.bands.length ? gap : 0);
        if (mainHeight <= 0 || bottomHeight < 0) continue;
        const bottomMeasurement = measureJustifiedRegion(bottom, bottomAxis, width, bottomHeight, gap);
        if (!bottomMeasurement) continue;
        for (const right of rightPartitions) {
          for (const rightAxis of ["height", "width"]) {
            const rightWidth = !right.bands.length ? 0 : rightAxis === "width" ? mainHeight * right.columnSlope - gap * right.columnGap + (right.bands.length - 1) * gap
              : (mainHeight - (right.bands.length - 1) * gap + gap * right.rowGap) / right.rowSlope;
            const mainWidth = width - rightWidth - (right.bands.length ? gap : 0);
            if (mainWidth <= 0 || rightWidth < 0) continue;
            const rightMeasurement = measureJustifiedRegion(right, rightAxis, rightWidth, mainHeight, gap);
            if (!rightMeasurement) continue;
            const mainArea = mainWidth * mainHeight;
            if (mainArea < 1.5 * Math.max(rightMeasurement.largestArea, bottomMeasurement.largestArea) - 1e-7) continue;
            const quality = Math.min(1, mainWidth / 640, mainHeight / 360, rightMeasurement.minimumShort / 112.5, bottomMeasurement.minimumShort / 112.5);
            const layoutArea = mainArea + rightMeasurement.area + bottomMeasurement.area;
            const candidate = { mode: "D", width, height, gap, main: { x: 0, y: 0, width: mainWidth, height: mainHeight },
              rightWidth, bottomHeight, rightCount, bottomCount: secondaryRatios.length - rightCount,
              quality, constrained: quality < 1 - 1e-7, layoutArea, layoutFillRatio: layoutArea / wallArea,
              justified: true, rightPartition: right, bottomPartition: bottom, rightAxis, bottomAxis,
              signature: `D:${rightCount}:${rightAxis}:${right.signature}:${bottomAxis}:${bottom.signature}` };
            if (rightCount && rightCount < secondaryRatios.length) {
              if (isBetter(candidate, bestDual)) bestDual = candidate;
            } else if (isBetter(candidate, bestSingle)) bestSingle = candidate;
          }
        }
      }
    }
  }
  // 多房间优先保留右侧 + 底部；3–4 格自由比较单区与双区。
  // 20% 只用于两种已铺满结构的取舍，不再以有空位的方案代替可行的铺满结构。
  if (secondaryRatios.length >= 4 && bestDual && bestDual.quality >= .8 * (bestSingle?.quality || 0) - 1e-7) best = bestDual;
  else if (bestSingle && bestDual) best = isBetter(bestDual, bestSingle) ? bestDual : bestSingle;
  else best = bestSingle || bestDual || best;
  if (best.justified) best.placements = [
    ...placeJustifiedRegion(best.rightPartition, best.rightAxis, best.rightWidth, best.main.height, secondaryRatios, gap, "right", best.main.width + gap, 0),
    ...placeJustifiedRegion(best.bottomPartition, best.bottomAxis, width, best.bottomHeight, secondaryRatios, gap, "bottom", 0, best.main.height + gap)
  ];
  best.mainVideo = fitVideo(best.main.width, best.main.height, mainRatio);
  best.videoArea = best.mainVideo.width * best.mainVideo.height + best.placements.reduce((sum, room) => sum + room.width * room.height, 0);
  best.fillRatio = best.videoArea / wallArea;
  best.qualityFloor = qualityFloor;
  best.belowQualityReference = best.quality < qualityFloor - 1e-7;
  return best;
};

export const summarizePlan = (plan) => {
  const smallArea = plan.placements.reduce((sum, room) => sum + room.width * room.height, 0);
  const smallVideoArea = plan.placements.reduce((sum, room) => sum + room.video.width * room.video.height, 0);
  const mainArea = plan.main.width * plan.main.height;
  const mainVideoArea = plan.mainVideo.width * plan.mainVideo.height;
  const wallArea = plan.width * plan.height;
  return { smallBlackRatio: smallArea ? Math.max(0, 1 - smallVideoArea / smallArea) : 0,
    mainBlackRatio: Math.max(0, 1 - mainVideoArea / mainArea),
    fillRatio: (mainVideoArea + smallVideoArea) / (plan.width * plan.height),
    // 两种算法按同一需求统计：允许主窗黑边，小窗只计真实画面。
    layoutFillRatio: (mainArea + smallVideoArea) / wallArea,
    coveredRatio: (mainArea + smallArea) / wallArea,
    vacantRatio: Math.max(0, 1 - (mainArea + smallArea) / wallArea),
    smallBlackWallRatio: Math.max(0, (smallArea - smallVideoArea) / wallArea),
    rightCount: plan.placements.filter((room) => room.region === "right").length,
    bottomCount: plan.placements.filter((room) => room.region === "bottom").length,
    minShortSide: plan.placements.length ? Math.min(...plan.placements.map((room) => Math.min(room.video.width, room.video.height))) : 0 };
};

export const validatePlan = (plan, ratios, strict = true) => {
  const failures = [];
  if (!plan) return ["没有可行布局"];
  const epsilon = 0.02;
  const summary = summarizePlan(plan);
  if (plan.placements.length !== ratios.length || new Set(plan.placements.map((room) => room.index)).size !== ratios.length) failures.push("房间数量或索引错误");
  if (strict && plan.mode !== "D" && ratios.length >= 2 && (!summary.rightCount || !summary.bottomCount)) failures.push("右侧和底部必须同时有小窗");
  if (plan.main.x !== 0 || plan.main.y !== 0) failures.push("主窗必须在左上角");
  const rectangles = [plan.main, ...plan.placements];
  for (const [index, rectangle] of rectangles.entries()) {
    if (rectangle.width <= 0 || rectangle.height <= 0 || rectangle.x < -epsilon || rectangle.y < -epsilon
      || rectangle.x + rectangle.width > plan.width + epsilon || rectangle.y + rectangle.height > plan.height + epsilon) failures.push(`矩形 ${index} 越界`);
    for (const other of rectangles.slice(index + 1)) {
      if (!(rectangle.x + rectangle.width <= other.x + epsilon || other.x + other.width <= rectangle.x + epsilon
        || rectangle.y + rectangle.height <= other.y + epsilon || other.y + other.height <= rectangle.y + epsilon)) failures.push(`矩形 ${index} 重叠`);
    }
  }
  for (const room of plan.placements) {
    if (Math.abs(room.video.width / room.video.height - ratioOf(ratios[room.index])) > 1e-6) failures.push(`房间 ${room.index} 比例错误`);
    if (strict && (Math.abs(room.video.width - room.width) > epsilon || Math.abs(room.video.height - room.height) > epsilon)) failures.push(`房间 ${room.index} 有窗内黑边`);
  }
  return [...new Set(failures)];
};
