// 统一格布局引擎（放大模式）：
//   主窗占 S×S 个单元格（正方形跨度）；所有副窗占用同一个 w×h 单元格，严格等宽等高。
//   行距 gapY = gapX * 9 / 16 —— 该比例下，单元格、主窗、整体容器三者同时严格 16:9：
//     单元格: w / h = w / (w/16*9) = 16/9
//     主窗:   (S*w + (S-1)*gapX) / (S*h + (S-1)*gapY) = 16/9  ⇔ a = b（必须正方形跨度）
//     容器:   (cols*w + (cols-1)*gapX) / (rows*h + (rows-1)*gapY) 仅在 cols = rows 时为 16/9
//   因此主窗跨度固定为正方形；行列数可不等，容器保持外接矩形。
//   墙面剩余面积是真实代价：不做二次拉伸，只报真实数值。

export const GRID_LIMITS = Object.freeze({
  mainMinWidth: 640,
  mainMinHeight: 360,
  cellMinWidth: 120,
  cellMinHeight: 60,
  minCellWidthFloor: 48,
  spanMax: 6,
  gapCandidates: [0.5, 3, 6]
});

const RATIO = 16 / 9;
const GAP_RATIO = 9 / 16;

export const ratioOf = (value) => (Number.isFinite(value) && value > 0 ? value : RATIO);

export const fitVideo = (width, height, ratio) => {
  const r = ratioOf(ratio);
  const fittedWidth = Math.min(width, height * r);
  return { width: fittedWidth, height: fittedWidth / r };
};

export const visibleOf = (cw, ch, ratio) => {
  const r = ratioOf(ratio);
  const cellRatio = cw / ch;
  const val = Math.min(cellRatio / r, r / cellRatio);
  return Math.abs(val - 1) < 1e-9 ? 1 : Math.max(0, Math.min(1, val));
};

const qualityOf = (width, height) => Math.min(1, width / GRID_LIMITS.mainMinWidth, height / GRID_LIMITS.mainMinHeight);

const cellFloorOf = (width, height) => Math.min(GRID_LIMITS.cellMinWidth, width / 8, GRID_LIMITS.cellMinHeight * RATIO);

// 单个候选：主窗跨度 S×S，右侧 rc 列、下方 br 行装配副窗。
const buildCandidate = ({ width, height, S, rc, br, gapX, count }) => {
  const gapY = gapX * GAP_RATIO;
  const cols = S + rc;
  const rows = S + br;
  const rightCap = rc * S;
  const bottomCap = br * cols;
  if (rightCap + bottomCap < count) return null;
  // 宽度与高度约束同时成立时取最小值；两者共用同一 w，保证格子严格 16:9。
  const wByWidth = (width - (cols - 1) * gapX) / cols;
  const wByHeight = (height - (rows - 1) * gapY) / rows * RATIO;
  const w = Math.min(wByWidth, wByHeight);
  if (!(w > 0)) return null;
  const h = w / RATIO;
  if (w < cellFloorOf(width, height)) return null;
  const mainWidth = S * w + (S - 1) * gapX;
  const mainHeight = S * h + (S - 1) * gapY;
  const cellArea = w * h;
  if (mainWidth * mainHeight < 1.5 * cellArea - 1e-9) return null;
  const containerW = cols * w + (cols - 1) * gapX;
  const containerH = rows * h + (rows - 1) * gapY;
  if (containerW > width + 1e-6 || containerH > height + 1e-6) return null;

  const slots = [];
  for (let c = 0; c < rc; c++) {
    for (let r = 0; r < S; r++) slots.push({ c: S + c, r, region: "right" });
  }
  let need = count - slots.length;
  if (need < 0 || need > bottomCap) return null;
  for (let r = 0; r < br && need > 0; r++) {
    for (let c = 0; c < cols && need > 0; c++, need--) slots.push({ c, r: S + r, region: "bottom" });
  }
  if (slots.length !== count) return null;

  const totalSlots = cols * rows;
  const emptySlots = totalSlots - count - S * S;
  const occupiedArea = mainWidth * mainHeight + count * cellArea;
  const containerArea = containerW * containerH;
  // 综合评分：先看真实视频面积占比，再用空槽与容器外余量作惩罚项。
  const videoFill = occupiedArea / (width * height);
  const emptyPenalty = emptySlots / totalSlots;
  const score = videoFill - 0.05 * emptyPenalty;

  return {
    S, rc, br, cols, rows, gapX, gapY,
    mainWidth, mainHeight, containerW, containerH,
    cellWidth: w, cellHeight: h,
    offsetX: Math.max(0, (width - containerW) / 2),
    offsetY: Math.max(0, (height - containerH) / 2),
    slots, videoFill, emptySlots, totalSlots, containerArea, occupiedArea, score
  };
};

export const signatureOf = (best, count) => `G${best.S}:${best.cols}x${best.rows}:${best.rc}:${best.br}:${count}`;

// 主入口：返回 { main, placements, cell, containerW/H, offsetX/Y, ... }
export const calculateGridLayout = ({ width, height, mainRatio = RATIO, secondaryRatios = [], previous = null }) => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 2 || height <= 2) return null;
  const count = secondaryRatios.length;

  if (!count) {
    const mainWidth = Math.min(width, height * RATIO);
    const mainHeight = mainWidth / RATIO;
    const mainVideo = fitVideo(mainWidth, mainHeight, mainRatio);
    const quality = qualityOf(mainWidth, mainHeight);
    return {
      family: "G1", absolute: true, signature: "G1",
      main: { x: Math.max(0, (width - mainWidth) / 2), y: Math.max(0, (height - mainHeight) / 2), width: mainWidth, height: mainHeight },
      mainVideo, mainArea: mainWidth * mainHeight,
      cell: null, cellRatio: RATIO, placements: [],
      gap: 0, gapX: 0, gapY: 0,
      containerW: mainWidth, containerH: mainHeight,
      offsetX: Math.max(0, (width - mainWidth) / 2), offsetY: Math.max(0, (height - mainHeight) / 2),
      viewportFillRatio: mainWidth * mainHeight / (width * height),
      videoViewportFillRatio: mainVideo.width * mainVideo.height / (width * height),
      layoutFillRatio: 1, wallMarginRatio: 1 - mainWidth * mainHeight / (width * height),
      mainVisible: mainVideo.width * mainVideo.height / (mainWidth * mainHeight),
      meanVisible: 1, mainShare: mainWidth * mainHeight / (width * height),
      dominant: true, bothRegions: false, emptySlots: 0, totalSlots: 1,
      quality, constrained: quality < 1 - 1e-7, overflow: false
    };
  }

  const candidates = [];
  const spanMax = Math.min(GRID_LIMITS.spanMax, count + 1);
  for (let S = 1; S <= spanMax; S++) {
    for (let rc = 0; rc <= Math.min(4, count); rc++) {
      for (let br = 0; br <= Math.min(4, count); br++) {
        if (!rc && !br) continue;
        for (const gapX of GRID_LIMITS.gapCandidates) {
          const candidate = buildCandidate({ width, height, S, rc, br, gapX, count });
          if (candidate) candidates.push(candidate);
        }
      }
    }
  }
  if (!candidates.length) return null;

  const scoreOf = (candidate) => candidate.score;
  let best = candidates[0];
  for (const candidate of candidates) if (scoreOf(candidate) > scoreOf(best) + 1e-9) best = candidate;

  // 临界尺寸稳定：原方案仍在 0.995 以内且视频面积差距 < 2% 时沿用，避免拖动窗口时抖动。
  const previousKey = previous || null;
  if (previousKey) {
    const stable = candidates.filter((candidate) => signatureOf(candidate, count) === previousKey);
    if (stable.length) {
      const stableBest = stable.reduce((a, b) => (scoreOf(b) > scoreOf(a) ? b : a));
      if (scoreOf(stableBest) >= scoreOf(best) * 0.995 && best.videoFill - stableBest.videoFill < 0.02) best = stableBest;
    }
  }

  const { S, rc, br, cols, rows, gapX, gapY, mainWidth, mainHeight, cellWidth, cellHeight, offsetX, offsetY, containerW, containerH } = best;
  const mainVideo = fitVideo(mainWidth, mainHeight, mainRatio);
  const mainArea = mainWidth * mainHeight;
  const cellArea = cellWidth * cellHeight;

  const placements = best.slots.map((slot, index) => {
    const ratio = ratioOf(secondaryRatios[index]);
    const video = fitVideo(cellWidth, cellHeight, ratio);
    return {
      index,
      region: slot.region,
      c: slot.c,
      r: slot.r,
      x: offsetX + slot.c * (cellWidth + gapX),
      y: offsetY + slot.r * (cellHeight + gapY),
      width: cellWidth,
      height: cellHeight,
      video,
      visible: visibleOf(cellWidth, cellHeight, ratio),
      ratio
    };
  });

  const totalSlots = cols * rows;
  const emptySlots = totalSlots - count - S * S;
  const quality = qualityOf(mainWidth, mainHeight);
  const wallMargin = totalSlots ? emptySlots / totalSlots : 0;
  return {
    family: "G", absolute: true, signature: signatureOf(best, count),
    S, cols, rows, rc, br,
    main: { x: offsetX, y: offsetY, width: mainWidth, height: mainHeight },
    mainVideo, mainArea,
    cell: { width: cellWidth, height: cellHeight }, cellRatio: RATIO,
    placements,
    gap: gapX, gapX, gapY,
    containerW, containerH, offsetX, offsetY,
    rightCount: placements.filter((room) => room.region === "right").length,
    bottomCount: placements.filter((room) => room.region === "bottom").length,
    leftCount: 0,
    viewportFillRatio: (mainArea + count * cellArea) / (width * height),
    videoViewportFillRatio: (mainVideo.width * mainVideo.height + placements.reduce((sum, room) => sum + room.video.width * room.video.height, 0)) / (width * height),
    layoutFillRatio: (mainArea + count * cellArea) / (containerW * containerH),
    wallMarginRatio: wallMargin,
    emptySlots, totalSlots,
    mainVisible: mainVideo.width * mainVideo.height / mainArea,
    meanVisible: count ? placements.reduce((sum, room) => sum + room.visible, 0) / count : 1,
    mainShare: mainArea / (width * height),
    dominant: true, bothRegions: rc > 0 && br > 0,
    quality, constrained: quality < 0.98, overflow: false
  };
};
