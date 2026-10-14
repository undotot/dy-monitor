import { calculateFocusLayout } from "../src/core/focus-layout.js";
import { calculateUniformFocusLayout } from "../src/core/focus-uniform-layout.js";
const R = 16 / 9;
const f = (n) => n.toFixed(3);
const runs = [[2552, 1177, "2.17wide"], [1920, 1080, "16:9"], [1246, 654, "1.9"], [2560, 1080, "2.37"], [800, 600, "4:3"], [375, 600, "narrow"]];
for (const [w, h, tag] of runs) {
  console.log(`\n=== viewport ${w}x${h} (${tag}) aspect=${f(w / h)} ===`);
  for (const n of [1, 2, 4, 5, 8, 10, 16]) {
    const p = calculateFocusLayout({ width: w, height: h, secondaryRatios: Array(Math.max(0, n - 1)).fill(R) });
    if (!p) { console.log(` n=${n} null`); continue; }
    if (n === 1) { console.log(` n=1 main=${f(p.main.width)}x${f(p.main.height)} vidViewFill=${f(p.viewportFillRatio)}`); continue; }
    const cw = p.cell.width, ch = p.cell.height;
    const wallUsedH = p.topHeight + (p.bottomHeight ? p.bottomHeight + p.gapY : 0);
    console.log(` n=${String(n).padStart(2)} S=${p.S} grid=${p.cols}x${p.rows} cell=${f(cw)}x${f(ch)} main=${f(p.main.width)}x${f(p.main.height)} cont=${f(p.containerW)}x${f(p.containerH)} offY=${f(p.offsetY)} | vidFill=${f(p.viewportFillRatio)} layoutFill=${f(p.layoutFillRatio)} mainShare=${f(p.mainArea / (w * h))} Htight=${f(wallUsedH / h)}`);
  }
}
console.log("\n\n############ SCHEME E (unused, for comparison) ############");
for (const [w, h, tag] of runs) {
  console.log(`\n=== viewport ${w}x${h} (${tag}) ===`);
  for (const n of [1, 2, 4, 5, 8, 10, 16]) {
    const p = calculateUniformFocusLayout({ width: w, height: h, secondaryRatios: Array(Math.max(0, n - 1)).fill(R) });
    if (!p) { console.log(` n=${n} null`); continue; }
    console.log(` n=${String(n).padStart(2)} sig=${p.signature} main=${f(p.main.width)}x${f(p.main.height)} cell=${p.cell ? f(p.cell.width) + "x" + f(p.cell.height) : "-"} cont=${f(p.containerW)}x${f(p.containerH)} offY=${f(p.offsetY)} | vidFill=${f(p.videoViewportFillRatio)} layoutFill=${f(p.layoutFillRatio)}`);
  }
}
