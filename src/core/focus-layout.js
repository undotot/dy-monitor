// 方案 A 放大模式布局引擎：
// 1. 所有画面严格 16:9（主窗与所有小窗均为 16:9，画面内部 0 黑边，无拉伸无裁切）；
// 2. 所有小窗大小严格一致（完全等宽等高）；
// 3. 大屏与小屏保持合理的黄金比例：大屏宽高等于小屏宽高的 S 倍（S=2 或 S=3，面积为 4 或 9 倍）；
// 4. 整个监控墙组合容器在视口中居中，多余宽度/高度在容器外留黑（视口四周留黑，直播间内零黑边）。

export const FOCUS_LIMITS = Object.freeze({ mainMin: 640, mainMinHeight: 360, smallMin: 120, mainAreaRatio: 1.5 });

const DEFAULT_RATIO = 16 / 9;
const ratioOf = (value) => (Number.isFinite(value) && value > 0 ? value : DEFAULT_RATIO);
const fitVideo = (width, height, ratio) => {
  const r = ratioOf(ratio);
  const fittedWidth = Math.min(width, height * r);
  return { width: fittedWidth, height: fittedWidth / r };
};
const visibleOf = (cw, ch, ratio) => {
  const r = ratioOf(ratio);
  const cellRatio = cw / ch;
  const val = Math.min(cellRatio / r, r / cellRatio);
  return Math.abs(val - 1) < 1e-9 ? 1 : Math.max(0, Math.min(1, val));
};

// 3 至 16 房间（以及 1、2 房间）的方案 A 拓扑规范表
// S: 主屏占据的网格跨度 (S x S)
// cols, rows: 整体紧凑网格的列数与行数
// smalls: 所有小屏在 (col, row) 网格中的严格排布坐标
export const SCHEME_A_SPECS = Object.freeze({
  1: { S: 1, cols: 1, rows: 1, smalls: [] },
  2: { S: 2, cols: 3, rows: 2, smalls: [{ c: 2, r: 0 }] },
  3: { S: 2, cols: 3, rows: 2, smalls: [{ c: 2, r: 0 }, { c: 2, r: 1 }] },
  4: { S: 3, cols: 4, rows: 3, smalls: [{ c: 3, r: 0 }, { c: 3, r: 1 }, { c: 3, r: 2 }] },
  5: { S: 2, cols: 4, rows: 2, smalls: [{ c: 2, r: 0 }, { c: 2, r: 1 }, { c: 3, r: 0 }, { c: 3, r: 1 }] },
  6: { S: 2, cols: 3, rows: 3, smalls: [{ c: 2, r: 0 }, { c: 2, r: 1 }, { c: 0, r: 2 }, { c: 1, r: 2 }, { c: 2, r: 2 }] },
  7: { S: 3, cols: 5, rows: 3, smalls: [{ c: 3, r: 0 }, { c: 3, r: 1 }, { c: 3, r: 2 }, { c: 4, r: 0 }, { c: 4, r: 1 }, { c: 4, r: 2 }] },
  8: { S: 3, cols: 4, rows: 4, smalls: [{ c: 3, r: 0 }, { c: 3, r: 1 }, { c: 3, r: 2 }, { c: 0, r: 3 }, { c: 1, r: 3 }, { c: 2, r: 3 }, { c: 3, r: 3 }] },
  9: { S: 2, cols: 4, rows: 3, smalls: [{ c: 2, r: 0 }, { c: 2, r: 1 }, { c: 3, r: 0 }, { c: 3, r: 1 }, { c: 0, r: 2 }, { c: 1, r: 2 }, { c: 2, r: 2 }, { c: 3, r: 2 }] },
  10: { S: 3, cols: 6, rows: 3, smalls: [{ c: 3, r: 0 }, { c: 3, r: 1 }, { c: 3, r: 2 }, { c: 4, r: 0 }, { c: 4, r: 1 }, { c: 4, r: 2 }, { c: 5, r: 0 }, { c: 5, r: 1 }, { c: 5, r: 2 }] },
  11: { S: 3, cols: 5, rows: 4, smalls: [{ c: 3, r: 0 }, { c: 3, r: 1 }, { c: 3, r: 2 }, { c: 4, r: 0 }, { c: 4, r: 1 }, { c: 4, r: 2 }, { c: 0, r: 3 }, { c: 1, r: 3 }, { c: 2, r: 3 }, { c: 3, r: 3 }] },
  12: { S: 3, cols: 5, rows: 4, smalls: [{ c: 3, r: 0 }, { c: 3, r: 1 }, { c: 3, r: 2 }, { c: 4, r: 0 }, { c: 4, r: 1 }, { c: 4, r: 2 }, { c: 0, r: 3 }, { c: 1, r: 3 }, { c: 2, r: 3 }, { c: 3, r: 3 }, { c: 4, r: 3 }] },
  13: { S: 2, cols: 4, rows: 4, smalls: [{ c: 2, r: 0 }, { c: 2, r: 1 }, { c: 3, r: 0 }, { c: 3, r: 1 }, { c: 0, r: 2 }, { c: 1, r: 2 }, { c: 2, r: 2 }, { c: 3, r: 2 }, { c: 0, r: 3 }, { c: 1, r: 3 }, { c: 2, r: 3 }, { c: 3, r: 3 }] },
  14: { S: 3, cols: 6, rows: 4, smalls: [{ c: 3, r: 0 }, { c: 3, r: 1 }, { c: 3, r: 2 }, { c: 4, r: 0 }, { c: 4, r: 1 }, { c: 4, r: 2 }, { c: 5, r: 0 }, { c: 5, r: 1 }, { c: 5, r: 2 }, { c: 0, r: 3 }, { c: 1, r: 3 }, { c: 2, r: 3 }, { c: 3, r: 3 }] },
  15: { S: 3, cols: 6, rows: 4, smalls: [{ c: 3, r: 0 }, { c: 3, r: 1 }, { c: 3, r: 2 }, { c: 4, r: 0 }, { c: 4, r: 1 }, { c: 4, r: 2 }, { c: 5, r: 0 }, { c: 5, r: 1 }, { c: 5, r: 2 }, { c: 0, r: 3 }, { c: 1, r: 3 }, { c: 2, r: 3 }, { c: 3, r: 3 }, { c: 4, r: 3 }] },
  16: { S: 3, cols: 6, rows: 4, smalls: [{ c: 3, r: 0 }, { c: 3, r: 1 }, { c: 3, r: 2 }, { c: 4, r: 0 }, { c: 4, r: 1 }, { c: 4, r: 2 }, { c: 5, r: 0 }, { c: 5, r: 1 }, { c: 5, r: 2 }, { c: 0, r: 3 }, { c: 1, r: 3 }, { c: 2, r: 3 }, { c: 3, r: 3 }, { c: 4, r: 3 }, { c: 5, r: 3 }] }
});

const qualityOf = (width, height) => Math.min(1, width / FOCUS_LIMITS.mainMin, height / FOCUS_LIMITS.mainMinHeight);

export const calculateFocusLayout = ({ width, height, mainRatio = DEFAULT_RATIO, secondaryRatios = [], previous = null }) => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 2 || height <= 2) return null;

  const count = secondaryRatios.length;
  const totalRooms = count + 1;
  const gap = Math.min(1, width / (totalRooms + 2), height / (totalRooms + 2));

  if (!count) {
    const mainRatioVal = DEFAULT_RATIO;
    const maxW = width;
    const maxH = height;
    const fitW = Math.min(maxW, maxH * mainRatioVal);
    const fitH = fitW / mainRatioVal;
    const quality = qualityOf(fitW, fitH);
    const mainVideo = fitVideo(fitW, fitH, mainRatio);
    return {
      family: "single",
      main: { width: fitW, height: fitH },
      mainVideo,
      rightWidth: 0,
      topHeight: fitH,
      bottomHeight: 0,
      rightContentHeight: 0,
      bottomContentHeight: 0,
      placements: [],
      signature: "single",
      gap,
      gapX: gap,
      gapY: gap * (9 / 16),
      cell: null,
      cellRatio: DEFAULT_RATIO,
      rightCount: 0,
      bottomCount: 0,
      mainArea: fitW * fitH,
      meanVisible: 1,
      mainVisible: 1,
      fillRatio: 1,
      layoutFillRatio: 1,
      dominant: true,
      bothRegions: false,
      quality,
      constrained: quality < 1 - 1e-7,
      overflow: false,
      containerW: fitW,
      containerH: fitH,
      offsetX: (width - fitW) / 2,
      offsetY: (height - fitH) / 2
    };
  }

  const spec = SCHEME_A_SPECS[totalRooms] || SCHEME_A_SPECS[16];
  const { S, cols, rows, smalls } = spec;

  // 保证大屏与小屏在包含 gap 间距时均 100.00% 保持 16:9
  const gapX = gap;
  const gapY = gap * (9 / 16);

  // 计算小格的最大可用宽高（严格受限于可视区域）
  const maxW_by_width = (width - (cols - 1) * gapX) / cols;
  const maxH_by_height = (height - (rows - 1) * gapY) / rows;
  const maxW_by_height = maxH_by_height * DEFAULT_RATIO;

  const cw = Math.max(1, Math.min(maxW_by_width, maxW_by_height));
  const ch = cw / DEFAULT_RATIO;

  // 主屏宽与高（S 倍单元格 + 内部缝隙），由于 gapY = gapX * 9 / 16，mainW / mainH 严格为 16:9
  const mainW = S * cw + (S - 1) * gapX;
  const mainH = S * ch + (S - 1) * gapY;

  // 监控墙外接矩形总尺寸
  const containerW = cols * cw + (cols - 1) * gapX;
  const containerH = rows * ch + (rows - 1) * gapY;

  // 在视口中居中（多余宽度/高度留黑）
  const offsetX = Math.max(0, (width - containerW) / 2);
  const offsetY = Math.max(0, (height - containerH) / 2);

  // 分区：
  // c >= S 为右侧区域 (通高)
  // c < S 为底部区域 (同主窗宽)
  const rightSmalls = smalls.filter((p) => p.c >= S);
  const bottomSmalls = smalls.filter((p) => p.c < S);

  const rightWidth = rightSmalls.length ? (cols - S) * cw + (cols - S - 1) * gapX : 0;
  const bottomHeight = bottomSmalls.length ? (rows - S) * ch + (rows - S - 1) * gapY : 0;

  const rightContentHeight = rightSmalls.length ? rows * ch + (rows - 1) * gapY : 0;
  const bottomContentHeight = bottomHeight;

  // 映射所有副屏位置与坐标（相对所在 region.content 容器）
  const placements = smalls.slice(0, count).map((p, idx) => {
    const isRight = p.c >= S;
    const region = isRight ? "right" : "bottom";
    const x = isRight ? (p.c - S) * (cw + gapX) : p.c * (cw + gapX);
    const y = isRight ? p.r * (ch + gapY) : (p.r - S) * (ch + gapY);
    const ratio = ratioOf(secondaryRatios[idx]);
    return {
      index: idx,
      region,
      x,
      y,
      width: cw,
      height: ch,
      video: fitVideo(cw, ch, ratio),
      visible: visibleOf(cw, ch, ratio),
      ratio
    };
  });

  const quality = qualityOf(mainW, mainH);
  const cellArea = cw * ch;
  const mainArea = mainW * mainH;
  const totalContentArea = mainArea + placements.length * cellArea;
  const containerArea = containerW * containerH;
  const mainVideo = fitVideo(mainW, mainH, mainRatio);

  return {
    family: "A",
    main: { width: mainW, height: mainH },
    mainVideo,
    rightWidth,
    topHeight: mainH,
    bottomHeight,
    rightContentHeight,
    bottomContentHeight,
    placements,
    signature: `A:${S}:${cols}x${rows}:${count}`,
    gap,
    gapX,
    gapY,
    cell: { width: cw, height: ch },
    cellRatio: DEFAULT_RATIO,
    rightCount: rightSmalls.length,
    bottomCount: bottomSmalls.length,
    mainArea,
    meanVisible: count ? placements.reduce((sum, p) => sum + p.visible, 0) / count : 1,
    mainVisible: (mainVideo.width * mainVideo.height) / mainArea,
    fillRatio: totalContentArea / containerArea,
    layoutFillRatio: totalContentArea / containerArea,
    dominant: mainArea >= FOCUS_LIMITS.mainAreaRatio * cellArea - 1e-6,
    bothRegions: rightSmalls.length > 0 && bottomSmalls.length > 0,
    quality,
    constrained: quality < 0.98,
    overflow: false,
    containerW,
    containerH,
    offsetX,
    offsetY
  };
};
