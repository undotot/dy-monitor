// 自动化双仓发布流：
// 1. 版本号递增 + 本地质量门验收（build + check + test）
// 2. 纯分发仓库（undotot/monitor-js）：仅推送打包后的 douyu-monitor.user.js 与 douyu-monitor.meta.js
// 3. 源码工程仓库（undotot/dy-monitor）：推送完整工程源码与 CHANGELOG
// 4. 自动刷新 jsDelivr CDN 节点缓存
//
// 用法示例：
// npm run deploy
// npm run deploy minor
// npm run deploy -- --msg "优化团播排序与音量控制"

import { readFileSync, writeFileSync, copyFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);

const DIST_REPO_URL = "https://github.com/undotot/monitor-js.git";
const SOURCE_REPO_URL = "https://github.com/undotot/dy-monitor.git";

// 参数解析
const argValue = (flag) => {
  const i = argv.indexOf(flag);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : null;
};

const customMsg = argValue("--msg") || argValue("-m") || "更新监控室脚本与分发产物";
const bumpKind = argv.find((a) => !a.startsWith("-") && a !== argValue("--msg") && a !== argValue("-m")) || "patch";

const pkgPath = join(root, "package.json");
const pkgOriginal = readFileSync(pkgPath, "utf8");
const pkg = JSON.parse(pkgOriginal);

// 版本递增
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
console.log(`📦 分发仓库：${DIST_REPO_URL}（仅含打包 JS 产物）`);
console.log(`🛠️ 源码仓库：${SOURCE_REPO_URL}（源码与工程）`);
console.log(`========================================\n`);

const run = (cmd, args, label, cwd = root) => {
  console.log(`» [${label}] ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: true });
  return res.status === 0;
};

// 1. 临时写入新版本号
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

const rollback = () => {
  writeFileSync(pkgPath, pkgOriginal, "utf8");
  console.error(`\n❌ 质量门未通过，已自动回滚 package.json 版本至 v${oldVersion}。发布终止。\n`);
  process.exit(1);
};

// 2. 本地执行全量构建与验收门
if (!run(process.execPath, ["scripts/build.mjs"], "打包构建")) rollback();
if (!run(process.execPath, ["--check", "dist/douyu-monitor.user.js"], "语法检查")) rollback();
if (!run("npm", ["test"], "全量单元测试与冒烟断言")) rollback();

// 3. 更新 CHANGELOG
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

// 4. 关键步骤：独立推送打包产物至纯分发仓库 undotot/monitor-js
console.log(`\n========================================`);
console.log(`📤 正在将编译产物推送到纯分发仓库 monitor-js...`);
console.log(`========================================`);

const deployTmpDir = join(root, ".deploy-temp");
try {
  if (existsSync(deployTmpDir)) rmSync(deployTmpDir, { recursive: true, force: true });
  mkdirSync(deployTmpDir, { recursive: true });

  // 仅复制打包后的两份核心 JS 产物与一份简短 README
  copyFileSync(join(root, "dist", "douyu-monitor.user.js"), join(deployTmpDir, "douyu-monitor.user.js"));
  copyFileSync(join(root, "dist", "douyu-monitor.meta.js"), join(deployTmpDir, "douyu-monitor.meta.js"));

  // 同步输出发版交付物至 D:/PROJECT/mom/ 根目录
  try {
    const momRoot = join(root, "..");
    copyFileSync(join(root, "dist", "douyu-monitor.user.js"), join(momRoot, "监控室.user.js"));
    copyFileSync(join(root, "dist", "douyu-monitor.user.js"), join(momRoot, `监控室-${version}.txt`));
    console.log(`✓ 已同步输出交付物至: D:/PROJECT/mom/监控室.user.js 和 监控室-${version}.txt`);
  } catch (err) {
    console.warn(`⚠ 拷贝交付物至上层目录警告: ${err.message}`);
  }
  
  const distReadme = `# 斗鱼监控室 · 纯静态分发镜像\n\n> 本仓库仅用于托管斗鱼监控室编译后的 Userscript 产物与 CDN 镜像分发。\n> 源码开发工程存放在 [undotot/dy-monitor](https://github.com/undotot/dy-monitor)。\n\n### 一键安装链接\n- **脚本下载安装**：[douyu-monitor.user.js](https://fastly.jsdelivr.net/gh/undotot/monitor-js@main/douyu-monitor.user.js)\n- **版本检查元数据**：[douyu-monitor.meta.js](https://fastly.jsdelivr.net/gh/undotot/monitor-js@main/douyu-monitor.meta.js)\n\n**当前版本**：v${version}\n`;
  writeFileSync(join(deployTmpDir, "README.md"), distReadme, "utf8");

  // 初始化并推送到 monitor-js 仓库 main 分支
  run("git", ["init"], "初始化产物仓库", deployTmpDir);
  run("git", ["branch", "-M", "main"], "切换 main 分支", deployTmpDir);
  run("git", ["add", "-A"], "暂存 JS 产物", deployTmpDir);
  run("git", ["commit", "-m", `"release: v${version} (build artifact)"`], "提交编译产物", deployTmpDir);
  
  const pushSuccess = run("git", ["push", "-f", DIST_REPO_URL, "main"], "强制同步至 monitor-js 仓库", deployTmpDir);
  if (!pushSuccess) {
    console.warn(`⚠ 推送至 monitor-js 失败，请检查网络或 GitHub 认证。`);
  } else {
    console.log(`✓ 纯分发仓库 monitor-js 更新成功！`);
  }
} catch (err) {
  console.error(`❌ 分发仓库推送发生错误: ${err.message}`);
} finally {
  try { rmSync(deployTmpDir, { recursive: true, force: true }); } catch {}
}

// 5. 刷新 jsDelivr CDN 缓存
console.log(`\n» 正在刷新 jsDelivr CDN 缓存节点...`);
try {
  run("curl", ["-s", `"https://purge.jsdelivr.net/gh/undotot/monitor-js@main/douyu-monitor.meta.js"`], "刷新 CDN 元数据缓存");
  run("curl", ["-s", `"https://purge.jsdelivr.net/gh/undotot/monitor-js@main/douyu-monitor.user.js"`], "刷新 CDN 脚本缓存");
  console.log(`✓ jsDelivr CDN 缓存刷新请求已送达。`);
} catch {}

// 6. 提交源码工程到实际源码仓库 dy-monitor
console.log(`\n========================================`);
console.log(`📁 正在提交源码至实际源码仓库 dy-monitor...`);
console.log(`========================================`);

run("git", ["remote", "set-url", "origin", SOURCE_REPO_URL], "关联源码仓库 origin");
run("git", ["add", "-A"], "Git 暂存源码变更");
run("git", ["commit", "-m", `"release: v${version} - ${customMsg}"`], "提交源码更新");
const pushSourceSuccess = run("git", ["push", "origin", "main"], "推送到源码仓库 dy-monitor");

if (pushSourceSuccess) {
  console.log(`✓ 源码仓库 dy-monitor 同步成功！`);
} else {
  console.warn(`⚠ 源码推送到 dy-monitor 失败，可稍后手动执行 git push origin main。`);
}

console.log(`\n======================================================`);
console.log(`🎉 发布完成！`);
console.log(`📦 纯分发仓库 (JS): https://github.com/undotot/monitor-js`);
console.log(`🛠️ 源码开发仓库:   https://github.com/undotot/dy-monitor`);
console.log(`🚀 jsDelivr CDN 直链 (油猴一键安装):`);
console.log(`👉 https://fastly.jsdelivr.net/gh/undotot/monitor-js@main/douyu-monitor.user.js`);
console.log(`🔍 jsDelivr 元数据直链 (自动检查更新):`);
console.log(`👉 https://fastly.jsdelivr.net/gh/undotot/monitor-js@main/douyu-monitor.meta.js`);
console.log(`======================================================\n`);
