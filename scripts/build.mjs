// 打包：src/main.js → dist/douyu-monitor.user.js（单文件 IIFE，banner 注入版本号）。
// 默认不压缩（保留可读性，油猴面板里可直接调试）；--minify 时压缩输出。
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const banner = readFileSync(join(root, "src", "banner.txt"), "utf8").replaceAll("{{VERSION}}", pkg.version);

mkdirSync(join(root, "dist"), { recursive: true });

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
  minify: process.argv.includes("--minify"),
  logLevel: "info"
});

console.log(`built dist/douyu-monitor.user.js @ v${pkg.version}`);
