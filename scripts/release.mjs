// 发布流：版本 bump → 构建 → 验收门（node --check + 单测 + DOM 冒烟）→ txt 存档 → changelog。
// 用法：node scripts/release.mjs [patch|minor|major|x.y.z] [--notes "要点；要点"] [--minify] [--skip-gates]
// 任一验收门失败会回滚 package.json 版本号后退出；xwechat_files 里的原始脚本从不触碰。
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const deliverDir = resolve(root, ".."); // 交付物与存档都放在工程外层目录
const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const argValue = (flag) => {
  const i = argv.indexOf(flag);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : null;
};

const pkgPath = join(root, "package.json");
const pkgOriginal = readFileSync(pkgPath, "utf8");
const pkg = JSON.parse(pkgOriginal);

/* --- 版本号 --- */
const bumpKind = argv.find((a) => !a.startsWith("--") && a !== argValue("--notes")) || "patch";
const nextVersion = (current, kind) => {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const [major, minor, patch] = current.split(".").map(Number);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};
const oldVersion = pkg.version;
const version = nextVersion(oldVersion, bumpKind);
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`无效版本号：${version}`);
  process.exit(1);
}

const run = (args, label) => {
  console.log(`\n» ${label}`);
  const res = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  return res.status === 0;
};
const rollback = () => {
  writeFileSync(pkgPath, pkgOriginal, "utf8");
  console.error(`\n验收未通过，已回滚 package.json（版本保持 ${oldVersion}）。`);
};

pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
console.log(`版本：${oldVersion} → ${version}`);

const buildArgs = [join(root, "scripts", "build.mjs")];
if (has("--minify")) buildArgs.push("--minify");
const fail = () => {
  rollback();
  process.exit(1);
};
if (!run(buildArgs, "构建 dist/douyu-monitor.user.js")) fail();
if (!has("--skip-gates")) {
  if (!run(["--check", join(root, "dist", "douyu-monitor.user.js")], "语法检查 node --check")) fail();
  if (!run(["--test"], "单元测试 node --test")) fail();
  if (!run([join(root, "test", "integration.smoke.js")], "DOM 冒烟 test/integration.smoke.js")) fail();
}

const bundlePath = join(root, "dist", "douyu-monitor.user.js");
const bundle = readFileSync(bundlePath, "utf8");
if (bundle.includes("监看台") || bundle.includes("监看墙")) {
  console.error("产物仍含旧文案“监看台 / 监看墙”，中止发布。");
  fail();
}
if (bundle.includes("斗鱼监控室")) {
  console.error("产物仍含旧名“斗鱼监控室”（已改名“监控室”），中止发布。");
  fail();
}

/* --- txt 存档（plan: dist/监控室.txt + 外层版本化存档） --- */
mkdirSync(join(root, "dist"), { recursive: true });
const archiveTxt = join(root, "dist", "监控室.txt");
const versionedTxt = join(deliverDir, `监控室-${version}.txt`);
const deliverable = join(deliverDir, "监控室.user.js");
copyFileSync(bundlePath, archiveTxt);
copyFileSync(bundlePath, versionedTxt);
copyFileSync(bundlePath, deliverable);

/* --- changelog（开发阶段版本固定不变时并入现有同版本条目，不堆重复标题） --- */
const notes = (argValue("--notes") || "例行发布。").split(/[;；\n]/).map((s) => s.trim()).filter(Boolean);
const today = new Date().toISOString().slice(0, 10);
const changelogPath = join(root, "CHANGELOG.md");
let changelog = existsSync(changelogPath) ? readFileSync(changelogPath, "utf8") : "# 更新日志\n";
const bullets = notes.map((n) => `- ${n}`).join("\n");
const topHeading = changelog.match(/^## (\d+\.\d+\.\d+) - [^\n]*\n/m);
if (topHeading && topHeading[1] === version) {
  // 同版本续发：要点按时间顺序追加到该条目末尾（下一段标题之前）
  const next = changelog.indexOf("\n## ", topHeading.index + topHeading[0].length);
  const insertAt = next === -1 ? changelog.length : next;
  changelog = changelog.slice(0, insertAt) + `${bullets}\n` + changelog.slice(insertAt);
} else {
  const entry = `\n## ${version} - ${today}\n${bullets}\n`;
  if (changelog.startsWith("# 更新日志")) {
    changelog = changelog.replace("# 更新日志\n", `# 更新日志\n${entry}`);
  } else {
    changelog = `# 更新日志\n${entry}\n${changelog}`;
  }
}
writeFileSync(changelogPath, changelog.trimEnd() + "\n", "utf8");

console.log(`
发布完成 v${version}
  产物     ${bundlePath}
  txt 存档 ${archiveTxt}
           ${versionedTxt}
  交付物   ${deliverable}
  changelog ${changelogPath}
将 .user.js 拖入 Tampermonkey 安装（或覆盖旧版脚本）。`);
process.exit(0);
