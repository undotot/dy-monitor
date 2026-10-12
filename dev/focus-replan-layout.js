// 独立设计原型。当前算法直接取自正式源码；P/Q/R 不被正式构建引用。
import { calculateFocusLayout } from "../src/core/focus-layout.js";

export const DEFAULT_RATIO = 16 / 9;
export const DESIGNS = Object.freeze([
  { id: "P", title: "完整画面拼合", rule: "完整画面 / 原比例贴边", description: "重新比较底部跨整墙、右侧跨整墙两种结构。在观看尺寸合适的贴边候选中优先实际主画面面积，小窗完整显示。3 格全横屏的主画面未必比小窗大。" },
  { id: "Q", title: "主画面优先", rule: "主视频 ≥ 单窗最大面积的 60%", description: "先保证主画面足够大，再让小窗按统一短边排列。小窗完整、无黑边；剩余主界面显示黑底，窗外背景单独统计，不宣称矩形全部铺满。" },
  { id: "R", title: "规整铺满", rule: "原比例裁切 / 容器铺满", description: "主画面保留单窗最大面积的至少 52%，小窗容器采用规整行列。小视频等比 cover，完整铺满容器，但可能裁切四周；只有你选择后才接入这种行为。" }
]);
const normalizeRatio = (value) => Number.isFinite(value) && value > 0 ? value : DEFAULT_RATIO;
export const getRatios = (count, profile) => Array.from({ length: count - 1 }, (_, index) => {
  if (profile === "portrait") return 9 / 16;
  if (profile === "mixed") return [9 / 16, DEFAULT_RATIO, DEFAULT_RATIO][index % 3];
  if (profile === "varied") return [9 / 16, DEFAULT_RATIO, 4 / 3, 1, 21 / 9][index % 5];
  return DEFAULT_RATIO;
});
const fitVideo = (width, height, ratio, fit = "contain") => {
  const fittedWidth = fit === "cover" ? Math.max(width, height * ratio) : Math.min(width, height * ratio);
  return { width: fittedWidth, height: fittedWidth / ratio };
};
const comfort = (main, minimumShort) => Math.min(1, main.width / 640, main.height / 360, minimumShort / 112.5);
const areaOf = (rectangle) => rectangle.width * rectangle.height;
const mainRectangle = (width, height) => ({ x: 0, y: 0, width, height });
const COVER_FRACTIONS = Object.freeze([.6, .65, .7, .72, .75, .78, .8, .85, .9, .95]);

// 单侧结构加入连续求解的主窗断点，极长/极窄墙面也不受固定比例表限制。
const solveCoverFraction = (input, side) => {
  const { width, height, mainRatio, ratios, gap } = input;
  const horizontal = side === "right";
  const extent = horizontal ? width : height;
  const cellSpan = ((horizontal ? height : width) - (ratios.length - 1) * gap) / ratios.length;
  const target = areaOf(fitVideo(width, height, mainRatio)) * .52;
  let low = 0, high = 1 - gap / extent;
  for (let iteration = 0; iteration < 32; iteration++) {
    const fraction = (low + high) / 2;
    const main = mainRectangle(horizontal ? width * fraction : width, horizontal ? height : height * fraction);
    const mainVideoArea = areaOf(fitVideo(main.width, main.height, mainRatio));
    const largestSmall = (extent * (1 - fraction) - gap) * cellSpan;
    const valid = mainVideoArea >= target && mainVideoArea >= (ratios.length >= 2 ? 2.5 : 1.5) * largestSmall && areaOf(main) >= 1.5 * largestSmall;
    if (valid) high = fraction;
    else low = fraction;
  }
  return high;
};

/** @typedef {{index:number,region:string,x:number,y:number,width:number,height:number,ratio:number,video:{width:number,height:number},fit:string,retained:number}} Placement */

// 有界的均匀连续分组：余数分别放前面、后面。输入顺序始终不变。
const createPartitions = (ratios, start, end) => {
  if (start === end) return [{ bands: [], signature: "0" }];
  const partitions = [];
  const signatures = new Set();
  const count = end - start;
  for (let bandCount = 1; bandCount <= count; bandCount++) {
    for (const extraFirst of [true, false]) {
      const minimum = Math.floor(count / bandCount), extra = count % bandCount;
      const lengths = Array.from({ length: bandCount }, (_, index) => minimum + Number(extraFirst ? index < extra : index >= bandCount - extra));
      const signature = lengths.join("-");
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      let cursor = start;
      const bands = lengths.map((length) => {
        const members = ratios.slice(cursor, cursor + length);
        const band = { start: cursor, end: cursor + length, count: length,
          sumRatio: members.reduce((sum, value) => sum + value, 0), sumInverse: members.reduce((sum, value) => sum + 1 / value, 0),
          minimum: Math.min(...members), maximum: Math.max(...members),
          shortWidthSum: members.reduce((sum, value) => sum + Math.max(1, value), 0),
          shortHeightSum: members.reduce((sum, value) => sum + Math.max(1, 1 / value), 0),
          shortWidthMax: Math.max(...members.map((value) => Math.max(1, value))),
          shortHeightMax: Math.max(...members.map((value) => Math.max(1, 1 / value))) };
        cursor += length;
        return band;
      });
      partitions.push({ bands, signature });
    }
  }
  return partitions;
};

// 一区固定宽或高，按原比例反解另一边；行与列采用同一测量接口。
const measureNative = (partition, axis, fixed, gap) => {
  if (!partition.bands.length) return { width: 0, height: 0, area: 0, largestArea: 0, minimumShort: Infinity, maximumShort: 0, partition, axis };
  const rows = axis === "rows";
  const sumKey = rows ? "sumRatio" : "sumInverse";
  const spanKey = rows ? "width" : "height";
  const depthKey = rows ? "height" : "width";
  let span = fixed[spanKey];
  if (span === undefined) {
    const slope = partition.bands.reduce((sum, band) => sum + 1 / band[sumKey], 0);
    const internalGaps = partition.bands.reduce((sum, band) => sum + (band.count - 1) / band[sumKey], 0);
    span = (fixed[depthKey] - (partition.bands.length - 1) * gap + gap * internalGaps) / slope;
  }
  let depth = 0, area = 0, largestArea = 0, minimumShort = Infinity, maximumShort = 0;
  for (const band of partition.bands) {
    const size = (span - (band.count - 1) * gap) / band[sumKey];
    if (!Number.isFinite(size) || size <= 0) return null;
    depth += size;
    area += size ** 2 * band[sumKey];
    largestArea = Math.max(largestArea, size ** 2 * (rows ? band.maximum : 1 / band.minimum));
    minimumShort = Math.min(minimumShort, size * (rows ? Math.min(1, band.minimum) : Math.min(1, 1 / band.maximum)));
    maximumShort = Math.max(maximumShort, size * (rows ? Math.min(1, band.maximum) : Math.min(1, 1 / band.minimum)));
  }
  depth += (partition.bands.length - 1) * gap;
  return { width: rows ? span : depth, height: rows ? depth : span, area, largestArea, minimumShort, maximumShort, partition, axis };
};

const placeNative = (region, ratios, gap, name, x, y) => {
  const placements = [];
  let bandCursor = 0;
  const rows = region.axis === "rows";
  for (const band of region.partition.bands) {
    const size = ((rows ? region.width : region.height) - (band.count - 1) * gap) / (rows ? band.sumRatio : band.sumInverse);
    let cursor = 0;
    for (let index = band.start; index < band.end; index++) {
      const width = rows ? size * ratios[index] : size, height = rows ? size : size / ratios[index];
      placements.push({ index, region: name, x: x + (rows ? cursor : bandCursor), y: y + (rows ? bandCursor : cursor),
        width, height, ratio: ratios[index], fit: "contain", retained: 1, video: { width, height } });
      cursor += (rows ? width : height) + gap;
    }
    bandCursor += size + gap;
  }
  return placements;
};

const finalize = (plan, input) => ({ ...plan, mode: input.mode, width: input.width, height: input.height, gap: input.gap,
  mainVideo: fitVideo(plan.main.width, plan.main.height, input.mainRatio),
  quality: comfort(plan.main, plan.minimumShort), constrained: comfort(plan.main, plan.minimumShort) < .98 });

const calculateNative = (input, partitions) => {
  const { width, height, mainRatio, ratios, gap, previous } = input;
  const candidates = [];
  let bestQuality = 0;
  for (let rightCount = 0; rightCount <= ratios.length; rightCount++) {
    for (const rightPartition of partitions.get(`0:${rightCount}`)) {
      for (const bottomPartition of partitions.get(`${rightCount}:${ratios.length}`)) {
        for (const rightAxis of ["rows", "columns"]) {
          for (const bottomAxis of ["rows", "columns"]) {
            for (const topology of ["bottom-wide", "right-tall"]) {
              let right, bottom, main;
              if (topology === "bottom-wide") {
                bottom = measureNative(bottomPartition, bottomAxis, { width }, gap);
                if (!bottom) continue;
                const mainHeight = height - bottom.height - (bottomPartition.bands.length ? gap : 0);
                if (mainHeight <= 0) continue;
                right = measureNative(rightPartition, rightAxis, { height: mainHeight }, gap);
                if (!right) continue;
                main = mainRectangle(width - right.width - (rightPartition.bands.length ? gap : 0), mainHeight);
              } else {
                right = measureNative(rightPartition, rightAxis, { height }, gap);
                if (!right) continue;
                const mainWidth = width - right.width - (rightPartition.bands.length ? gap : 0);
                if (mainWidth <= 0) continue;
                bottom = measureNative(bottomPartition, bottomAxis, { width: mainWidth }, gap);
                if (!bottom) continue;
                main = mainRectangle(mainWidth, height - bottom.height - (bottomPartition.bands.length ? gap : 0));
              }
              if (main.width <= 0 || main.height <= 0 || areaOf(main) < 1.5 * Math.max(right.largestArea, bottom.largestArea) - 1e-7) continue;
              const minimumShort = Math.min(right.minimumShort, bottom.minimumShort);
              const quality = comfort(main, minimumShort);
              const candidate = { main, right, bottom, minimumShort, quality, rightCount, topology, complete: true,
                mainArea: areaOf(fitVideo(main.width, main.height, mainRatio)),
                signature: `P:${topology}:${rightCount}:${rightAxis}:${rightPartition.signature}:${bottomAxis}:${bottomPartition.signature}` };
              bestQuality = Math.max(bestQuality, quality);
              candidates.push(candidate);
            }
          }
        }
      }
    }
  }
  const eligible = candidates.filter((candidate) => candidate.quality >= bestQuality * .85 - 1e-7);
  const dualRegion = ratios.length >= 4 ? eligible.filter((candidate) => candidate.rightCount > 0 && candidate.rightCount < ratios.length) : [];
  let best = null;
  for (const candidate of dualRegion.length ? dualRegion : eligible) {
    if (!best || candidate.mainArea > best.mainArea + width * height * .003
      || Math.abs(candidate.mainArea - best.mainArea) <= width * height * .003 && (
        candidate.signature === previous && best.signature !== previous
        || best.signature !== previous && candidate.minimumShort > best.minimumShort + .01)) best = candidate;
  }
  if (!best) {
    const fallback = calculateMainFirst({ ...input, mode: "Q" }, partitions);
    return fallback ? { ...fallback, mode: "P", fallback: true, complete: false, signature: "P:inset" } : null;
  }
  const placements = [
    ...placeNative(best.right, ratios, gap, "right", best.main.width + gap, 0),
    ...placeNative(best.bottom, ratios, gap, "bottom", 0, best.main.height + gap)
  ];
  return finalize({ ...best, placements, qualityReference: bestQuality }, input);
};

const measurePacked = (partition, axis, size, gap) => {
  if (!partition.bands.length) return { width: 0, height: 0, partition, axis };
  const rows = axis === "rows";
  let span = 0, depth = 0;
  for (const band of partition.bands) {
    span = Math.max(span, size * (rows ? band.shortWidthSum : band.shortHeightSum) + (band.count - 1) * gap);
    depth += size * (rows ? band.shortHeightMax : band.shortWidthMax);
  }
  depth += (partition.bands.length - 1) * gap;
  return { width: rows ? span : depth, height: rows ? depth : span, partition, axis };
};

const placePacked = (region, size, ratios, gap, name, x, y) => {
  const placements = [];
  const rows = region.axis === "rows";
  let bandCursor = 0;
  for (const band of region.partition.bands) {
    let cursor = 0;
    for (let index = band.start; index < band.end; index++) {
      const width = size * Math.max(1, ratios[index]), height = size * Math.max(1, 1 / ratios[index]);
      placements.push({ index, region: name, x: x + (rows ? cursor : bandCursor), y: y + (rows ? bandCursor : cursor),
        width, height, ratio: ratios[index], fit: "contain", retained: 1, video: { width, height } });
      cursor += (rows ? width : height) + gap;
    }
    bandCursor += size * (rows ? band.shortHeightMax : band.shortWidthMax) + gap;
  }
  return placements;
};

const calculateMainFirst = (input, partitions) => {
  const { width, height, mainRatio, ratios, gap, previous } = input;
  const policy = input.packingPolicy;
  const videoTarget = areaOf(fitVideo(width, height, mainRatio)) * (policy?.mainVideoShare ?? .6);
  const largestCoefficient = Math.max(...ratios.map((ratio) => Math.max(ratio, 1 / ratio)));
  const smallAreaCoefficient = ratios.reduce((sum, ratio) => sum + Math.max(ratio, 1 / ratio), 0);
  const candidates = [];
  let best = null;
  // 3–4 格允许单侧；5–16 格的完整画面方案维持右侧和底部都有小窗。
  for (let rightCount = ratios.length >= 4 ? 1 : 0; rightCount <= (ratios.length >= 4 ? ratios.length - 1 : ratios.length); rightCount++) {
    for (const rightPartition of partitions.get(`0:${rightCount}`)) {
      for (const bottomPartition of partitions.get(`${rightCount}:${ratios.length}`)) {
        for (const rightAxis of ["rows", "columns"]) {
          for (const bottomAxis of ["rows", "columns"]) {
            const measure = (size) => {
              const right = measurePacked(rightPartition, rightAxis, size, gap), bottom = measurePacked(bottomPartition, bottomAxis, size, gap);
              const main = mainRectangle(width - right.width - (rightCount ? gap : 0), height - bottom.height - (rightCount < ratios.length ? gap : 0));
              if (main.width <= 0 || main.height <= 0 || right.height > main.height + 1e-7 || bottom.width > width + 1e-7) return null;
              const mainArea = areaOf(fitVideo(main.width, main.height, mainRatio));
              if (mainArea < videoTarget - 1e-7 || mainArea < 2.5 * largestCoefficient * size ** 2 - 1e-7) return null;
              return { main, mainArea, right, bottom };
            };
            let low = 0, high = Math.max(width, height);
            for (let iteration = 0; iteration < 32; iteration++) {
              const middle = (low + high) / 2;
              if (measure(middle)) low = middle;
              else high = middle;
            }
            if (low <= 1e-7) continue;
            const factors = new Set(policy ? [1, .95, .85] : [1]);
            // 主窗与视频比例相等的连续断点，避免离散尺寸遗漏低黑边布局。
            if (policy?.optimizeMainBlack) {
              const difference = (size) => {
                const right = measurePacked(rightPartition, rightAxis, size, gap);
                const bottom = measurePacked(bottomPartition, bottomAxis, size, gap);
                return width - right.width - (rightCount ? gap : 0)
                  - mainRatio * (height - bottom.height - (rightCount < ratios.length ? gap : 0));
              };
              const initial = difference(0), end = difference(low);
              if (Math.abs(end - initial) > 1e-9) {
                const factor = -initial / (end - initial);
                if (factor > 0 && factor <= 1) factors.add(factor);
              }
            }
            for (const factor of factors) {
              const size = low * factor, measured = measure(size);
              if (!measured) continue;
              const candidate = { ...measured, minimumShort: size, size, rightCount, complete: false, backdrop: "black", topology: "inset",
                coveredArea: areaOf(measured.main) + smallAreaCoefficient * size ** 2,
                visibleArea: measured.mainArea + smallAreaCoefficient * size ** 2,
                signature: `${policy?.id ?? "Q"}:${rightCount}:${rightAxis}:${rightPartition.signature}:${bottomAxis}:${bottomPartition.signature}${policy ? `:${factor}` : ""}` };
              if (policy) { candidates.push(candidate); continue; }
              if (!best || size > best.size + .01 || Math.abs(size - best.size) <= .01 && (
                candidate.signature === previous && best.signature !== previous || best.signature !== previous && candidate.mainArea > best.mainArea + .01)) best = candidate;
            }
          }
        }
      }
    }
  }
  if (policy) {
    const bestSize = Math.max(0, ...candidates.map((candidate) => candidate.size));
    const minimumSize = Math.min(bestSize * .85, policy.minimumShort ?? Infinity);
    const score = policy.objective === "covered" ? "coveredArea" : "visibleArea";
    const tolerance = width * height * .002;
    const eligible = candidates.filter((candidate) => candidate.size >= minimumSize - 1e-7);
    const maximumCoverage = Math.max(0, ...eligible.map((candidate) => candidate.coveredArea));
    for (const candidate of candidates) {
      if (candidate.size < minimumSize - 1e-7) continue;
      if (policy.optimizeMainBlack) {
        if (candidate.coveredArea < maximumCoverage - width * height * (policy.coverageSlack ?? 0) - 1e-7) continue;
        const black = 1 - candidate.mainArea / areaOf(candidate.main);
        const bestBlack = best ? 1 - best.mainArea / areaOf(best.main) : Infinity;
        if (!best || black < bestBlack - 1e-9 || Math.abs(black - bestBlack) <= 1e-9 && (
          candidate.visibleArea > best.visibleArea + tolerance || Math.abs(candidate.visibleArea - best.visibleArea) <= tolerance && candidate.size > best.size + .01)) best = candidate;
        continue;
      }
      if (!best || candidate[score] > best[score] + tolerance || Math.abs(candidate[score] - best[score]) <= tolerance && (
        candidate.signature === previous && best.signature !== previous || best.signature !== previous && (
          candidate.visibleArea > best.visibleArea + tolerance || Math.abs(candidate.visibleArea - best.visibleArea) <= tolerance && candidate.size > best.size + .01))) best = candidate;
    }
  }
  if (!best) return null;
  const placements = [...placePacked(best.right, best.size, ratios, gap, "right", best.main.width + gap, 0),
    ...placePacked(best.bottom, best.size, ratios, gap, "bottom", 0, best.main.height + gap)];
  return finalize({ ...best, placements }, input);
};

const createGridOptions = (partitions, width, height, ratios, gap, areaLimit) => {
  const candidates = [];
  for (const partition of partitions) {
    if (!partition.bands.length) { candidates.push({ width: 0, height: 0, area: 0, retainedArea: 0, minimumShort: Infinity, partition, axis: "rows" }); continue; }
    for (const axis of ["rows", "columns"]) {
      const rows = axis === "rows";
      const depth = ((rows ? height : width) - (partition.bands.length - 1) * gap) / partition.bands.length;
      if (depth <= 0) continue;
      let area = 0, retainedArea = 0, minimumShort = Infinity, valid = true;
      for (const band of partition.bands) {
        const span = ((rows ? width : height) - (band.count - 1) * gap) / band.count;
        const cellWidth = rows ? span : depth, cellHeight = rows ? depth : span;
        const cellArea = cellWidth * cellHeight;
        if (span <= 0 || cellArea > areaLimit + 1e-7) { valid = false; break; }
        minimumShort = Math.min(minimumShort, cellWidth, cellHeight);
        for (let index = band.start; index < band.end; index++) {
          const cellRatio = cellWidth / cellHeight;
          const retained = Math.min(cellRatio / ratios[index], ratios[index] / cellRatio);
          area += cellArea;
          retainedArea += cellArea * retained;
        }
      }
      if (valid) candidates.push({ width, height, area, retainedArea, minimumShort, partition, axis });
    }
  }
  return candidates;
};

const placeGrid = (region, ratios, gap, name, x, y) => {
  const placements = [];
  const rows = region.axis === "rows";
  const depth = ((rows ? region.height : region.width) - (region.partition.bands.length - 1) * gap) / region.partition.bands.length;
  let bandCursor = 0;
  for (const band of region.partition.bands) {
    const span = ((rows ? region.width : region.height) - (band.count - 1) * gap) / band.count;
    let cursor = 0;
    for (let index = band.start; index < band.end; index++) {
      const width = rows ? span : depth, height = rows ? depth : span;
      placements.push({ index, region: name, x: x + (rows ? cursor : bandCursor), y: y + (rows ? bandCursor : cursor), width, height,
        ratio: ratios[index], fit: "cover", retained: Math.min(width / height / ratios[index], ratios[index] / (width / height)),
        video: fitVideo(width, height, ratios[index], "cover") });
      cursor += span + gap;
    }
    bandCursor += depth + gap;
  }
  return placements;
};

const calculateCover = (input, partitions) => {
  const { width, height, mainRatio, ratios, gap, previous } = input;
  const jobs = [];
  const mainVideoTarget = areaOf(fitVideo(width, height, mainRatio)) * .52;
  const rightFraction = solveCoverFraction(input, "right"), bottomFraction = solveCoverFraction(input, "bottom");
  let bestQuality = 0;
  for (let rightCount = 0; rightCount <= ratios.length; rightCount++) {
    const widthFractions = !rightCount ? [1] : rightCount === ratios.length ? [...COVER_FRACTIONS, rightFraction] : COVER_FRACTIONS;
    const heightFractions = rightCount === ratios.length ? [1] : !rightCount ? [...COVER_FRACTIONS, bottomFraction] : COVER_FRACTIONS;
    for (const widthFraction of widthFractions) {
      for (const heightFraction of heightFractions) {
        for (const topology of ["bottom-wide", "right-tall"]) {
          const main = mainRectangle(width * widthFraction, height * heightFraction);
          const rightWidth = width - main.width - (rightCount ? gap : 0);
          const bottomHeight = height - main.height - (rightCount < ratios.length ? gap : 0);
          if (rightWidth < 0 || bottomHeight < 0) continue;
          const mainArea = areaOf(fitVideo(main.width, main.height, mainRatio));
          if (mainArea < mainVideoTarget - 1e-7) continue;
          const areaLimit = Math.min(areaOf(main) / 1.5, mainArea / (ratios.length >= 2 ? 2.5 : 1.5));
          const right = createGridOptions(partitions.get(`0:${rightCount}`), rightWidth, topology === "right-tall" ? height : main.height, ratios, gap, areaLimit);
          const bottom = createGridOptions(partitions.get(`${rightCount}:${ratios.length}`), topology === "bottom-wide" ? width : main.width, bottomHeight, ratios, gap, areaLimit);
          if (!right.length || !bottom.length) continue;
          const minimumShort = Math.min(Math.max(...right.map((region) => region.minimumShort)), Math.max(...bottom.map((region) => region.minimumShort)));
          bestQuality = Math.max(bestQuality, comfort(main, minimumShort));
          jobs.push({ main, mainArea, right, bottom, topology, rightCount, widthFraction, heightFraction });
        }
      }
    }
  }
  let best = null, bestDual = null;
  const isBetter = (candidate, incumbent) => !incumbent || candidate.retention > incumbent.retention + .002 || Math.abs(candidate.retention - incumbent.retention) <= .002 && (
    candidate.signature === previous && incumbent.signature !== previous || incumbent.signature !== previous && candidate.mainArea > incumbent.mainArea + .01);
  for (const job of jobs) {
    for (const right of job.right) {
      for (const bottom of job.bottom) {
        const minimumShort = Math.min(right.minimumShort, bottom.minimumShort);
        if (comfort(job.main, minimumShort) < bestQuality * .85 - 1e-7) continue;
        const retention = (right.retainedArea + bottom.retainedArea) / (right.area + bottom.area);
        const signature = `R:${job.topology}:${job.rightCount}:${job.widthFraction}:${job.heightFraction}:${right.axis}:${right.partition.signature}:${bottom.axis}:${bottom.partition.signature}`;
        const candidate = { main: job.main, mainArea: job.mainArea, right, bottom, topology: job.topology, rightCount: job.rightCount, minimumShort, retention, signature, complete: true };
        if (isBetter(candidate, best)) best = candidate;
        if (job.rightCount > 0 && job.rightCount < ratios.length && isBetter(candidate, bestDual)) bestDual = candidate;
      }
    }
  }
  if (ratios.length >= 4 && bestDual) best = bestDual;
  if (!best) return null;
  const placements = [...placeGrid(best.right, ratios, gap, "right", best.main.width + gap, 0),
    ...placeGrid(best.bottom, ratios, gap, "bottom", 0, best.main.height + gap)];
  return finalize({ ...best, placements, qualityReference: bestQuality }, input);
};

export const calculateDesign = ({ mode = "P", width, height, mainRatio = DEFAULT_RATIO, secondaryRatios = [], gap = 1, previous = null, packingPolicy = null }) => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || secondaryRatios.length > 15) return null;
  mainRatio = normalizeRatio(mainRatio);
  const ratios = secondaryRatios.map(normalizeRatio);
  if (mode === "current") {
    const plan = calculateFocusLayout({ width, height, mainRatio, secondaryRatios: ratios, previous });
    return { ...plan, width, height, mode, main: { ...plan.main, x: 0, y: 0 }, placements: plan.placements.map((room) => ({ ...room, ratio: ratios[room.index], fit: "contain", retained: 1,
      x: room.x + (room.region === "right" ? plan.main.width + plan.gap : 0), y: room.y + (room.region === "bottom" ? plan.main.height + plan.gap : 0) })) };
  }
  if (!DESIGNS.some((design) => design.id === mode)) return null;
  gap = Math.min(Math.max(0, Number.isFinite(gap) ? gap : 1), width / (ratios.length + 2) / 4, height / (ratios.length + 2) / 4);
  const input = { mode, width, height, mainRatio, ratios, gap, previous, packingPolicy };
  if (!ratios.length) return finalize({ main: mainRectangle(width, height), placements: [], minimumShort: Infinity, complete: true, topology: "single", signature: `${mode}:single` }, input);
  const partitions = new Map();
  for (let split = 0; split <= ratios.length; split++) {
    partitions.set(`0:${split}`, createPartitions(ratios, 0, split));
    partitions.set(`${split}:${ratios.length}`, createPartitions(ratios, split, ratios.length));
  }
  if (mode === "P") return calculateNative(input, partitions);
  if (mode === "Q") return calculateMainFirst(input, partitions);
  return calculateCover(input, partitions);
};

export const summarizeDesign = (plan) => {
  if (!plan) return null;
  const wallArea = plan.width * plan.height, mainArea = areaOf(plan.main), mainVideoArea = areaOf(plan.mainVideo);
  const smallContainerArea = plan.placements.reduce((sum, room) => sum + areaOf(room), 0);
  const smallVisibleArea = plan.placements.reduce((sum, room) => sum + (room.fit === "cover" ? areaOf(room) : areaOf(room.video)), 0);
  const largestSmallVisibleArea = Math.max(0, ...plan.placements.map((room) => room.fit === "cover" ? areaOf(room) : areaOf(room.video)));
  const averageRetention = smallVisibleArea ? plan.placements.reduce((sum, room) => sum + (room.fit === "cover" ? areaOf(room) : areaOf(room.video)) * room.retained, 0) / smallVisibleArea : 1;
  return { mainVideoRatio: mainVideoArea / wallArea, mainVideoArea, mainProminence: largestSmallVisibleArea ? mainVideoArea / largestSmallVisibleArea : 0,
    fillRatio: (mainVideoArea + smallVisibleArea) / wallArea, coveredRatio: (mainArea + smallContainerArea) / wallArea,
    backgroundRatio: Math.max(0, 1 - (mainArea + smallContainerArea) / wallArea),
    mainBlackRatio: mainArea ? Math.max(0, 1 - mainVideoArea / mainArea) : 0,
    smallBlackRatio: smallContainerArea ? Math.max(0, 1 - smallVisibleArea / smallContainerArea) : 0,
    averageRetention, minimumRetention: Math.min(1, ...plan.placements.map((room) => room.retained)),
    minimumShort: plan.placements.length ? Math.min(...plan.placements.map((room) => Math.min(room.width, room.height, room.video.width, room.video.height))) : 0,
    rightCount: plan.placements.filter((room) => room.region === "right").length, bottomCount: plan.placements.filter((room) => room.region === "bottom").length };
};

export const validateDesign = (plan, ratios) => {
  if (!plan) return ["无可行布局"];
  const failures = [], epsilon = .02;
  if (plan.main.x !== 0 || plan.main.y !== 0) failures.push("主窗未位于左上");
  if (plan.placements.length !== ratios.length || new Set(plan.placements.map((room) => room.index)).size !== ratios.length) failures.push("房间缺失或重复");
  const rectangles = [plan.main, ...plan.placements];
  for (const [index, rectangle] of rectangles.entries()) {
    if (![rectangle.x, rectangle.y, rectangle.width, rectangle.height].every(Number.isFinite) || rectangle.width <= 0 || rectangle.height <= 0
      || rectangle.x < -epsilon || rectangle.y < -epsilon || rectangle.x + rectangle.width > plan.width + epsilon || rectangle.y + rectangle.height > plan.height + epsilon) failures.push("越界或尺寸无效");
    for (const other of rectangles.slice(index + 1)) {
      if (Math.min(rectangle.x + rectangle.width, other.x + other.width) - Math.max(rectangle.x, other.x) > epsilon
        && Math.min(rectangle.y + rectangle.height, other.y + other.height) - Math.max(rectangle.y, other.y) > epsilon) failures.push("窗口重叠");
    }
  }
  for (const room of plan.placements) {
    if (Math.abs(room.video.width / room.video.height - normalizeRatio(ratios[room.index])) > 1e-6) failures.push("视频比例被改变");
    if (plan.mode !== "current" && room.fit !== "cover" && (Math.abs(room.width - room.video.width) > epsilon || Math.abs(room.height - room.video.height) > epsilon)) failures.push("小窗有黑边");
    if (room.fit === "cover" && (room.video.width < room.width - epsilon || room.video.height < room.height - epsilon)) failures.push("裁切容器未被填满");
  }
  return [...new Set(failures)];
};
