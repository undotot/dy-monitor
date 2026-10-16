// 监控室 · 一键提交与发布脚本 (Interactive & CLI Publisher)
// 功能特性：
// 1. 支持交互式命令行（自动询问更新日志与升级级别）与非交互式命令行参数
// 2. 自动化质量门检验：构建打包、语法合规校验、单测与冒烟、违禁文案过滤
// 3. 自动 SemVer 版本递增与 CHANGELOG.md 追加维护
// 4. 双仓原子级发布：源码仓 (undotot/dy-monitor) + 纯产物分发仓 (undotot/monitor-js)
// 5. 自动刷新 jsDelivr CDN 节点缓存
// 6. 统一向 D:/PROJECT/mom/ 输出离线单文件脚本与快照 txt 交付物
//
// 命令行示例：
// node scripts/publish.mjs
// node scripts/publish.mjs patch --msg "优化单格音量防脱手控制"
// node scripts/publish.mjs minor --msg "新增主窗等比例缩放功能" --notes "要点1；要点2"
//   --notes：CHANGELOG 多条要点（分号分隔），缺省沿用 --msg 单条
// node scripts/publish.mjs --local --msg "仅本地构建验证"

import { readFileSync, writeFileSync, copyFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const momRoot = resolve(root, "..");
const argv = process.argv.slice(2);

const DIST_REPO_URL = "https://github.com/undotot/monitor-js.git";
const SOURCE_REPO_URL = "https://github.com/undotot/dy-monitor.git";

// 参数解析助手
const hasFlag = (f) => argv.includes(f);
const argValue = (flag) => {
  const i = argv.indexOf(flag);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : null;
};

// 执行外部命令
const run = (cmd, args, label, cwd = root) => {
  console.log(`» [${label}] ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: true });
  return res.status === 0;
};

// 交互式输入逻辑
async function resolveInputs() {
  let customMsg = argValue("--msg") || argValue("-m");
  let releaseNotes = argValue("--notes");
  let bumpKind = argv.find((a) => !a.startsWith("-") && a !== customMsg && a !== releaseNotes);
  const isLocal = hasFlag("--local");
  const skipTests = hasFlag("--skip-tests");

  // 若处于交互终端且未提供消息参数，则交互式询问
  if (!customMsg && process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      console.log(`\n======================================================`);
      console.log(`🛠️  监控室 · 一键提交与发布助手`);
      console.log(`======================================================\n`);

      const inputMsg = await rl.question(`📝 请输入本次提交说明 (Commit Message) [默认: 日常优化与功能更新]: `);
      customMsg = inputMsg.trim() || "日常优化与功能更新";

      if (!bumpKind) {
        console.log(`\n🏷️ 请选择版本递增类型：`);
        console.log(`   [1] patch  补丁更新 (如 1.2.34 -> 1.2.35，日常修复推荐)`);
        console.log(`   [2] minor  特性更新 (如 1.2.34 -> 1.3.0，增加新功能推荐)`);
        console.log(`   [3] major  主版本更新 (如 1.2.34 -> 2.0.0，重构架构)`);
        const kindInput = await rl.question(`👉 请选择 [1/2/3/自定义版本号, 默认 1]: `);
        const trimmed = kindInput.trim();
        if (trimmed === "2") bumpKind = "minor";
        else if (trimmed === "3") bumpKind = "major";
        else if (/^\d+\.\d+\.\d+$/.test(trimmed)) bumpKind = trimmed;
        else bumpKind = "patch";
      }
    } finally {
      rl.close();
    }
  }

  return {
    customMsg: customMsg || "日常优化与功能更新",
    releaseNotes,
    bumpKind: bumpKind || "patch",
    isLocal,
    skipTests
  };
}

async function main() {
  const { customMsg, releaseNotes, bumpKind, isLocal, skipTests } = await resolveInputs();

  const pkgPath = join(root, "package.json");
  const pkgOriginal = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(pkgOriginal);

  // 版本递增计算
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

  console.log(`\n======================================================`);
  console.log(`🚀 准备发布版本：v${oldVersion} → v${version} (${bumpKind})`);
  console.log(`📝 提交更新说明：${customMsg}`);
  console.log(`🎯 发布模式：${isLocal ? "仅本地打包归档 (跳过推送)" : "完整发布 (本地归档 + GitHub双仓 + CDN刷新)"}`);
  console.log(`======================================================\n`);

  // 1. 预先更新 package.json
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

  const rollback = () => {
    writeFileSync(pkgPath, pkgOriginal, "utf8");
    console.error(`\n❌ 质量门验收未通过，已回滚 package.json 版本至 v${oldVersion}。发布中断。\n`);
    process.exit(1);
  };

  // 2. 严格质量门验收
  console.log(`\n--- 阶段一：全自动化质量门验收 ---`);
  if (!run(process.execPath, ["scripts/build.mjs"], "打包构建双版本 (桌面通用版 + iPad Stay版)")) rollback();
  if (!run(process.execPath, ["--check", "dist/douyu-monitor.user.js"], "桌面版语法合规性检查 (node --check)")) rollback();
  if (!run(process.execPath, ["--check", "dist/douyu-monitor.stay.user.js"], "iPad Stay版语法合规性检查 (node --check)")) rollback();

  if (!skipTests) {
    if (!run("npm", ["test"], "全量单元测试与集成冒烟 (npm test)")) rollback();
  } else {
    console.log(`⚠ 已跳过测试套件验收 (--skip-tests)`);
  }

  // 3. 文案规范合规性校验
  const bundlePath = join(root, "dist", "douyu-monitor.user.js");
  const stayBundlePath = join(root, "dist", "douyu-monitor.stay.user.js");
  const bundleContent = readFileSync(bundlePath, "utf8");
  const stayBundleContent = readFileSync(stayBundlePath, "utf8");
  if (bundleContent.includes("监看台") || bundleContent.includes("监看墙") || stayBundleContent.includes("监看台") || stayBundleContent.includes("监看墙")) {
    console.error(`❌ 错误：构建产物中仍检测到废弃文案“监看台 / 监看墙”，必须统一使用“监控室”。`);
    rollback();
  }

  // 4. 追加 CHANGELOG.md
  try {
    const changelogPath = join(root, "CHANGELOG.md");
    const changelog = existsSync(changelogPath) ? readFileSync(changelogPath, "utf8") : "# 更新日志\n\n";
    const today = new Date().toISOString().slice(0, 10);
    const notes = (releaseNotes || customMsg).split(/[;；\n]/).map((s) => s.trim()).filter(Boolean);
    // 行尾统一按 LF 计算、写回时还原文件行尾：CRLF/混合行尾下 "\n\n" 字面匹配会错位，曾误走兜底分支重复插入标题
    const eol = changelog.includes("\r\n") ? "\r\n" : "\n";
    const normalized = changelog.replace(/\r\n/g, "\n");
    const entry = `## ${version} - ${today}\n${notes.map((n) => `- ${n}`).join("\n")}\n\n`;
    const headerIdx = normalized.indexOf("\n\n");
    const updated = headerIdx >= 0
      ? normalized.slice(0, headerIdx + 2) + entry + normalized.slice(headerIdx + 2)
      : `# 更新日志\n\n${entry}${normalized}`;
    writeFileSync(changelogPath, eol === "\n" ? updated : updated.replace(/\n/g, "\r\n"), "utf8");
    console.log(`✓ 已更新 CHANGELOG.md`);
  } catch (err) {
    console.warn(`⚠ 更新 CHANGELOG 警告：${err.message}`);
  }

  // 5. 输出本地发版交付物至 D:/PROJECT/mom/ (双版本)
  console.log(`\n--- 阶段二：本地交付物归档与快照 (双版本) ---`);
  try {
    // 桌面通用版
    const deliverUserJs = join(momRoot, "监控室.user.js");
    const deliverTxt = join(momRoot, `监控室-${version}.txt`);
    const distTxt = join(root, "dist", "监控室.txt");

    copyFileSync(bundlePath, deliverUserJs);
    copyFileSync(bundlePath, deliverTxt);
    copyFileSync(bundlePath, distTxt);
    console.log(`✓ [桌面通用版] 已同步更新本地生产文件: ${deliverUserJs}`);
    console.log(`✓ [桌面通用版] 已生成版本快照归档: ${deliverTxt}`);

    // iPad Safari Stay 专属版
    const deliverStayUserJs = join(momRoot, "监控室.stay.user.js");
    const deliverStayTxt = join(momRoot, `监控室-stay-${version}.txt`);
    const distStayTxt = join(root, "dist", "监控室.stay.txt");

    copyFileSync(stayBundlePath, deliverStayUserJs);
    copyFileSync(stayBundlePath, deliverStayTxt);
    copyFileSync(stayBundlePath, distStayTxt);
    console.log(`✓ [iPad Stay版] 已同步更新本地生产文件: ${deliverStayUserJs}`);
    console.log(`✓ [iPad Stay版] 已生成版本快照归档: ${deliverStayTxt}`);

    // 同步工程内与外层的交互预览 HTML 文件
    const innerPreview = join(root, "focus-scheme-a-preview.html");
    const outerPreview = join(momRoot, "focus-scheme-a-preview.html");
    if (existsSync(innerPreview)) {
      copyFileSync(innerPreview, outerPreview);
      console.log(`✓ 已同步外层全真交互预览: ${outerPreview}`);
    }
  } catch (err) {
    console.warn(`⚠ 本地交付物同步异常: ${err.message}`);
  }

  if (isLocal) {
    console.log(`\n🎉 本地构建与交付成功完成 (v${version})！已跳过远程推送。`);
    return;
  }

  // 6. 提交与推送至纯分发仓库 undotot/monitor-js (双版本)
  console.log(`\n--- 阶段三：推送纯分发仓库 (monitor-js, 双版本) ---`);
  const deployTmpDir = join(root, ".deploy-temp");
  try {
    if (existsSync(deployTmpDir)) rmSync(deployTmpDir, { recursive: true, force: true });
    mkdirSync(deployTmpDir, { recursive: true });

    // 复制 4 个产物文件
    copyFileSync(join(root, "dist", "douyu-monitor.user.js"), join(deployTmpDir, "douyu-monitor.user.js"));
    copyFileSync(join(root, "dist", "douyu-monitor.meta.js"), join(deployTmpDir, "douyu-monitor.meta.js"));
    copyFileSync(join(root, "dist", "douyu-monitor.stay.user.js"), join(deployTmpDir, "douyu-monitor.stay.user.js"));
    copyFileSync(join(root, "dist", "douyu-monitor.stay.meta.js"), join(deployTmpDir, "douyu-monitor.stay.meta.js"));

    const distReadme = `# 斗鱼监控室 · 纯静态分发镜像\n\n> 本仓库仅用于托管斗鱼监控室编译后的 Userscript 产物与 CDN 镜像分发。\n> 源码开发工程存放在 [undotot/dy-monitor](https://github.com/undotot/dy-monitor)。\n\n**当前版本**：v${version}\n\n## 🖥️ 桌面通用版 (Tampermonkey / Violentmonkey / ScriptCat)\n- **jsDelivr CDN 直链（推荐）**：[douyu-monitor.user.js](https://cdn.jsdelivr.net/gh/undotot/monitor-js@main/douyu-monitor.user.js)\n- **jsDelivr 精准 Tag 直链（免缓存）**：[douyu-monitor.user.js (v${version})](https://cdn.jsdelivr.net/gh/undotot/monitor-js@v${version}/douyu-monitor.user.js)\n- **版本检查元数据**：[douyu-monitor.meta.js](https://cdn.jsdelivr.net/gh/undotot/monitor-js@main/douyu-monitor.meta.js)\n\n## 📱 iPad Safari 专属版 (Stay 插件专用)\n- **jsDelivr CDN 直链（推荐）**：[douyu-monitor.stay.user.js](https://cdn.jsdelivr.net/gh/undotot/monitor-js@main/douyu-monitor.stay.user.js)\n- **jsDelivr 精准 Tag 直链（免缓存）**：[douyu-monitor.stay.user.js (v${version})](https://cdn.jsdelivr.net/gh/undotot/monitor-js@v${version}/douyu-monitor.stay.user.js)\n- **版本检查元数据**：[douyu-monitor.stay.meta.js](https://cdn.jsdelivr.net/gh/undotot/monitor-js@main/douyu-monitor.stay.meta.js)\n`;
    writeFileSync(join(deployTmpDir, "README.md"), distReadme, "utf8");

    run("git", ["init"], "初始化产物仓库", deployTmpDir);
    run("git", ["branch", "-M", "main"], "切换 main 分支", deployTmpDir);
    run("git", ["add", "-A"], "暂存编译产物", deployTmpDir);
    run("git", ["commit", "-m", `"release: v${version} (dual-build artifacts)"`], "提交产物", deployTmpDir);
    run("git", ["tag", "-f", `v${version}`], `创建产物标签 v${version}`, deployTmpDir);

    const pushDist = run("git", ["push", "-f", DIST_REPO_URL, "main"], "推送到 monitor-js:main", deployTmpDir);
    run("git", ["push", "-f", DIST_REPO_URL, `v${version}`], `推送 tag v${version} 到 monitor-js`, deployTmpDir);

    if (pushDist) {
      console.log(`✓ 纯分发仓库 monitor-js 双版本同步成功！`);
    } else {
      console.warn(`⚠ 推送到 monitor-js 失败，请检查网络连接。`);
    }
  } catch (err) {
    console.error(`❌ 分发仓库推送发生错误: ${err.message}`);
  } finally {
    try { rmSync(deployTmpDir, { recursive: true, force: true }); } catch {}
  }

  // 7. 刷新 jsDelivr CDN 边缘缓存节点 (双版本 8 个 URL)
  console.log(`\n--- 阶段四：刷新 jsDelivr CDN 节点缓存 (双版本) ---`);
  try {
    // 桌面版
    run("curl", ["-s", `"https://purge.jsdelivr.net/gh/undotot/monitor-js@main/douyu-monitor.meta.js"`], "刷新桌面版 CDN 元数据缓存");
    run("curl", ["-s", `"https://purge.jsdelivr.net/gh/undotot/monitor-js@main/douyu-monitor.user.js"`], "刷新桌面版 CDN 脚本缓存");
    run("curl", ["-s", `"https://purge.jsdelivr.net/gh/undotot/monitor-js@v${version}/douyu-monitor.meta.js"`], "刷新桌面版 Tag CDN 元数据缓存");
    run("curl", ["-s", `"https://purge.jsdelivr.net/gh/undotot/monitor-js@v${version}/douyu-monitor.user.js"`], "刷新桌面版 Tag CDN 脚本缓存");
    // Stay 版
    run("curl", ["-s", `"https://purge.jsdelivr.net/gh/undotot/monitor-js@main/douyu-monitor.stay.meta.js"`], "刷新 iPad Stay版 CDN 元数据缓存");
    run("curl", ["-s", `"https://purge.jsdelivr.net/gh/undotot/monitor-js@main/douyu-monitor.stay.user.js"`], "刷新 iPad Stay版 CDN 脚本缓存");
    run("curl", ["-s", `"https://purge.jsdelivr.net/gh/undotot/monitor-js@v${version}/douyu-monitor.stay.meta.js"`], "刷新 iPad Stay版 Tag CDN 元数据缓存");
    run("curl", ["-s", `"https://purge.jsdelivr.net/gh/undotot/monitor-js@v${version}/douyu-monitor.stay.user.js"`], "刷新 iPad Stay版 Tag CDN 脚本缓存");
    console.log(`✓ jsDelivr CDN 双版本节点已发送秒级刷新指令。`);
  } catch (err) {
    console.warn(`⚠ 刷新 CDN 请求警告: ${err.message}`);
  }

  // 8. 提交源码工程到实际源码仓库 dy-monitor
  console.log(`\n--- 阶段五：提交与推送源码工程 (dy-monitor) ---`);
  run("git", ["remote", "set-url", "origin", SOURCE_REPO_URL], "关联源码远程 origin");
  run("git", ["add", "-A"], "Git 暂存源码变更");
  run("git", ["commit", "-m", `"release: v${version} - ${customMsg}"`], "提交源码更新");
  run("git", ["tag", "-f", `v${version}`], `创建源码标签 v${version}`);
  const pushSource = run("git", ["push", "origin", "main"], "推送到源码仓 main");
  run("git", ["push", "-f", "origin", `v${version}`], "推送源码 tag 到 dy-monitor");

  if (pushSource) {
    console.log(`✓ 源码仓库 dy-monitor 同步成功！`);
  } else {
    console.warn(`⚠ 源码推送到 dy-monitor 遇到网络抖动，可稍后重试 git push origin main。`);
  }

  // 9. 最终输出汇总卡片 (双版本)
  console.log(`\n======================================================`);
  console.log(`🎉 双版本同步发布完成！版本：v${version}`);
  console.log(`------------------------------------------------------`);
  console.log(`🖥️ 【桌面通用版】(Tampermonkey / Violentmonkey / ScriptCat):`);
  console.log(`  📁 本地生产交付物: D:/PROJECT/mom/监控室.user.js`);
  console.log(`  📁 本地历史快照:   D:/PROJECT/mom/监控室-${version}.txt`);
  console.log(`  🚀 jsDelivr Tag:   https://cdn.jsdelivr.net/gh/undotot/monitor-js@v${version}/douyu-monitor.user.js`);
  console.log(`  🚀 jsDelivr Main:  https://cdn.jsdelivr.net/gh/undotot/monitor-js@main/douyu-monitor.user.js`);
  console.log(`  ⚡ GitHub Raw:     https://raw.githubusercontent.com/undotot/monitor-js/main/douyu-monitor.user.js`);
  console.log(`------------------------------------------------------`);
  console.log(`📱 【iPad Safari 专属版】(Stay 插件专用):`);
  console.log(`  📁 本地生产交付物: D:/PROJECT/mom/监控室.stay.user.js`);
  console.log(`  📁 本地历史快照:   D:/PROJECT/mom/监控室-stay-${version}.txt`);
  console.log(`  🚀 jsDelivr Tag:   https://cdn.jsdelivr.net/gh/undotot/monitor-js@v${version}/douyu-monitor.stay.user.js`);
  console.log(`  🚀 jsDelivr Main:  https://cdn.jsdelivr.net/gh/undotot/monitor-js@main/douyu-monitor.stay.user.js`);
  console.log(`  ⚡ GitHub Raw:     https://raw.githubusercontent.com/undotot/monitor-js/main/douyu-monitor.stay.user.js`);
  console.log(`======================================================\n`);
}

main().catch((err) => {
  console.error("❌ 发布过程发生未捕获异常:", err);
  process.exit(1);
});
