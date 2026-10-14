import { plan } from "./_probe-final.mjs";
const R = 16 / 9;
const sizes = [[2552, 1177], [1920, 1080], [2560, 1080], [1246, 654], [1366, 768], [800, 600], [375, 600], [1280, 720], [1600, 900], [3440, 1440], [1024, 768]];
let fails = 0, noSolution = [], worst = { ratio: 1, tag: "" };
for (const [W, H] of sizes) {
  for (let N = 1; N <= 16; N++) {
    const r = plan(W, H, N);
    const tag = `${W}x${H}/N=${N}`;
    if (!r) { noSolution.push(tag); continue; }
    if (r.mode === "single") continue;
    const { mainW, mainH, cell } = r;
    const chk = (c, msg) => { if (!c) { fails++; console.log(`FAIL ${tag}: ${msg}`); } };
    chk(Math.abs(mainW / mainH - R) < 1e-6, `主窗比例 ${mainW / mainH}`);
    chk(Math.abs(cell.w / cell.h - R) < 1e-6, `格子比例 ${cell.w / cell.h}`);
    chk(mainW * mainH >= 1.5 * cell.w * cell.h, "主窗主导");
    // 所有副窗等大
    for (const s of r.slots) chk(Math.abs(s.w - cell.w) < 1e-9 && Math.abs(s.h - cell.h) < 1e-9, "副窗等大");
    // 不越界
    chk(r.contW <= W + 1e-6 && r.contH <= H + 1e-6, "容器越界");
    // 不重叠（含主窗）
    const boxes = [{ x: r.ox, y: r.oy, w: mainW, h: mainH, id: "main" }, ...r.slots.map((s, i) => ({ x: r.ox + s.x, y: r.oy + s.y, w: s.w, h: s.h, id: i }))];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i], B = boxes[j];
      const overlap = A.x + A.w - 1e-6 > B.x && B.x + B.w - 1e-6 > A.x && A.y + A.h - 1e-6 > B.y && B.y + B.h - 1e-6 > A.y;
      chk(!overlap, `重叠 ${A.id}×${B.id}`);
    }
    // 副窗在容器内
    for (const s of r.slots) chk(s.x >= -1e-6 && s.y >= -1e-6 && s.x + s.w <= r.contW + 1e-6 && s.y + s.h <= r.contH + 1e-6, "副窗越出容器");
    if (r.video < worst.ratio) worst = { ratio: r.video, tag };
  }
}
console.log(`\n失败 ${fails} 项；无解 ${noSolution.length} 组：`);
if (noSolution.length) console.log("  " + noSolution.join(", "));
console.log(`最差 vidFill: ${(worst.ratio * 100).toFixed(1)}% @ ${worst.tag}`);
