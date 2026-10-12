# 监控室 · 源码工程

Tampermonkey 单文件脚本《监控室 · 试用版》的源码工程。日常开发在 `src/` 里改模块，
`npm run build` 重新组装出单文件产物 `dist/douyu-monitor.user.js`，拖进 Tampermonkey 即可安装。

## 快速开始

本次调整：关注列表排除“斗鱼吃鸡赛事”；添加面板支持跨标签、跨搜索保留选择，使用“全选当前列表”勾选后统一添加。关闭添加面板结束本次选择，添加失败的房间保留勾选。新建与恢复房间默认关闭弹幕，控制栏和弹幕随小窗口缩放。

已实现截图所示放大模式：主画面位于左上，小房间安排在右侧和底部，所有小窗宽高一致、末行不拉伸。小视频完整保留比例，选择让整体黑边最少的卡片比例；大窗容器占用其余矩形空间，视频按原比例完整显示，允许黑边、不拉伸，其视频比例不限制小窗布局。平铺和画中画同样保留视频比例。窗口不足时统一缩小，全部同屏且无滚动条，不需要设置尺寸。顶部只保留轻量主播名与状态点，移除左下角常驻播放状态和时钟，音量移到底部工具栏第三位。选中态改用冷色短线和名称高亮，控制器仅在悬停或聚焦时显示。标题和画面都可拖拽换位；监控室整体顶栏支持向上收起并记住状态，顶部中间的展开/收起把手仅在鼠标移入指定区域或键盘聚焦时显示。卡片、列表、画中画和提醒统一显示主播名，工作区保存名称。实现说明与本地浏览器验证见 [docs/focus-layout.md](docs/focus-layout.md)。

```
npm ci            # 安装依赖（mpegts.js 运行依赖 + esbuild / happy-dom 开发依赖）
npm test          # 单元测试（node --test，纯逻辑）
npm run build     # 打包 → dist/douyu-monitor.user.js（默认不压缩，便于调试）
npm run smoke     # DOM 冒烟（happy-dom 跑构建产物；需先 build）
npm run release   # 发布：版本 bump + 构建 + 验收门 + txt 存档 + changelog
npm run check     # node --check 语法检查产物
```

## 目录结构

```
src/
├── banner.txt            # 油猴元数据模板（{{VERSION}} 构建时替换）
├── main.js               # bootstrap：去重、Shadow DOM、els 收集、initXxx 装配、restoreWorkspace
├── core/                 # 纯函数（settings/auth/room/danmaku/scheduler/fetch-json/workspace/…）
├── platform/             # GM_* 适配（storage）、页面滚动锁
├── api/                  # 关注列表、房间状态等接口
├── ui/                   # shell-markup / tile-markup / icons / styles.css（只碰 DOM）
├── playback/             # stream（取流/签名）、playback（mpegts 播放）、pip（画中画）
└── app/                  # initXxx(ctx) 模块：dom/audio/layout/status/tile/context-menu/
                          #   add-panel/drawer/persistence/keyboard/topbar/shell/live-watcher
test/                     # node --test 单测 + integration.smoke.js（happy-dom 冒烟）
scripts/                  # build.mjs（esbuild）/ release.mjs（发布流）/ split-from-bundle.mjs（一次性迁移工具）
dist/                     # 构建产物与 txt 存档
```

## 约定

- **ctx 模式**：`app/context.js` 的 `createContext()` 是唯一共享状态（tiles Map、scheduler、logs、
  pendingTiles、DOM 引用等）。每个 `initXxx(ctx)` 把自己的函数挂到 ctx 上；跨模块只经 `ctx.xxx` 调用，
  模块内部直呼本模块函数。
- **依赖分层**：core 无依赖 → platform → api/ui → playback → app。禁止 ui ↔ playback 互相 import；
  GM_* 只出现在 platform。
- **版本单一事实源**：`package.json` 的 `version`。构建时同时注入 banner `@version` 与代码常量
  `SCRIPT_VERSION`（esbuild define），Node 测试里有 `1.7.0-dev` 兜底。
- **产物保持单文件 IIFE**，`charset: "utf8"`（否则中文会被转成 `\uXXXX`），`@grant/@match/@sandbox` 不变。

## 恢复语义（“暂不加载”修复）

启动恢复时，上次保存的房间只放进 `ctx.pendingTiles` **挂起**，不装配进墙：

- 打开监控室时按 `resumeMode` 决定：`always` 直接装配并播放；`never` 直接开设置抽屉；`ask` 弹出询问。
- 选择“暂不加载”墙保持为空；`save()` 在墙为空时回写 pendingTiles，因此该选择不销毁上次布局。
- 只有点击“加载上次直播间”（或 resumeMode=always）才调用 `ctx.loadPendingTiles()` 真正装配；
  用户亲手添加房间后 pendingTiles 清空。

## 快捷键

快捷键与 **Esc 分层后退**均已按需求**暂时移除**：数字选格、方向键、Enter/Space、R/M/S/D/P/F/A/C/? 与
逐层 Esc（右键菜单 → 添加面板 → 恢复询问 → 吐司 → 画格设置 → 取消选择 → 收抽屉 → 退出确认）全部不可用，
连原生 Esc 关闭对话框也被拦下——弹层只用各自的关闭 / 确认按钮退出，主面板只走“退出监看”确认。
帮助面板与按键提示一并移除。恢复时改 `app/keyboard.js`（keymap + handleEscape）与 `app/shell.js`
的 dialog cancel 拦截，再把 `ui/shell-markup.js` 的按键提示补回。
（添加面板输入框内回车直加房号属于表单输入行为，仍保留。）

## 测试

- `test/*.test.js`：纯逻辑单测（md5/auth、parseRoom、fetchJson 错误映射、Scheduler 并发与节流、
  弹幕协议编解码、工作区 v1 迁移、模板 token、历史记录往返等）。
- `test/integration.smoke.js`：happy-dom 承载**构建产物**的端到端冒烟——启动不擅自装配、恢复询问文案、
  “暂不加载”空墙且保存不丢房间、确认加载进墙、抽屉开合、添加面板、Esc 分层。改交互后必跑。

## 发布与交付物

`npm run release [patch|minor|major|x.y.z] [--notes "要点"] [--minify] [--skip-gates]`

1. bump `package.json` 版本（验收失败自动回滚）；
2. 构建 + 验收门（node --check、单测、DOM 冒烟）+ 旧文案检查（监看台/监看墙 不得出现）；
3. txt 存档：`dist/监控室.txt` 与外层 `监控室-<版本>.txt`；
4. 交付物：外层 `监控室.user.js`（覆盖为最新构建）；
5. 写入 `CHANGELOG.md`。

原始脚本（xwechat_files 里的 `斗鱼监控室.txt`，原始文件名不改）始终保持原样，交付物一律是副本。
