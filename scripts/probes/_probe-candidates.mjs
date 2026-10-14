// 候选排法比较：主窗 + N 个等大 16:9 副窗，全部 16:9 显示框
const R = 16 / 9;
const f = (n) => n.toFixed(3);

// 候选 1：当前方案 A（focus-layout.js 现有实现）—— 见 _probe-layout.mjs
// 候选 2：矩形主窗 + 统一副窗，穷举 (主窗单元格 a x b, 副窗列数 sc, 副窗行数 sr)
//   网格: 主窗占 a 列 b 行；副窗统一 (w x h=w/R)。
//   排布策略: 主窗左上；其右侧 (cols-a) 列放副窗（每列高度 b*h）；下方 (rows-b) 行放副窗（每行宽度 cols*w）。
function solve(W, H, N, gap) {
  const count = N - 1;
  if (count === 0) {
    const mW = Math.min(W, H * R);
    return { layout: "single", main: { w: mW, h: mW / R }, cell: null, slots: [], video: mW * mW / R / (W * H), container: { w: mW, h: mW / R } };
  }
  let best = null;
  const consider = (a, b, sc, sr, cellW, cf) => {
    if (!(cellW > 0)) return;
    const w = cellW, h = w / R;
    const mainW = a * w + (a - 1) * gap, mainH = b * h + (b - 1) * gap;
    const cols = a + sc, rows = b + sr;
    if (sr > 0) { const need = sr * (b * h + b * gap) + (sr - 1) * gap; if (need < b * h * 0 + 0) return; }
    // 容量检查
    const rightCap = sc * b, bottomCap = sr * cols;
    const slots = [];
    if (rightCap >= count) {
      for (let c = 0; c < sc; c++) for (let r = 0; r < b; r++) slots.push({ x: a * (w + gap) + c * (w + gap), y: r * (h + gap), w, h, region: "right" });
    } else if (rightCap + bottomCap >= count) {
      for (let c = 0; c < sc; c++) for (let r = 0; r < b; r++) slots.push({ x: a * (w + gap) + c * (w + gap), y: r * (h + gap), w, h, region: "right" });
      let need = count - slots.length;
      for (let r = 0; r < sr; r++) for (let c = 0; c < cols; c++) { if (need <= 0) break; slots.push({ x: c * (w + gap), y: b * (h + gap) + r * (h + gap), w, h, region: "bottom" }); need--; }
    } else return;
    if (slots.length !== count) return;
    const containerW = cols * w + (cols - 1) * gap, containerH = rows * h + (rows - 1) * gap;
    if (containerW > W + 1e-6 || containerH > H + 1e-6) return;
    const mainArea = mainW * mainH, cellArea = w * h;
    if (mainArea < 1.5 * cellArea) return;
    if (mainW < Math.min(320, W) || mainH < Math.min(180, H)) return;
    if (w < Math.min(80, W / 8)) return;
    const video = (mainArea + count * cellArea) / (W * H);
    const cand = { layout: "grid", a, b, sc, sr, main: { w: mainW, h: mainH }, cell: { w, h }, slots, video, container: { w: containerW, h: containerH }, mainShare: mainArea / (W * H) };
    if (!best || cand.video > best.video + 1e-9) best = cand;
  };
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
    for (let sc = 0; sc <= 6; sc++) for (let sr = 0; sr <= 6; sr++) {
      if (sc === 0 && sr === 0) continue;
      const cols = a + sc, rows = b + sr;
      // 两种约束：宽度限制 / 高度限制
      const w1 = (W - (a - 1) * gap - (cols - a + 0) * 0) / (cols) - 0; // 简化：按列数均分
      const wW = (W - (cols - 1) * gap) / cols;
      const wH = (H - (rows - 1) * gap) * R / rows;
      consider(a, b, sc, sr, Math.min(wW, wH));
    }
  }
  return best;
}

const sizes = [[2552, 1177, "2.17 超宽"], [1920, 1080, "16:9"], [2560, 1080, "2.37 带鱼"], [1246, 654, "1.9"], [800, 600, "4:3"]];
for (const [W, H, tag] of sizes) {
  console.log(`\n### ${W}x${H} (${tag})`);
  for (const N of [2, 4, 5, 8, 10, 16]) {
    const gap = Math.min(4, W / (N + 2), H / (N + 2));
    const r = solve(W, H, N, gap);
    if (!r) { console.log(`  N=${N} 无解`); continue; }
    if (r.layout === "single") { console.log(`  N=1  main=${f(r.main.w)}x${f(r.main.h)}`); continue; }
    console.log(`  N=${String(N).padStart(2)} a=${r.a}x${r.b} side=${r.sc}x${r.sr} cell=${f(r.cell.w)}x${f(r.cell.h)} main=${f(r.main.w)}x${f(r.main.h)} cont=${f(r.container.w)}x${f(r.container.h)} | videoFill=${f(r.video)} mainShare=${f(r.mainShare)}`);
  }
}
