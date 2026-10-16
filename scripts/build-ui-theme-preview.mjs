// 独立设计原型构建，不修改产品入口和 dist。
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const preview = join(root, "preview");
await build({ entryPoints: [join(preview, "ui-theme-prototype.js")], outfile: join(preview, "ui-theme-preview.js"), bundle: true, format: "iife", target: ["chrome100", "safari15"], charset: "utf8", logLevel: "info" });
const cliIndex = process.argv.indexOf("--tailwind-cli");
if (cliIndex !== -1) {
  const cliPath = process.argv[cliIndex + 1];
  if (!cliPath) throw new Error("请提供 Tailwind CSS 3 CLI 路径");
  const result = spawnSync(process.execPath, [cliPath, "-c", join(preview, "ui-theme.tailwind.config.cjs"), "-i", join(preview, "ui-theme.tailwind.css"), "-o", join(preview, "ui-theme-preview.css"), "--minify"], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const [html, css, js] = await Promise.all([
  readFile(join(preview, "ui-theme-shell.html"), "utf8"),
  readFile(join(preview, "ui-theme-preview.css")),
  readFile(join(preview, "ui-theme-preview.js")),
]);
await writeFile(join(preview, "ui-theme-preview.html"), html
  .replace('href="./ui-theme-preview.css"', `href="data:text/css;base64,${css.toString("base64")}"`)
  .replace('src="./ui-theme-preview.js"', `src="data:text/javascript;base64,${js.toString("base64")}"`));
console.log("已生成单文件原型 preview/ui-theme-preview.html");
