// 统一格 + 严格 16:9 对齐（gapY = gapX * 9/16，方案 A 的对齐技巧）+ 主窗比例守卫
const R = 16 / 9;
const f = (n) => (n * 100).toFixed(1).padStart(5) + "%";
const f2 = (n) => n.toFixed(2);

export function planGrid(W, H, N, opts = {}) {
  const { maxMainRatio = 2.45, minMainRatio = 1.15, gapXMax = 6, gapXMin = 0.5 } = opts;
  const count = N - 1;
  if (count === 0) {
    const w = Math.min(W, H * R), h = w / R;
    return { mode: "single", main: { w, h }, cell: null, slots: [], contW: w, contH: h, video: w * h / (W * H) };
  }
  let best = null;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let rc = 0; rc <= 4; rc++) for (let br = 0; br <= 4; br++) {
    if (!rc && !br) continue;
    const cols = a + rc, rows = b + br;
    if (cols > 9 || rows > 9) continue;
    const rightCap = rc * b, bottomCap = br * cols;
    if (rightCap + bottomCap < count) continue;
    for (const gapX of [gapXMin, 3, gapXMax]) {
      const gapY = gapX / R;
      // 宽度约束: cols*w + (cols-1)*gapX <= W  =>  w <= (W-(cols-1)gapX)/cols
      // 高度约束: rows*w/R + (rows-1)*gapX/R <= H => w <= (H*R-(rows-1)gapX)/rows
      const w = Math.min((W - (cols - 1) * gapX) / cols, (H * R - (rows - 1) * gapX) / rows);
      if (!(w > 0)) continue;
      const h = w / R;
      if (w < Math.min(80, W / 10)) continue;
      const mainW = a * w + (a - 1) * gapX, mainH = b * h + (b - 1) * gapY;
      const mainRat = mainW / mainH; // 恒等于 R
      if (mainRat > maxMainRatio + 1e-9 || mainRat < minMainRatio - 1e-9) continue;
      const cellArea = w * h, mainArea = mainW * mainH;
      if (mainArea < 1.5 * cellArea) continue;
      const contW = cols * w + (cols - 1) * gapX, contH = rows * h + (rows - 1) * gapY;
      if (contW > W + 1e-6 || contH > H + 1e-6) continue;
      const slots = [];
      for (let c = 0; c < rc; c++) for (let r = 0; r < b; r++) slots.push({ x: (a + c) * (w + gapX), y: r * (h + gapY), w, h, region: "right" });
      let need = count - slots.length;
      if (need < 0) continue;
      if (need > bottomCap) continue;
      for (let r = 0; r < br && need > 0; r++) for (let c = 0; c < cols && need > 0; c++, need--) slots.push({ x: c * (w + gapX), y: (b + r) * (h + gapY), w, h, region: "bottom" });
      if (slots.length !== count) continue;
      const video = (mainArea + count * cellArea) / (W * H);
      const ox = (W - contW) / 2, oy = (H - contH) / 2;
      const cand = { mode: "grid", a, b, rc, br, cols, rows, gapX, gapY, ox, oy, mainW, mainH, mainRat, contW, contH, cell: { w, h }, slots, video, mainShare: mainArea / (W * H) };
      if (!best || cand.video > best.video + 1e-9) best = cand;
    }
  }
  return best;
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("test/_probe-final.mjs");
if (isMain) {
  const sizes = [[2552, 1177], [1920, 1080], [2560, 1080], [1246, 654], [1366, 768], [800, 600], [375, 600], [1280, 720], [3440, 1440], [1024, 768], [1600, 900]];
  let fails = 0, noSolution = [], worst = { ratio: 1, tag: "" };
  for (const [W, H] of sizes) for (let N = 1; N <= 16; N++) {
    const r = planGrid(W, H, N);
    const tag = `${W}x${H}/N=${N}`;
    if (!r) { noSolution.push(tag); continue; }
    if (r.mode === "single") continue;
    const chk = (c, msg) => { if (!c) { fails++; console.log(`FAIL ${tag}: ${msg}`); } };
    chk(Math.abs(r.mainW / r.mainH - R) < 1e-9, `主窗比例 ${r.mainW / r.mainH}`);
    chk(Math.abs(r.cell.w / r.cell.h - R) < 1e-9, `格子比例 ${r.cell.w / r.cell.h}`);
    chk(r.mainW * r.mainH >= 1.5 * r.cell.w * r.cell.h, "主窗主导");
    for (const s of r.slots) chk(Math.abs(s.w - r.cell.w) < 1e-9 && Math.abs(s.h - r.cell.h) < 1e-9, "副窗等大");
    chk(r.contW <= W + 1e-6 && r.contH <= H + 1e-6, "容器越界");
    const boxes = [{ x: r.ox, y: r.oy, w: r.mainW, h: r.mainH, id: "main" }, ...r.slots.map((s, i) => ({ x: r.ox + s.x, y: r.oy + s.y, w: s.w, h: s.h, id: i }))];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i], B = boxes[j];
      chk(!(A.x + A.w - 1e-6 > B.x && B.x + B.w - 1e-6 > A.x && A.y + A.h - 1e-6 > B.y && B.y + B.h - 1e-6 > A.y), `重叠 ${A.id}×${B.id}`);
    }
    if (r.video < worst.ratio) worst = { ratio: r.video, tag };
  }
  console.log(`\n失败 ${fails} 项；无解 ${noSolution.length} 组${noSolution.length ? ": " + noSolution.join(", ") : ""}`);
  console.log(`最差 vidFill: ${(worst.ratio * 100).toFixed(1)}% @ ${worst.tag}`);
  // 详表：重点 5/8/10/16
  console.log("\n重点组合详表（方案 A → 统一格）");
  const { calculateFocusLayout } = await import("../src/core/focus-layout.js");
  for (const [W, H, tg] of [[2552, 1177, "2.17超宽"], [1920, 1080, "16:9"], [2560, 1080, "2.37带鱼"], [1246, 654, "1.90"], [1366, 768, "16:9本"], [800, 600, "4:3"], [375, 600, "窄竖"]]) {
    console.log(`### ${W}x${H} (${tg})`);
    for (const N of [5, 8, 10, 16]) {
      const A = calculateFocusLayout({ width: W, height: H, secondaryRatios: Array(N - 1).fill(R) });
      const r = planGrid(W, H, N);
      console.log(`  N=${String(N).padStart(2)} A: vid=${f(A.viewportFillRatio)} cell=${A.cell.width.toFixed(0)}x${A.cell.height.toFixed(0)} main=${A.main.width.toFixed(0)} | G: vid=${r ? f(r.video) : "无解"} cell=${r ? r.cell.w.toFixed(0) + "x" + r.cell.h.toFixed(0) : "-"} main=${r ? r.mainW.toFixed(0) + "x" + r.mainH.toFixed(0) : "-"} (${r ? f2(r.mainRat) : "-"}:1) cont=${r ? r.contW.toFixed(0) + "x" + r.contH.toFixed(0) : "-"}`);
    }
  }
}
