// 统一格布局引擎（提案）：
// 主窗占 a 列 × b 行单元格；所有副窗统一 w×h 单元格（严格 16:9）。
// gapY = gapX * 9/16，使主窗、格子、容器三者均严格 16:9（沿用方案 A 的对齐技巧）。
const R = 16 / 9;
const f = (n) => (n * 100).toFixed(1).padStart(5) + "%";

export function planGrid(W, H, N, opts = {}) {
  const { maxMainRatio = 2.45, minMainRatio = 1.15, gapCandidates = [0.5, 3, 6], aMax = 6, bMax = 6 } = opts;
  const count = N - 1;
  if (!Number.isFinite(W) || !Number.isFinite(H) || W <= 2 || H <= 2) return null;
  if (count === 0) {
    const w = Math.min(W, H * R), h = w / R;
    return { mode: "single", mainW: w, mainH: h, mainRat: R, cell: null, slots: [], contW: w, contH: h, ox: (W - w) / 2, oy: (H - h) / 2, video: w * h / (W * H), mainShare: w * h / (W * H), gapX: 0, gapY: 0 };
  }
  let best = null;
  for (let a = 1; a <= aMax; a++) for (let b = 1; b <= bMax; b++) {
    for (let rc = 0; rc <= 4; rc++) for (let br = 0; br <= 4; br++) {
      if (!rc && !br) continue;
      const cols = a + rc, rows = b + br;
      const rightCap = rc * b, bottomCap = br * cols;
      if (rightCap + bottomCap < count) continue;
      for (const gapX of gapCandidates) {
        const gapY = gapX * (9 / 16);
        // 高度: rows*h + (rows-1)*gapY <= H, h = w/R, gapY = gapX*9/16
        // => w <= (H*R - (rows-1)*gapX*R*9/16) / rows
        const w = Math.min((W - (cols - 1) * gapX) / cols, (H * R - (rows - 1) * gapX * R * 9 / 16) / rows);
        if (!(w > 0)) continue;
        const h = w / R;
        if (w < Math.min(80, W / 10) || h < Math.min(45, H / 10)) continue;
        const mainW = a * w + (a - 1) * gapX, mainH = b * h + (b - 1) * gapY;
        const mainRat = mainW / mainH;
        if (mainRat > maxMainRatio + 1e-9 || mainRat < minMainRatio - 1e-9) continue;
        const cellArea = w * h, mainArea = mainW * mainH;
        if (mainArea < 1.5 * cellArea) continue;
        const contW = cols * w + (cols - 1) * gapX, contH = rows * h + (rows - 1) * gapY;
        if (contW > W + 1e-6 || contH > H + 1e-6) continue;
        const slots = [];
        for (let c = 0; c < rc; c++) for (let r = 0; r < b; r++) slots.push({ x: (a + c) * (w + gapX), y: r * (h + gapY), w, h, region: "right", c: a + c, r });
        let need = count - slots.length;
        if (need < 0 || need > bottomCap) continue;
        for (let r = 0; r < br && need > 0; r++) for (let c = 0; c < cols && need > 0; c++, need--) slots.push({ x: c * (w + gapX), y: (b + r) * (h + gapY), w, h, region: "bottom", c, r: b + r });
        if (slots.length !== count) continue;
        const video = (mainArea + count * cellArea) / (W * H);
        const ox = (W - contW) / 2, oy = (H - contH) / 2;
        const cand = { mode: "grid", a, b, rc, br, cols, rows, gapX, gapY, ox, oy, mainW, mainH, mainRat, contW, contH, cell: { w, h }, slots, video, mainShare: mainArea / (W * H) };
        if (!best || cand.video > best.video + 1e-9) best = cand;
      }
    }
  }
  if (!best) {
    // 极窄视口：退化为「主窗 + 底行统一小格」兜底
    for (let b = 1; b <= 6; b++) for (let br = 1; br <= 6; br++) {
      const cols = 1, rows = b + br;
      for (const gapX of gapCandidates) {
        const gapY = gapX * (9 / 16);
        const w = Math.min((W - 0) / cols, (H * R - (rows - 1) * gapX) / rows);
        if (!(w > 0)) continue;
        const h = w / R;
        const mainW = w, mainH = b * h + (b - 1) * gapY;
        if (b * h + (b - 1) * gapY < 1.5 * w * h) continue;
        const contW = cols * w, contH = rows * h + (rows - 1) * gapY;
        if (contH > H + 1e-6) continue;
        const slots = [];
        for (let i = 0; i < count; i++) slots.push({ x: 0, y: (b + i) * (h + gapY), w, h, region: "bottom", c: 0, r: b + i });
        const video = (mainW * mainH + count * w * h) / (W * H);
        const cand = { mode: "grid", a: 1, b, rc: 0, br: count, cols, rows, gapX, gapY, ox: (W - contW) / 2, oy: (H - contH) / 2, mainW, mainH, mainRat: mainW / mainH, contW, contH, cell: { w, h }, slots, video, mainShare: mainW * mainH / (W * H), fallback: true };
        if (!best || cand.video > best.video + 1e-9) best = cand;
      }
    }
  }
  return best;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("test/_probe-grid2.mjs")) {
  const sizes = [[2552, 1177], [1920, 1080], [2560, 1080], [1246, 654], [1366, 768], [800, 600], [375, 600], [1280, 720], [3440, 1440], [1024, 768], [1600, 900], [300, 200]];
  let fails = 0; const noSolution = []; let worst = { ratio: 1, tag: "" }; let worstMain = { r: 0, tag: "" };
  for (const [W, H] of sizes) for (let N = 1; N <= 16; N++) {
    const r = planGrid(W, H, N);
    const tag = `${W}x${H}/N=${N}`;
    if (!r) { noSolution.push(tag); continue; }
    if (r.mode === "single") continue;
    const chk = (c, msg) => { if (!c) { fails++; console.log(`FAIL ${tag}: ${msg}`); } };
    chk(Math.abs(r.mainW / r.mainH - R) < 1e-8, `主窗比例 ${r.mainW / r.mainH} (a=${r.a} b=${r.b})`);
    chk(Math.abs(r.cell.w / r.cell.h - R) < 1e-8, `格子比例 ${r.cell.w / r.cell.h}`);
    chk(r.mainW * r.mainH >= 1.5 * r.cell.w * r.cell.h, "主窗主导");
    for (const s of r.slots) chk(Math.abs(s.w - r.cell.w) < 1e-8 && Math.abs(s.h - r.cell.h) < 1e-8, "副窗等大");
    chk(r.contW <= W + 1e-6 && r.contH <= H + 1e-6, "容器越界");
    const boxes = [{ x: r.ox, y: r.oy, w: r.mainW, h: r.mainH, id: "main" }, ...r.slots.map((s, i) => ({ x: r.ox + s.x, y: r.oy + s.y, w: s.w, h: s.h, id: i }))];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i], B = boxes[j];
      chk(!(A.x + A.w - 1e-6 > B.x && B.x + B.w - 1e-6 > A.x && A.y + A.h - 1e-6 > B.y && B.y + B.h - 1e-6 > A.y), `重叠 ${A.id}×${B.id}`);
    }
    if (r.video < worst.ratio) worst = { ratio: r.video, tag };
    if (r.mainShare < worstMain.r || worstMain.r === 0) worstMain = { r: r.mainShare, tag };
  }
  console.log(`\n约束检查：失败 ${fails} 项；无解 ${noSolution.length} 组${noSolution.length ? ": " + noSolution.join(", ") : ""}`);
  console.log(`最差 vidFill: ${(worst.ratio * 100).toFixed(1)}% @ ${worst.tag}`);
  console.log(`最差主窗占比: ${(worstMain.r * 100).toFixed(1)}% @ ${worstMain.tag}`);
  const { calculateFocusLayout } = await import("../src/core/focus-layout.js");
  console.log("\n重点组合详表（当前方案A → 统一格提案）");
  for (const [W, H, tg] of [[2552, 1177, "2.17超宽"], [1920, 1080, "16:9"], [2560, 1080, "2.37带鱼"], [1246, 654, "1.90"], [1366, 768, "16:9本"], [800, 600, "4:3"], [375, 600, "窄竖"]]) {
    console.log(`### ${W}x${H} (${tg})`);
    for (const N of [5, 8, 10, 16]) {
      const A = calculateFocusLayout({ width: W, height: H, secondaryRatios: Array(N - 1).fill(R) });
      const r = planGrid(W, H, N);
      console.log(`  N=${String(N).padStart(2)} A vid=${f(A.viewportFillRatio)} A cell=${A.cell.width.toFixed(0)}x${A.cell.height.toFixed(0)} A main=${A.main.width.toFixed(0)}x${A.main.height.toFixed(0)}\n        G vid=${r ? f(r.video) : "无解"} G cell=${r ? r.cell.w.toFixed(0) + "x" + r.cell.h.toFixed(0) : "-"} G main=${r ? r.mainW.toFixed(0) + "x" + r.mainH.toFixed(0) + " (" + (r.mainW / r.mainH).toFixed(2) + ":1) grid=" + r.cols + "x" + r.rows : "-"}`);
    }
  }
}
