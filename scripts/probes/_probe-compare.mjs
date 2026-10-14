import { calculateFocusLayout } from "../src/core/focus-layout.js";
import { calculateUniformFocusLayout } from "../src/core/focus-uniform-layout.js";
const R = 16 / 9;
const sizes = [[2552, 1177, "2.17 超宽"], [1920, 1080, "16:9"], [2560, 1080, "2.37 带鱼"], [1246, 654, "1.90"], [1366, 768, "16:9 本"], [800, 600, "4:3"], [375, 600, "窄竖"]];
const f = (n) => (n * 100).toFixed(1).padStart(5) + "%";
console.log("填充率比较：vidFill = 实际视频面积 / 视口面积（越高越好）");
console.log("N   | 尺寸        | 方案A(vidFill) | 方案E(vidFill) | A的E差");
const rows = [];
for (const [W, H, tag] of sizes) {
  for (const N of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16]) {
    const A = calculateFocusLayout({ width: W, height: H, secondaryRatios: Array(Math.max(0, N - 1)).fill(R) });
    const E = calculateUniformFocusLayout({ width: W, height: H, secondaryRatios: Array(Math.max(0, N - 1)).fill(R) });
    const a = A ? (N === 1 ? A.viewportFillRatio : A.viewportFillRatio) : NaN;
    const e = E ? E.videoViewportFillRatio : NaN;
    rows.push({ W, H, tag, N, a, e });
    if ([2, 4, 5, 8, 10, 16].includes(N)) console.log(`${String(N).padStart(2)}  | ${tag.padEnd(10)} | ${f(a)}        | ${f(e)}        | ${(a - e >= 0 ? "+" : "") + ((a - e) * 100).toFixed(1)}%`);
  }
}
// 汇总
const worse = rows.filter((r) => r.a < r.e - 1e-9);
const bigGap = rows.filter((r) => r.e - r.a > 0.08);
console.log(`\n总计 ${rows.length} 组合；A 劣于 E 的 ${worse.length} 组；E 领先超过 8 个百分点的 ${bigGap.length} 组：`);
for (const r of bigGap.sort((x, y) => (y.e - y.a) - (x.e - x.a)).slice(0, 12)) console.log(`  ${r.W}x${r.H} (${r.tag}) N=${r.N}: A=${f(r.a)} E=${f(r.e)} 差=${((r.e - r.a) * 100).toFixed(1)}%`);
const avgA = rows.reduce((s, r) => s + r.a, 0) / rows.length, avgE = rows.reduce((s, r) => s + r.e, 0) / rows.length;
console.log(`\n平均 vidFill: A=${f(avgA)}  E=${f(avgE)}`);
