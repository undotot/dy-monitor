// 放大模式布局：等大格精确镶嵌整墙。三项要求——① 占满屏幕：主窗矩形 + 全等小格
// 精确填满可视区，仅余 1px 缝隙（零留边、零黑洞）；② 小窗盒子尽量 16:9（适配度优先
// 于主窗画质），画面保持直播流比例完整显示（contain 居中，不变形不裁切）；③ 主窗恒在
// 左上角（剩余矩形），面积 ≥ 1.5× 单个小格（主窗主导）。
// 结构枚举两种 L 形互锁（A：右列通高 + 底行同主窗宽；B：右列同主窗高 + 底行通宽）
// 与单区兜底（R：右列；D：底行），分组必须满足 S = k·r + m·n 精确铺满，否则出洞跳过。
// 评分全序：主窗主导性 → 小窗 16:9 适配度 → 主窗可看底线（640×360 十档软评分）→
// （dual：双区优先 / quality：画面保留优先）→ 小窗画面保留率 → 主窗比例达成 →
// 签名稳定 → 精确画面率 → 右列优先 → 签名破平。单区候选另一维是自由参数，粗网格
// 扫描后按全序细化。
export const FOCUS_LIMITS = Object.freeze({ mainMin: 640, mainMinHeight: 360, smallMin: 200, mainAreaRatio: 1.5 });

const DEFAULT_RATIO = 16 / 9;
const ratioOf = (value) => (Number.isFinite(value) && value > 0 ? value : DEFAULT_RATIO);
const fitVideo = (width, height, ratio) => {
  const fittedWidth = Math.min(width, height * ratio);
  return { width: fittedWidth, height: fittedWidth / ratio };
};
// 画面保留率：格子比例 vs 流比例（contain 完整显示时画面占格子的面积比）。
const visibleOf = (cw, ch, ratio) => {
  const cellRatio = cw / ch;
  return Math.max(0, Math.min(1, cellRatio / ratio, ratio / cellRatio));
};
const qualityOf = (width, height) => Math.min(1, width / FOCUS_LIMITS.mainMin, height / FOCUS_LIMITS.mainMinHeight);

export const calculateFocusLayout = ({ width, height, mainRatio = DEFAULT_RATIO, secondaryRatios = [], previous = null, prefer = "dual" }) => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  mainRatio = ratioOf(mainRatio);
  const ratios = secondaryRatios.map(ratioOf);
  const count = ratios.length;
  const gap = Math.min(1, width / (count + 2), height / (count + 2));
  const wallArea = width * height;
  if (!count) {
    const main = { width, height };
    const mainVideo = fitVideo(width, height, mainRatio);
    const quality = qualityOf(width, height);
    return { family: "single", main, mainVideo, rightWidth: 0, topHeight: height, bottomHeight: 0, rightContentHeight: 0, bottomContentHeight: 0,
      placements: [], signature: "single", gap, cell: null, cellRatio: null, rightCount: 0, bottomCount: 0, mainArea: width * height,
      meanVisible: 1, mainVisible: (mainVideo.width * mainVideo.height) / wallArea, fillRatio: (mainVideo.width * mainVideo.height) / wallArea,
      layoutFillRatio: 1, dominant: true, bothRegions: false, quality, constrained: quality < 1 - 1e-7, overflow: false };
  }

  const place = (region, regionCount, columns, cw, ch, offset) => Array.from({ length: regionCount }, (_, i) => ({
    index: offset + i,
    region,
    x: (i % columns) * (cw + gap),
    y: Math.floor(i / columns) * (ch + gap),
    width: cw,
    height: ch,
    video: fitVideo(cw, ch, ratios[offset + i]),
    visible: visibleOf(cw, ch, ratios[offset + i]),
    ratio: ratios[offset + i],
  }));

  const build = ({ family, k, r, m, n, cw, ch }) => {
    const rightCount = k * r;
    const bottomCount = m * n;
    const rightWidth = rightCount ? k * cw + (k - 1) * gap : 0;
    const bottomHeight = bottomCount ? n * ch + (n - 1) * gap : 0;
    let mainW, mainH, rightH;
    if (family === "A") { mainW = m * cw + (m - 1) * gap; mainH = height - bottomHeight - gap; rightH = height; }
    else if (family === "B") { mainH = r * ch + (r - 1) * gap; mainW = width - rightWidth - gap; rightH = mainH; }
    else if (family === "R") { mainH = height; mainW = width - rightWidth - gap; rightH = height; }
    else { mainW = width; mainH = height - bottomHeight - gap; rightH = 0; }
    if (!(mainW > 1 && mainH > 1 && cw > 0 && ch > 0)) return null;
    const cellArea = cw * ch;
    const mainArea = mainW * mainH;
    const mainVideo = fitVideo(mainW, mainH, mainRatio);
    const placements = [...place("right", rightCount, k, cw, ch, 0), ...place("bottom", bottomCount, m, cw, ch, rightCount)];
    const meanVisible = placements.reduce((sum, p) => sum + p.visible, 0) / count;
    const mainVisible = (mainVideo.width * mainVideo.height) / mainArea;
    const videoArea = mainVideo.width * mainVideo.height + placements.reduce((sum, p) => sum + p.visible * cellArea, 0);
    const quality = qualityOf(mainW, mainH);
    return {
      family,
      main: { width: mainW, height: mainH },
      mainVideo,
      rightWidth,
      topHeight: mainH,
      bottomHeight,
      rightContentHeight: rightCount ? rightH : 0,
      bottomContentHeight: bottomHeight,
      placements,
      signature: family === "R" ? `R:${k},${r}` : family === "D" ? `D:${m},${n}` : `${family}:${k},${r},${m},${n}`,
      gap,
      cell: { width: cw, height: ch },
      cellRatio: cw / ch,
      rightCount,
      bottomCount,
      mainArea,
      meanVisible,
      mainVisible,
      fillRatio: videoArea / wallArea,
      layoutFillRatio: (mainArea + count * cellArea) / wallArea,
      dominant: mainArea >= FOCUS_LIMITS.mainAreaRatio * cellArea - 1e-6,
      bothRegions: rightCount > 0 && bottomCount > 0,
      quality,
      constrained: quality < 1 - 1e-7,
      overflow: false,
    };
  };

  let best = null;
  // 小窗 16:9 适配度紧随主窗主导性、先于主窗画质（小窗 16:9 优先于大窗）；主窗可看
  // 底线用 640×360 达成率十档软评分，拦截「小格贴合 16:9 但主窗缩成小方块」的候选
  // （细条小格则由 meanVisible/bothRegions 拦截）。
  const tiersOf = (c) => {
    const t = [c.dominant ? 1 : 0, Math.round(visibleOf(c.cell.width, c.cell.height, DEFAULT_RATIO) / 0.02), Math.round(c.quality / 0.1)];
    if (prefer === "dual") t.push(c.bothRegions ? 1 : 0, Math.round(c.meanVisible / 0.01));
    else t.push(Math.round(c.meanVisible / 0.01), c.bothRegions ? 1 : 0);
    t.push(Math.round(c.mainVisible / 0.05), Math.round(c.fillRatio / 0.01));
    return t;
  };
  const consider = (cand) => {
    if (!cand) return;
    if (!best) { best = cand; return; }
    const a = tiersOf(cand);
    const b = tiersOf(best);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { if (a[i] > b[i]) best = cand; return; }
    const pa = cand.signature === previous ? 1 : 0;
    const pb = best.signature === previous ? 1 : 0;
    if (pa !== pb) { if (pa > pb) best = cand; return; }
    if (Math.abs(cand.fillRatio - best.fillRatio) > 1e-9) { if (cand.fillRatio > best.fillRatio) best = cand; return; }
    const ra = cand.rightCount > 0 ? 1 : 0;
    const rb = best.rightCount > 0 ? 1 : 0;
    if (ra !== rb) { if (ra > rb) best = cand; return; }
    if (cand.signature < best.signature) best = cand;
  };

  // 双区 L 形互锁：k·r + m·n 必须精确等于小窗数；A 型约束 n < r 保主窗高度占优。
  for (let k = 1; k <= count; k++) {
    for (let r = 1; r <= count; r++) {
      if (k * r >= count) break;
      for (let m = 1; m <= count; m++) {
        for (let n = 1; n <= count; n++) {
          if (k * r + m * n !== count) continue;
          if (n < r) consider(build({ family: "A", k, r, m, n, cw: (width - (k + m - 1) * gap) / (k + m), ch: (height - (r - 1) * gap) / r }));
          consider(build({ family: "B", k, r, m, n, cw: (width - (m - 1) * gap) / m, ch: (height - (r + n - 1) * gap) / (r + n) }));
        }
      }
    }
  }

  // 单区兜底（双区铺不满时的 R/D 结构）：另一维是自由参数，粗网格 + 局部细化。
  // 细化跟随全序评分的当前胜出点而非 fillRatio——后者会漂向细条格。
  const scan = (buildAt, samples) => {
    let bestT = 0;
    let localBest = null;
    const beats = (a, b) => {
      const ta = tiersOf(a);
      const tb = tiersOf(b);
      for (let i = 0; i < ta.length; i++) if (ta[i] !== tb[i]) return ta[i] > tb[i];
      return a.fillRatio > b.fillRatio;
    };
    for (let i = 1; i <= samples; i++) {
      const t = i / (samples + 1);
      const cand = buildAt(t);
      consider(cand);
      if (cand && (!localBest || beats(cand, localBest))) { localBest = cand; bestT = t; }
    }
    const step = 1 / (samples + 1);
    for (let i = -8; i <= 8; i++) {
      const t = bestT + (i / 8) * step;
      if (t > 0 && t < 1) consider(buildAt(t));
    }
  };
  for (let k = 1; k <= count; k++) {
    const r = count / k;
    if (!Number.isInteger(r)) continue;
    const ch = (height - (r - 1) * gap) / r;
    const cwMax = (width - (k - 1) * gap - gap - 1) / k;
    if (cwMax > 0) scan((t) => build({ family: "R", k, r, m: 0, n: 0, cw: cwMax * t, ch }), 64);
  }
  for (let m = 1; m <= count; m++) {
    const n = count / m;
    if (!Number.isInteger(n)) continue;
    const cw = (width - (m - 1) * gap) / m;
    const chMax = (height - (n - 1) * gap - gap - 1) / n;
    if (chMax > 0) scan((t) => build({ family: "D", k: 0, r: 0, m, n, cw, ch: chMax * t }), 64);
  }

  return best;
};
