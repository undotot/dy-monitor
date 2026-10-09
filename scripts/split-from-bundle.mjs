// 一次性迁移工具：从打包好的 user.js 按 `// userscript/xxx.js` 标记切出模块源码。
// 用法：node scripts/split-from-bundle.mjs <bundle.js 路径>
// 产物：src/ 下的 core / api / ui / platform 模块（app 层由手工拆分，不在此列）。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = process.argv[2];
if (!bundlePath) {
  console.error("用法：node scripts/split-from-bundle.mjs <bundle.js 路径>");
  process.exit(1);
}

const lines = readFileSync(bundlePath, "utf8").split("\n");

// 1. 定位标记块：`  // userscript/xxx.js` 或 `  // node_modules/...`
const marks = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^  \/\/ (?:userscript|node_modules)\/(.+)$/);
  if (m) marks.push({ name: m[1], line: i });
}
const blocks = new Map();
for (let i = 0; i < marks.length; i++) {
  const start = marks[i].line + 1;
  const end = i + 1 < marks.length ? marks[i + 1].line : lines.length;
  // 去掉两空格缩进
  const body = lines.slice(start, end).map((l) => (l.startsWith("  ") ? l.slice(2) : l));
  // 丢弃入口残根（import_mpegts 接线行）
  const cleaned = body.filter((l) => !l.startsWith("var import_mpegts =")).join("\n").trim();
  blocks.set(marks[i].name, cleaned);
}

// 2. 按顶层 `var NAME = ` 切件
const pieceCache = new Map();
function pieces(blockName) {
  if (pieceCache.has(blockName)) return pieceCache.get(blockName);
  const code = blocks.get(blockName);
  if (code === undefined) throw new Error(`块不存在：${blockName}`);
  const codeLines = code.split("\n");
  const starts = [];
  for (let i = 0; i < codeLines.length; i++) {
    const m = codeLines[i].match(/^var (\w+) = /);
    if (m) starts.push({ name: m[1], i });
  }
  const out = new Map();
  for (let k = 0; k < starts.length; k++) {
    const from = starts[k].i;
    const to = k + 1 < starts.length ? starts[k + 1].i : codeLines.length;
    out.set(starts[k].name, codeLines.slice(from, to).join("\n").trim());
  }
  pieceCache.set(blockName, out);
  return out;
}

// 3. 通用替换
const globalReplace = [
  ["__publicField(this, \"bytes\", new Uint8Array());", "this.bytes = new Uint8Array();"],
];

// 4. 输出配置：out ←（块, [件名]）拼接 + 文件头 import + 导出名单
const outputs = [
  {
    out: "src/core/settings.js",
    parts: [
      ["constants.js", ["KEY", "LEGACY_KEY", "PRESET_KEY", "HISTORY_KEY", "HOST_ID", "SCRIPT_VERSION", "MAX_TILES", "CAPACITIES", "RATES", "AUDIO_MODES", "clamp01", "safeMessage"]],
      ["core.js", ["API_BASE", "DEFAULT_DID"]],
    ],
    replace: [
      ['var SCRIPT_VERSION = "1.7.0";', 'export const SCRIPT_VERSION = typeof __VERSION__ === "string" ? __VERSION__ : "1.7.0-dev";'],
    ],
  },
  { out: "src/core/auth.js", parts: [["core.js", ["md5", "buildAuth"]]] },
  { out: "src/core/room.js", parts: [["core.js", ["parseRoom"]]] },
  { out: "src/core/fetch-json.js", parts: [["core.js", ["fetchJson"]]] },
  { out: "src/core/scheduler.js", parts: [["scheduler.js", ["Scheduler"]]] },
  { out: "src/core/danmaku-protocol.js", parts: [["danmaku.js", ["encodePacket", "parseFields", "PacketReader"]]] },
  { out: "src/core/danmaku-render.js", parts: [["danmaku.js", ["normalizeDanmaku", "colors", "DanmakuRenderer"]]] },
  {
    out: "src/api/danmaku-client.js",
    header: 'import { encodePacket, PacketReader } from "../core/danmaku-protocol.js";\n',
    parts: [["danmaku.js", ["DanmakuClient"]]],
  },
  { out: "src/api/pick-avatar.js", parts: [["rooms.js", ["pickAvatar"]]] },
  {
    out: "src/api/search.js",
    header: 'import { API_BASE } from "../core/settings.js";\nimport { fetchJson } from "../core/fetch-json.js";\nimport { parseRoom } from "../core/room.js";\nimport { pickAvatar } from "./pick-avatar.js";\n',
    parts: [["rooms.js", ["normalizeSearchResults", "searchRooms"]]],
  },
  {
    out: "src/api/follow.js",
    header: 'import { API_BASE } from "../core/settings.js";\nimport { fetchJson } from "../core/fetch-json.js";\nimport { pickAvatar } from "./pick-avatar.js";\n',
    parts: [["rooms.js", ["normalizeFollowRooms", "scrapeFollowPage", "fetchFollowRooms"]]],
  },
  {
    out: "src/api/history.js",
    header: 'import { HISTORY_KEY } from "../core/settings.js";\nimport { storage } from "../platform/storage.js";\n',
    parts: [["rooms.js", ["loadHistory", "recordHistory"]]],
    replace: [
      ["GM_getValue(HISTORY_KEY, [])", "storage.get(HISTORY_KEY, [])"],
      ["GM_setValue(HISTORY_KEY, list.slice(0, 100))", "storage.set(HISTORY_KEY, list.slice(0, 100))"],
    ],
  },
  { out: "src/ui/icons.js", parts: [["icons.js", ["paths", "iconMarkup", "setIconButton"]]] },
  { out: "src/ui/tile-markup.js", parts: [["tile-ui.js", ["tileMarkup", "addRowMarkup"]]] },
  { out: "src/platform/scroll-lock.js", parts: [["scroll-lock.js", ["createPageScrollLock"]]] },
];

for (const spec of outputs) {
  const exportNames = new Set();
  for (const [, names] of spec.parts) for (const n of names) exportNames.add(n);
  const chunks = [];
  for (const [blockName, names] of spec.parts) {
    const blockPieces = pieces(blockName);
    for (const name of names) {
      const piece = blockPieces.get(name);
      if (piece === undefined) throw new Error(`找不到件：${blockName}#${name}`);
      chunks.push(piece);
    }
  }
  let code = chunks.join("\n\n");
  for (const [from, to] of [...globalReplace, ...(spec.replace || [])]) code = code.split(from).join(to);
  // 顶层 var → export const / const
  code = code.replace(/^var (\w+) = /gm, (m, name) => (exportNames.has(name) ? `export const ${name} = ` : `const ${name} = `));
  const header = spec.header ? spec.header + "\n" : "";
  mkdirSync(dirname(join(root, spec.out)), { recursive: true });
  writeFileSync(join(root, spec.out), header + code + "\n");
  console.log(`写入 ${spec.out}（${chunks.length} 件）`);
}

// styles.css：剥掉模板字符串外壳
const cssWrapped = blocks.get("styles.js");
const cssMatch = cssWrapped.match(/^var MONITOR_CSS = `([\s\S]*)`;$/);
if (!cssMatch) throw new Error("styles.js 结构不符合预期");
writeFileSync(join(root, "src/ui/styles.css"), cssMatch[1].trim() + "\n");
console.log("写入 src/ui/styles.css");
console.log("完成。layout.js / room-controls.js / optionMarkup / escapeHtml 按方案删除，不再输出。");
