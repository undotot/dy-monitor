// 统一格引擎 v2：主窗必须跨 a 列 × a 行（正方形跨度），以此保证主窗严格 16:9。
// 副窗统一 w×h 单元格，右侧同高列 / 下方整行装配。
const R = 16 / 9;
const f = (n) => (n * 100).toFixed(1).padStart(5) + "%";

export function planGrid(W, H, N, opts = {}) {
  const { gapCandidates = [0.5, 3, 6], SMax = 8, rcMax = 5, brMax = 5, minCellRatio = 0.06 } = opts;
  const count = N - 1;
  if (!Number.isFinite(W) || !Number.isFinite(H) || W <= 2 || H <= 2) return null;
  if (count === 0) {
    const w = Math.min(W, H * R), h = w / R;
    return { mode: "single", mainW: w, mainH: h, mainRat: R, cell: null, slots: [], contW: w, contH: h, ox: (W - w) / 2, oy: (H - h) / 2, video: w * h / (W * H), mainShare: w * h / (W * H), gapX: 0, gapY: 0, a: 1, b: 1, cols: 1, rows: 1 };
  }
  let best = null;
  for (let S = 1; S <= SMax; S++) {
    for (let rc = 0; rc <= rcMax; rc++) for (let br = 0; br <= brMax; br++) {
      if (!rc && !br) continue;
      const cols = S + rc, rows = S + br;
      const rightCap = rc * S, bottomCap = br * cols;
      if (rightCap + bottomCap < count) continue;
      for (const gapX of gapCandidates) {
        const gapY = gapX * (9 / 16);
        // 宽度: cols*w + (cols-1)*gapX <= W
        // 高度: rows*w/R + (rows-1)*gapY <= H
        const w = Math.min((W - (cols - 1) * gapX) / cols, (H - (rows - 1) * gapY) * R / rows);
        if (!(w > 0)) continue;
        const h = w / R;
        if (w < Math.min(80, W / 10) || h < Math.min(45, H / 10)) continue;
        // 正方形跨度 => 主窗自动严格 16:9
        const mainW = S * w + (S - 1) * gapX, mainH = S * h + (S - 1) * gapY;
        const cellArea = w * h, mainArea = mainW * mainH;
        if (mainArea < 1.5 * cellArea) continue;
        const contW = cols * w + (cols - 1) * gapX, contH = rows * h + (rows - 1) * gapY;
        if (contW > W + 1e-6 || contH > H + 1e-6) continue;
        const slots = [];
        for (let c = 0; c < rc; c++) for (let r = 0; r < S; r++) slots.push({ x: (S + c) * (w + gapX), y: r * (h + gapY), w, h, region: "right", c: S + c, r });
        let need = count - slots.length;
        if (need < 0 || need > bottomCap) continue;
        for (let r = 0; r < br && need > 0; r++) for (let c = 0; c < cols && need > 0; c++, need--) slots.push({ x: c * (w + gapX), y: (S + r) * (h + gapY), w, h, region: "bottom", c, r: S + r });
        if (slots.length !== count) continue;
        const video = (mainArea + count * cellArea) / (W * H);
        const ox = (W - contW) / 2, oy = (H - contH) / 2;
        const cand = { mode: "grid", a: S, b: S, rc, br, cols, rows, gapX, gapY, ox, oy, mainW, mainH, mainRat: mainW / mainH, contW, contH, cell: { w, h }, slots, video, mainShare: mainArea / (W * H) };
        if (!best || cand.video > best.video + 1e-9) best = cand;
      }
    }
  }
  return best;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("test/_probe-grid3.mjs")) {
  const sizes = [[2552, 1177], [1920, 1080], [2560, 1080], [1246, 654], [1366, 768], [800, 600], [375, 600], [1280, 720], [3440, 1440], [1024, 768], [1600, 900], [300, 200], [150, 120]];
  let fails = 0; const noSolution = []; let worst = { ratio: 1, tag: "" };
  for (const [W, H] of sizes) for (let N = 1; N <= 16; N++) {
    const r = planGrid(W, H, N);
    const tag = `${W}x${H}/N=${N}`;
    if (!r) { noSolution.push(tag); continue; }
    if (r.mode === "single") continue;
    const chk = (c, msg) => { if (!c) { fails++; console.log(`FAIL ${tag}: ${msg}`); } };
    chk(Math.abs(r.mainW / r.mainH - R) < 1e-8, `主窗比例 ${r.mainW / r.mainH} (S=${r.a})`);
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
  }
  console.log(`\n约束检查：失败 ${fails} 项；无解 ${noSolution.length} 组${noSolution.length ? ": " + noSolution.join(", ") : ""}`);
  console.log(`最差 vidFill: ${(worst.ratio * 100).toFixed(1)}% @ ${worst.tag}`);
  const { calculateFocusLayout } = await import("../src/core/focus-layout.js");
  console.log("\n重点组合详表（当前方案A → 统一格提案）");
  for (const [W, H, tg] of [[2552, 1177, "2.17超宽"], [1920, 1080, "16:9"], [2560, 1080, "2.37带鱼"], [1246, 654, "1.90"], [1366, 768, "16:9本"], [800, 600, "4:3"], [375, 600, "窄竖"]]) {
    console.log(`### ${W}x${H} (${tg})`);
    for (const N of [5, 8, 10, 16]) {
      const A = calculateFocusLayout({ width: W, height: H, secondaryRatios: Array(N - 1).fill(R) });
      const r = planGrid(W, H, N);
      console.log(`  N=${String(N).padStart(2)} A vid=${f(A.viewportFillRatio)} cell=${A.cell.width.toFixed(0)}x${A.cell.height.toFixed(0)} main=${A.main.width.toFixed(0)}x${A.main.height.toFixed(0)} grid=${A.cols}x${A.rows} S=${A.S}`);
      console.log(`        G vid=${r ? f(r.video) : "无解"} cell=${r ? r.cell.w.toFixed(0) + "x" + r.cell.h.toFixed(0) : "-"} main=${r ? r.mainW.toFixed(0) + "x" + r.mainH.toFixed(0) : "-"} grid=${r ? r.cols + "x" + r.rows : "-"} S=${r ? r.a : "-"}`);
    }
  }
}
