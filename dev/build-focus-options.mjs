// 生成可双击打开的离线预览。正式 build 不引用这些文件。
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const directory = path.dirname(fileURLToPath(import.meta.url));
await build({ entryPoints: [path.join(directory, "focus-options.preview.js")], outfile: path.join(directory, "focus-options.bundle.js"), bundle: true, format: "iife", target: "es2022", minify: true, legalComments: "none" });
const template = await readFile(path.join(directory, "focus-options.template.html"), "utf8");
await writeFile(path.join(directory, "focus-options.html"), template);
for (const mode of ["A", "B", "C", "D", "current"]) await writeFile(path.join(directory, `focus-options-${mode}.html`), template.replace('data-start-mode="D"', `data-start-mode="${mode}"`));
console.log("已生成 dev/focus-options.html（本地 CSS / JS，无 CDN）");
