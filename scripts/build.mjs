// 打包构建：双轨输出
// 1. 桌面端 (Tampermonkey): src/main.js → dist/douyu-monitor.user.js (target: chrome100)
// 2. iPad Safari (Stay 专属): src/main.js → dist/douyu-monitor.stay.user.js (target: safari15, ios15)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const banner = readFileSync(join(root, "src", "banner.txt"), "utf8").replaceAll("{{VERSION}}", pkg.version);
const bannerStay = readFileSync(join(root, "src", "banner.stay.txt"), "utf8").replaceAll("{{VERSION}}", pkg.version);

mkdirSync(join(root, "dist"), { recursive: true });

// 1. 桌面通用版 (Tampermonkey / Violentmonkey)
await build({
  entryPoints: [join(root, "src", "main.js")],
  bundle: true,
  format: "iife",
  target: "chrome100",
  charset: "utf8",
  banner: { js: banner },
  define: { __VERSION__: JSON.stringify(pkg.version) },
  loader: { ".css": "text" },
  outfile: join(root, "dist", "douyu-monitor.user.js"),
  minify: !process.argv.includes("--no-minify"),
  treeShaking: true,
  logLevel: "info"
});

console.log(`built dist/douyu-monitor.user.js @ v${pkg.version}`);
writeFileSync(join(root, "dist", "douyu-monitor.meta.js"), banner.trim() + "\n", "utf8");
console.log(`built dist/douyu-monitor.meta.js @ v${pkg.version}`);

// 2. iPad Safari (Stay 插件专属定制版)
await build({
  entryPoints: [join(root, "src", "main.js")],
  bundle: true,
  format: "iife",
  target: ["safari15", "ios15"],
  charset: "utf8",
  banner: { js: bannerStay },
  define: { __VERSION__: JSON.stringify(pkg.version) },
  loader: { ".css": "text" },
  outfile: join(root, "dist", "douyu-monitor.stay.user.js"),
  minify: !process.argv.includes("--no-minify"),
  treeShaking: true,
  logLevel: "info"
});

console.log(`built dist/douyu-monitor.stay.user.js @ v${pkg.version}`);
writeFileSync(join(root, "dist", "douyu-monitor.stay.meta.js"), bannerStay.trim() + "\n", "utf8");
console.log(`built dist/douyu-monitor.stay.meta.js @ v${pkg.version}`);
