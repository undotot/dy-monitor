// 一键发布并触发 GitHub Action:
// 1. 版本号自动递增（默认 patch，可传 minor / major / 1.2.x）
// 2. 本地自动构建与多重质量验收（build + check + test）
// 3. 自动更新 CHANGELOG
// 4. 自动 git add + commit + push 触发 GitHub Actions 与 CDN 部署
//
// 用法示例：
// npm run deploy
// npm run deploy minor
// npm run deploy -- --msg "修复团播排序问题"
// npm run deploy minor --msg "新增大功能"

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);

// 解析参数
const argValue = (flag) => {
  const i = argv.indexOf(flag);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : null;
};

const customMsg = argValue("--msg") || argValue("-m") || "例行更新与构建部署";
const bumpKind = argv.find((a) => !a.startsWith("-") && a !== argValue("--msg") && a !== argValue("-m")) || "patch";

const pkgPath = join(root, "package.json");
const pkgOriginal = readFileSync(pkgPath, "utf8");
const pkg = JSON.parse(pkgOriginal);

// 计算新版本号
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
  console.error(`❌ 无效版本号：${version}`);
  process.exit(1);
}

console.log(`\n========================================`);
console.log(`🚀 准备发布版本：v${oldVersion} → v${version}`);
console.log(`📝 更新说明：${customMsg}`);
console.log(`========================================\n`);

// 执行命令辅助函数
const run = (cmd, args, label) => {
  console.log(`» [${label}] ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: true });
  return res.status === 0;
};

// 1. 临时写入新版本号
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

// 回滚函数
const rollback = () => {
  writeFileSync(pkgPath, pkgOriginal, "utf8");
  console.error(`\n❌ 质量门未通过，已自动回滚 package.json 版本至 v${oldVersion}。发布终止。\n`);
  process.exit(1);
};

// 2. 本地执行全量构建与验收门
if (!run(process.execPath, ["scripts/build.mjs"], "打包构建")) rollback();
if (!run(process.execPath, ["--check", "dist/douyu-monitor.user.js"], "语法检查")) rollback();
if (!run("npm", ["test"], "全量单元测试与冒烟断言")) rollback();

// 3. 追加 CHANGELOG
try {
  const changelogPath = join(root, "CHANGELOG.md");
  const changelog = readFileSync(changelogPath, "utf8");
  const today = new Date().toISOString().slice(0, 10);
  const entry = `## ${version} - ${today}\n- ${customMsg}\n\n`;
  const headerIdx = changelog.indexOf("\n\n");
  const updatedChangelog = headerIdx >= 0
    ? changelog.slice(0, headerIdx + 2) + entry + changelog.slice(headerIdx + 2)
    : `# 更新日志\n\n${entry}${changelog}`;
  writeFileSync(changelogPath, updatedChangelog, "utf8");
  console.log(`✓ 已更新 CHANGELOG.md`);
} catch (err) {
  console.warn(`⚠ 更新 CHANGELOG 失败：${err.message}`);
}

// 4. Git 暂存、提交并推送到 GitHub 远程仓库
console.log(`\n» 正在提交代码并推送到 GitHub...`);
if (!run("git", ["add", "-A"], "Git 暂存")) rollback();

const commitMsg = `release: v${version} - ${customMsg}`;
if (!run("git", ["commit", "-m", `"${commitMsg}"`], "Git 提交")) {
  console.warn(`⚠ 无新变更可提交，尝试直接推送当前代码...`);
}

if (!run("git", ["push", "origin", "main"], "推送到 GitHub (触发 Action)")) {
  console.error(`\n❌ 推送到 GitHub 失败！请检查远程仓库权限或网络连接。`);
  process.exit(1);
}

console.log(`\n🎉 发布成功！GitHub Actions 已经自动开始流水线构建！`);
console.log(`🔗 查看 Action 运行进度: https://github.com/undotot/monitor-js/actions`);
console.log(`📦 jsDelivr CDN 分发直链: https://fastly.jsdelivr.net/gh/undotot/monitor-js@release/dist/douyu-monitor.user.js\n`);
