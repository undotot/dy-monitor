// 统一网格模型：主窗占 a 列 b 行单元格；副窗统一 w×h 单元。
// 副窗两种排布：(1) 主窗右侧同高列；(2) 主窗下方整行。取视频面积最大者。
const R = 16 / 9;
const f = (n) => (n * 100).toFixed(1).padStart(5) + "%";

function solve(W, H, N, opts = {}) {
  const { gap = 0.5, minCell = 0, mainMinRatio = 1.25, cellMax = 6 } = opts;
  const count = N - 1;
  if (count === 0) {
    const w = Math.min(W, H * R);
    return { mode: "single", mainW: w, mainH: w / R, contW: w, contH: w / R, video: (w * w / R) / (W * H), cell: null, slots: [], main: { x: 0, y: 0, w, h: w / R } };
  }
  let best = null;
  const build = (a, b, cols, rows, cover) => {
    const wW = (W - (cols - 1) * gap) / cols;
    const wH = (H - (rows - 1) * gap) * R / rows;
    const w = Math.min(wW, wH), h = w / R;
    if (w <= 0) return;
    if (w < Math.min(80, W / 10) || h < Math.min(45, H / 10)) return;
    if (w < minCell) return;
    const mainW = a * w + (a - 1) * gap, mainH = b * h + (b - 1) * gap;
    const contW = cols * w + (cols - 1) * gap, contH = rows * h + (rows - 1) * gap;
    if (contW > W + 1e-6 || contH > H + 1e-6) return;
    const cellArea = w * h, mainArea = mainW * mainH;
    if (mainArea < 1.5 * cellArea) return;
    if (mainW < mainMinRatio * w) return;
    if (mainW < Math.min(430, W) || mainH < Math.min(242, H)) return;
    // 枚举 a,b 时 cols 已固定；右侧优先填充与主窗同高的列，再补下方整行
    const slots = [];
    const rightCols = cols - a;
    if (rightCols > 0 && rightCols * b >= count) {
      const perCol = Math.ceil(count / rightCols);
      if (perCol > b) return;
      let k = 0;
      for (let c = 0; c < rightCols; c++) for (let r = 0; r < b && k < count; r++, k++) slots.push({ x: (a + c) * (w + gap), y: r * (h + gap), w, h, region: "right" });
    } else {
      if (rightCols > 0) {
        let k = 0;
        for (let c = 0; c < rightCols; c++) for (let r = 0; r < b && k < count; r++, k++) slots.push({ x: (a + c) * (w + gap), y: r * (h + gap), w, h, region: "right" });
      }
      let need = count - slots.length;
      const bottomRows = rows - b;
      if (bottomRows <= 0) return;
      if (need > bottomRows * cols) return;
      for (let r = 0; r < bottomRows && need > 0; r++) for (let c = 0; c < cols && need > 0; c++, need--) slots.push({ x: c * (w + gap), y: (b + r) * (h + gap), w, h, region: "bottom" });
    }
    if (slots.length !== count) return;
    const video = (mainArea + count * cellArea) / (W * H);
    const ox = (W - contW) / 2, oy = (H - contH) / 2;
    const cand = { mode: "grid", a, b, cols, rows, cover, ox, oy, mainW, mainH, contW, contH, cell: { w, h }, slots, video, mainShare: mainArea / (W * H), mainRat: mainW / mainH };
    if (!best || cand.video > best.video + 1e-9) best = cand;
  };
  for (let a = 1; a <= 6; a++) {
    for (let b = 1; b <= 6; b++) {
      if (a * b > 12) continue;
      // 右侧同高列覆盖
      for (let rightCols = 0; rightCols <= cellMax; rightCols++) {
        const cols = a + rightCols;
        const rows = b;
        if (rightCols === 0) continue;
        const perCol = Math.ceil(count / rightCols);
        if (perCol > b) continue;
        if (perCol < 1) continue;
        build(a, b, cols, rows, "right");
      }
      // 下方整行覆盖
      for (let bottomRows = 1; bottomRows <= 5; bottomRows++) {
        const rows = b + bottomRows;
        let rightCols = 0;
        if (a * b + bottomRows * (a + rightCols) < count) continue;
        // 尝试右侧先放满 b 行，再下方补行
        for (let rc = 0; rc <= 2; rc++) {
          const cols = a + rc;
          if (rc * b > count) continue;
          build(a, b, cols, rows, "bottom");
        }
      }
    }
  }
  return best;
}

const sizes = [[2552, 1177, "2.17 超宽"], [1920, 1080, "16:9"], [2560, 1080, "2.37 带鱼"], [1246, 654, "1.90"], [1366, 768, "16:9 本"], [800, 600, "4:3"], [375, 600, "窄竖"]];
console.log("统一网格模型 vidFill\n");
for (const [W, H, tag] of sizes) {
  console.log(`### ${W}x${H} (${tag})`);
  for (const N of [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16]) {
    const r = solve(W, H, N, { minCell: W >= 1200 ? 120 : 60 });
    if (!r) { console.log(`  N=${N} 无解`); continue; }
    if (r.mode === "single") { console.log(`  N=1  main=${r.mainW.toFixed(1)}x${r.mainH.toFixed(1)}`); continue; }
    console.log(`  N=${String(N).padStart(2)} main=${r.a}x${r.b} grid=${r.cols}x${r.rows} cover=${r.cover} cell=${r.cell.w.toFixed(1)}x${r.cell.h.toFixed(1)} main=${r.mainW.toFixed(1)}x${r.mainH.toFixed(1)}(${r.mainRat.toFixed(2)}:1) cont=${r.contW.toFixed(1)}x${r.contH.toFixed(1)} vidFill=${f(r.video)} mainShare=${f(r.mainShare)}`);
  }
}
