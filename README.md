# 监控室 · 源码工程

Tampermonkey 单文件脚本《监控室 · 试用版》的源码工程。日常开发在 `src/` 里改模块，
`npm run build` 重新组装出单文件产物 `dist/douyu-monitor.user.js`，拖进 Tampermonkey 即可安装。

## 快速开始

## 界面结构（v2.1）

- **斗鱼黑暗模式**：中性黑灰底 + 品牌橙 `#ff5d23`；选中为细橙描边，品牌橙填充只给“添加房间”等主按钮。状态仍用绿/蓝/琥珀/红语义色。
- **PC**：56px 顶栏 + 右侧 320px“当前房间”检查器。检查器分“当前房间 / 房间库”，承载播放、静音、独奏、放大、音量、弹幕、画质、重新取流、替换房号、打开直播间和移除（6 秒撤销）。
- **iPad / 窄屏**：检查器收起，底部 76px + 安全区控制条常驻；点“更多”打开房间面板，横屏三段式、竖屏单列。添加房间和设置都使用底部面板，44/48px 命中区。
- **画格**：空闲时不再显示整排工具条；悬停/选中只出现播放、放大、更多三个快捷按钮，触屏选中只保留 44px“更多”。右键菜单保留为桌面快捷方式。选中不改变声音，独奏对象独立于选中；画格顶部只保留状态点与主播名，非直播态显示一句话状态。
- **添加与设置**：添加面板桌面为右侧抽屉、触屏为底部面板；整行可选、底部已选托盘、显式搜索按钮与 Enter 搜索。设置按播放/弹幕/声音/工作区/诊断分页。
- **整理位置**：顶栏“更多 → 整理位置”进入点击换位，点源画格再点目标画格；取消按记录逆序恢复。
- 保留：综合均衡放大布局、恢复询问/暂不加载语义、工作区 schema v2、GM 存储键、单文件 Shadow DOM 产物。

放大模式采用“综合均衡”：主窗位于左上或水平居中、顶部对齐，小窗在右侧、左右及底部自动排列，所有小窗等宽等高。主副画格均保持源比例；同一源比例时无内部黑边、空槽或拉伸，混合源比例时保留所选主窗，比例不同的副窗以黑边适配，整体矩形等比适配画墙，只在一条轴上对称留白。默认主窗面积目标为小窗的 6 倍，在覆盖率和大小差距之间评分；同源比例下常规上限为 16 倍，没有适中放大解时回退全等大网格。窗口缩放时收益不足 2 个百分点保留原排列，坐标仍实时重算。指定主窗的副窗源比例冲突时，保留用户点选的房间作为主窗，不再自动换到其他直播间；副窗仍等大，比例不同的小窗以黑边适配，并在画墙右上角提示。只有当前房间在当前画墙无法生成放大布局时才恢复平铺。预览与播放器共用同一份布局代码。平铺和画中画同样保留视频比例。窗口不足时统一缩小，全部同屏且无滚动条，不需要设置尺寸。画格顶部只保留状态点与主播名，非直播态补充一句话状态；单房音量、弹幕和画质在检查器/房间面板中调整。选中态使用斗鱼橙细描边，主画面在名字胶囊里显示“主”徽标。标题和画面都可拖拽换位，另有不依赖拖拽的“整理位置”模式。顶栏可收起并记住状态，收起后显示一条可点的迷你状态条。卡片、列表、画中画和提醒统一显示主播名，工作区保存名称。规则及数据流见 [docs/focus-layout.md](docs/focus-layout.md)。

```
npm ci            # 安装依赖（mpegts.js 运行依赖 + esbuild / happy-dom 开发依赖）
npm test          # 单元测试（node --test，纯逻辑）
npm run build     # 打包 → dist/douyu-monitor.user.js（默认不压缩，便于调试）
npm run smoke     # DOM 冒烟（happy-dom 跑构建产物；需先 build）
npm run release   # 发布：版本 bump + 构建 + 验收门 + txt 存档 + changelog
npm run check     # node --check 语法检查产物
```

## 房间搜索与全屏

添加面板停输 500ms 后自动搜索，中文组词期间不请求；右侧提供显式“搜索”按钮，非组词时 Enter 也会立即搜索。主播名使用斗鱼官网正式的“用户 → 主播”搜索接口，保留官方排序、支持加载更多；房号和链接精确查询后展示结果。关注/历史/团播列表支持整行点选，底部显示“已选 N 个”，点击“添加选中”或单行“添加”才进墙。继续输入、清空、切页或关闭面板会取消旧查询，跨搜索和标签页的选择保留。

直播间全屏按 Shadow DOM 的真实全屏元素判断，兼容标准与 WebKit 接口，浏览器主动退出后同步按钮并恢复原布局。说明与验证记录见 [docs/FULLSCREEN-SEARCH-FIX.md](docs/FULLSCREEN-SEARCH-FIX.md)。

## 目录结构

```
src/
├── banner.txt            # 油猴元数据模板（{{VERSION}} 构建时替换）
├── main.js               # bootstrap：去重、Shadow DOM、els 收集、initXxx 装配、restoreWorkspace
├── core/                 # 纯函数（settings/auth/room/danmaku/scheduler/fetch-json/workspace/…）
├── platform/             # GM_* 适配（storage）、页面滚动锁
├── api/                  # 关注列表、房间状态等接口
├── ui/                   # shell-markup / room-panel / tile-markup / icons / styles.css（只碰 DOM）
├── playback/             # stream（取流/签名）、playback（mpegts 播放）、pip（画中画）
└── app/                  # initXxx(ctx) 模块：dom/audio/layout/status/tile/context-menu/
                          #   inspector/room-commands/reorder/add-panel/drawer/persistence/
                          #   keyboard/topbar/shell/live-watcher
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

- 打开监控室时按 `resumeMode` 决定：`always` 直接装配并播放；`never` 有待加载房间时直接打开添加面板或设置面板；`ask` 弹出询问。
- 选择“暂不加载”墙保持为空；`save()` 在墙为空时回写 pendingTiles，因此该选择不销毁上次布局。
- 只有点击“加载上次直播间”（或 resumeMode=always）才调用 `ctx.loadPendingTiles()` 真正装配；
  用户亲手添加房间后 pendingTiles 清空。

## 快捷键

快捷键与 **Esc 分层后退**均已按需求**暂时移除**：数字选格、方向键、Enter/Space、R/M/S/D/P/F/A/C/? 与
逐层 Esc（右键菜单 → 添加面板 → 恢复询问 → 吐司 → 画格设置 → 取消选择 → 收设置面板 → 退出确认）全部不可用，
连原生 Esc 关闭对话框也被拦下——弹层只用各自的关闭 / 确认按钮退出，主面板只走“退出监看”确认。
帮助面板与按键提示一并移除。恢复时改 `app/keyboard.js`（keymap + handleEscape）与 `app/shell.js`
的 dialog cancel 拦截，再把 `ui/shell-markup.js` 的按键提示补回。
（添加面板停输 500ms 自动搜索，Enter 不发起搜索或直接添加；手动房号页通过“解析并添加”按钮提交。）

## 测试

- `test/*.test.js`：纯逻辑单测（md5/auth、parseRoom、fetchJson 错误映射、Scheduler 并发与节流、
  弹幕协议编解码、工作区 v1 迁移、模板 token、历史记录往返等）。
- `test/integration.smoke.js`：happy-dom 承载**构建产物**的端到端冒烟——启动不擅自装配、恢复询问文案、
  “暂不加载”空墙且保存不丢房间、确认加载进墙、设置面板开合、添加面板、检查器联动、整行选择、Esc 分层。改交互后必跑。

## 发布与交付物

`npm run release [patch|minor|major|x.y.z] [--notes "要点"] [--minify] [--skip-gates]`

1. bump `package.json` 版本（验收失败自动回滚）；
2. 构建 + 验收门（node --check、单测、DOM 冒烟）+ 旧文案检查（监看台/监看墙 不得出现）；
3. txt 存档：`dist/监控室.txt` 与外层 `监控室-<版本>.txt`；
4. 交付物：外层 `监控室.user.js`（覆盖为最新构建）；
5. 写入 `CHANGELOG.md`。

原始脚本（xwechat_files 里的 `斗鱼监控室.txt`，原始文件名不改）始终保持原样，交付物一律是副本。
