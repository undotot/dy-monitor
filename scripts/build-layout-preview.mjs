// 预览独立构建，不生成或覆盖产品 dist。
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const preview = join(root, "preview");
await build({ entryPoints: [join(preview, "recursive-layout-ui.js")], outfile: join(preview, "recursive-layout-preview.js"), bundle: true, format: "iife", target: ["chrome100", "safari15"], charset: "utf8", logLevel: "info" });
await build({ entryPoints: [join(preview, "layout-research-ui.js")], outfile: join(preview, "layout-research-preview.js"), bundle: true, format: "iife", target: ["chrome100", "safari15"], charset: "utf8", logLevel: "info" });

// CSS 已随预览提交；改动 Tailwind 类名后可传入本地 CLI 路径重新生成。
const cliIndex = process.argv.indexOf("--tailwind-cli");
if (cliIndex !== -1) {
  const cliPath = process.argv[cliIndex + 1];
  if (!cliPath) throw new Error("--tailwind-cli 后需要提供 Tailwind CSS 3 的 CLI 路径");
  const result = spawnSync(process.execPath, [cliPath, "-c", join(preview, "recursive-layout.tailwind.config.cjs"), "-i", join(preview, "recursive-layout.tailwind.css"), "-o", join(preview, "recursive-layout-preview.css"), "--minify"], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

// 交付单文件 HTML：用内嵌 data URL 打包资源，双击即可离线打开，无需开发服务器。
const [markup, javascript, stylesheet] = await Promise.all([
  readFile(join(preview, "recursive-layout-preview.html"), "utf8"),
  readFile(join(preview, "recursive-layout-preview.js")),
  readFile(join(preview, "recursive-layout-preview.css")),
]);
const standalone = markup
  .replace('<body ', '<body data-preview-kind="comparison" ')
  .replace('<title>监控室 · 新布局预览 / 1–16 房</title>', '<title>监控室 · 自动选优与等大小窗排列对比</title>')
  .replace('href="./recursive-layout-preview.css"', `href="data:text/css;base64,${stylesheet.toString("base64")}"`)
  .replace('src="./recursive-layout-preview.js"', `src="data:text/javascript;base64,${javascript.toString("base64")}"`);
await writeFile(join(preview, "layout-options-preview.html"), standalone);

const [researchMarkup, researchJavascript] = await Promise.all([
  readFile(join(preview, "layout-research-shell.html"), "utf8"),
  readFile(join(preview, "layout-research-preview.js")),
]);
const researchStandalone = researchMarkup
  .replace('href="./recursive-layout-preview.css"', `href="data:text/css;base64,${stylesheet.toString("base64")}"`)
  .replace('src="./layout-research-preview.js"', `src="data:text/javascript;base64,${researchJavascript.toString("base64")}"`);
await writeFile(join(preview, "layout-research-preview.html"), researchStandalone);
