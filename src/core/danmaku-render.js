import { getTileScale } from "./tile-scale.js";
import { getNobleTag, renderSidebarRowHtml, parseDiamondMonths } from "./danmaku-tokens.js";

export const truncateSender = (nickname, maxLen = 8) => {
  if (!nickname || typeof nickname !== "string") return "";
  const trimmed = nickname.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
};

export const normalizeDanmaku = (value = {}) => {
  value = value && typeof value === "object" ? value : {};
  return {
    enabled: value.enabled === true,
    mode: ["scroll", "sidebar"].includes(value.mode) ? value.mode : "scroll",
    scrollStyle: ["simple", "normal"].includes(value.scrollStyle) ? value.scrollStyle : "simple",
    aggregate: value.aggregate !== false,
    showSender: value.showSender !== false,
    size: Math.max(12, Math.min(36, Number(value.size) || 20)),
    speed: [0.5, 0.75, 1, 1.25, 1.5, 2].includes(value.speed) ? value.speed : 1,
    opacity: Number.isFinite(Number(value.opacity)) ? Math.max(0.1, Math.min(1, Number(value.opacity))) : 1,
    area: [0.25, 0.5, 0.75, 1].includes(value.area) ? value.area : 1,
    blockedWords: (Array.isArray(value.blockedWords) ? value.blockedWords : []).filter((word) => typeof word === "string").map((word) => word.trim().slice(0, 40)).filter(Boolean).slice(0, 50)
  };
};

const colors = { 0: "#ffffff", 1: "#ff5555", 2: "#55ccff", 3: "#55ee77", 4: "#ffcc55", 5: "#cc77ff", 6: "#ff88bb" };

// 全局弹幕时钟：集中驱动所有开开启飘屏动画的画格，避免 16 路独立 rAF 造成主线程调度开销过大
const activeRenderers = /* @__PURE__ */ new Set();
let tickerFrame = null;
let lastTick = 0;

const runTicker = (timestamp) => {
  if (!activeRenderers.size) {
    tickerFrame = null;
    lastTick = 0;
    return;
  }
  const delta = lastTick ? Math.min(0.1, (timestamp - lastTick) / 1e3) : 0;
  lastTick = timestamp;
  for (const renderer of activeRenderers) {
    try {
      renderer.step(delta);
    } catch {
    }
  }
  if (activeRenderers.size) {
    const sample = activeRenderers.values().next().value;
    const clock = sample?.canvas?.ownerDocument?.defaultView || globalThis;
    if (typeof clock.requestAnimationFrame === "function") {
      tickerFrame = clock.requestAnimationFrame(runTicker);
    } else {
      tickerFrame = setTimeout(() => runTicker(Date.now()), 16);
    }
  } else {
    tickerFrame = null;
    lastTick = 0;
  }
};

const registerRenderer = (renderer) => {
  activeRenderers.add(renderer);
  if (!tickerFrame) {
    lastTick = 0;
    const clock = renderer.canvas?.ownerDocument?.defaultView || globalThis;
    if (typeof clock.requestAnimationFrame === "function") {
      tickerFrame = clock.requestAnimationFrame(runTicker);
    } else if (typeof clock.setTimeout === "function") {
      tickerFrame = setTimeout(() => runTicker(Date.now()), 16);
    }
  }
};

const unregisterRenderer = (renderer) => {
  activeRenderers.delete(renderer);
  if (!activeRenderers.size && tickerFrame) {
    const clock = renderer.canvas?.ownerDocument?.defaultView || globalThis;
    if (typeof clock.cancelAnimationFrame === "function") clock.cancelAnimationFrame(tickerFrame);
    else clearTimeout(tickerFrame);
    tickerFrame = null;
    lastTick = 0;
  }
};

export const DanmakuRenderer = class {
  constructor(canvas, options, domRefs = {}) {
    this.canvas = canvas;
    this.options = normalizeDanmaku(options);
    this.sidebarEl = domRefs.sidebarEl || null;
    this.sidebarListEl = domRefs.sidebarListEl || null;
    this.items = [];
    this.nextLane = 0;
    this.frame = null;
    this.aggregates = new Map();
    this.applyModeVisibility();
  }
  applyModeVisibility() {
    if (this.canvas && this.canvas.style) {
      this.canvas.style.display = this.options.mode === "sidebar" ? "none" : "";
    }
    if (this.sidebarEl) {
      this.sidebarEl.hidden = !(this.options.enabled && this.options.mode === "sidebar");
    }
  }
  resize() {
    const width = Math.round(this.canvas.clientWidth || 0), height = Math.round(this.canvas.clientHeight || 0);
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.scale = getTileScale(width, height);
    this.fontSize = this.options.size * this.scale;
    this.canvas.width = width;
    this.canvas.height = height;
    this.items = [];
    this.nextLane = 0;
  }
  add(message) {
    if (!this.options.enabled || !this.frame) return;
    const text = String(message.txt || "").slice(0, 300);
    if (!text) return;
    if ((this.options.blockedWords || []).some((word) => text.toLocaleLowerCase().includes(word.toLocaleLowerCase()))) return;

    // Mode A: 右侧悬浮栏模式 (追加至侧栏瀑布流列表)
    if (this.options.mode === "sidebar") {
      if (this.sidebarListEl) {
        if (typeof document !== "undefined" && typeof document.createElement === "function") {
          const row = document.createElement("div");
          row.innerHTML = renderSidebarRowHtml(message);
          const itemEl = row.firstElementChild || row;
          this.sidebarListEl.appendChild(itemEl);
          if (this.sidebarListEl.children?.length > 150) {
            this.sidebarListEl.removeChild(this.sidebarListEl.firstElementChild);
          }
          this.sidebarListEl.scrollTop = this.sidebarListEl.scrollHeight;
        } else if (typeof this.sidebarListEl.appendChild === "function") {
          this.sidebarListEl.appendChild({ html: renderSidebarRowHtml(message) });
        }
      }
      return;
    }

    // Mode B: 画面飘屏模式 (上限 60 条防堆积)
    if (this.items.length >= 60) return;
    this.resize();
    const width = this.width || 0, height = this.height || 0;
    if (!width || !height) return;
    const context = this.canvas.getContext ? this.canvas.getContext("2d") : null;
    if (!context) return;
    context.font = `${this.fontSize}px sans-serif`;

    // 同质化刷屏合并 (2.5 秒滑窗内相同正文追加计数微标 x N)
    const now = Date.now();
    if (this.options.aggregate !== false) {
      const existing = this.items.find((item) => item.text === text && now - item.createdAt < 2500);
      if (existing) {
        existing.count = (existing.count || 1) + 1;
        existing.aggregateText = ` x ${existing.count}`;
        existing.aggregateWidth = context.measureText(existing.aggregateText).width;
        existing.width = existing.baseWidth + existing.aggregateWidth + 6 * this.scale;
        return;
      }
    }

    let sender = "";
    let senderWidth = 0;
    let senderColor = "#93c5fd";

    const noble = getNobleTag(message.nl);
    if (noble?.rank >= 8) senderColor = "#ec4899";
    else if (noble?.rank >= 6) senderColor = "#fbbf24";
    else if (noble?.rank >= 5) senderColor = "#f97316";

    if (this.options.showSender && message.nn) {
      const cleanSender = truncateSender(message.nn, 8);
      if (cleanSender) {
        if (this.options.scrollStyle === "normal") {
          // 正常版：前缀展示粉丝牌、钻粉与贵族标识提示
          const tagPrefix = [];
          if (message.bnn && message.bl) tagPrefix.push(`[${message.bnn} ${message.bl}]`);
          const diaMonths = parseDiamondMonths(message);
          if (diaMonths > 0) tagPrefix.push(`💎${diaMonths}`);
          if (noble) tagPrefix.push(`[${noble.name}]`);
          const prefixStr = tagPrefix.length ? `${tagPrefix.join(" ")} ` : "";
          sender = `${prefixStr}${cleanSender}: `;
        } else {
          // 精简版：严格仅保留发弹幕的人(昵称)与冒号
          sender = `${cleanSender}: `;
        }
        senderWidth = context.measureText(sender).width;
      }
    }

    const textWidth = context.measureText(text).width;
    const baseWidth = senderWidth + textWidth;
    const totalWidth = baseWidth;

    const speed = (120 + width / 6) * this.options.speed;
    const lanes = Math.max(1, Math.floor((Math.min(height - 44 * this.scale, height * (this.options.area || 1)) - 6 * this.scale) / (this.fontSize + 8 * this.scale)));
    const lane = Array.from({ length: lanes }, (_, index) => (this.nextLane + index) % lanes).find((index) => this.items.every((item) => item.lane !== index || item.x + item.width + 30 < width && (speed <= item.speed || (width - item.x - item.width - 30) / (speed - item.speed) > (item.x + item.width) / item.speed)));
    if (lane === void 0) return;
    this.nextLane = (lane + 1) % lanes;
    this.items.push({
      sender,
      senderWidth,
      senderColor,
      text,
      textWidth,
      baseWidth,
      width: totalWidth,
      x: width,
      lane,
      speed,
      color: colors[message.col] || "#ffffff",
      createdAt: now,
      count: 1,
      aggregateText: "",
      aggregateWidth: 0
    });
  }
  step(delta) {
    if (this.options.mode === "sidebar") return;
    this.resize();
    const width = this.width, height = this.height;
    const context = this.canvas.getContext ? this.canvas.getContext("2d") : null;
    if (context && width && height) {
      context.globalAlpha = 1;
      context.clearRect(0, 0, width, height);
      context.globalAlpha = this.options.opacity ?? 1;
      context.font = `${this.fontSize}px sans-serif`;
      context.textBaseline = "top";
      context.lineWidth = 3 * this.scale;
      context.strokeStyle = "#000000";
      for (const item of this.items) {
        item.x -= item.speed * delta;
        const y = item.lane * (this.fontSize + 8 * this.scale) + 6 * this.scale;
        if (item.sender) {
          context.strokeText(item.sender, item.x, y);
          context.fillStyle = item.senderColor || "#93c5fd";
          context.fillText(item.sender, item.x, y);

          const contentX = item.x + item.senderWidth;
          context.strokeText(item.text, contentX, y);
          context.fillStyle = item.color;
          context.fillText(item.text, contentX, y);

          if (item.aggregateText) {
            const aggX = contentX + item.textWidth + 6 * this.scale;
            context.strokeText(item.aggregateText, aggX, y);
            context.fillStyle = "#ef4444";
            context.fillText(item.aggregateText, aggX, y);
          }
        } else {
          context.strokeText(item.text, item.x, y);
          context.fillStyle = item.color;
          context.fillText(item.text, item.x, y);

          if (item.aggregateText) {
            const aggX = item.x + item.textWidth + 6 * this.scale;
            context.strokeText(item.aggregateText, aggX, y);
            context.fillStyle = "#ef4444";
            context.fillText(item.aggregateText, aggX, y);
          }
        }
      }
      this.items = this.items.filter((item) => item.x + item.width > 0);
    }
  }
  start() {
    if (this.frame) return;
    this.frame = true;
    if (this.sidebarEl) {
      this.sidebarEl.hidden = !(this.options.enabled && this.options.mode === "sidebar");
    }
    if (this.options.mode === "scroll") {
      registerRenderer(this);
    }
  }
  stop() {
    if (this.frame) {
      unregisterRenderer(this);
      this.frame = null;
    }
    if (this.sidebarEl) {
      this.sidebarEl.hidden = true;
    }
    this.items = [];
    this.nextLane = 0;
    this.canvas.getContext?.("2d")?.clearRect(0, 0, this.canvas.width || 0, this.canvas.height || 0);
  }
  update(options, domRefs = null) {
    if (domRefs) {
      if (domRefs.sidebarEl) this.sidebarEl = domRefs.sidebarEl;
      if (domRefs.sidebarListEl) this.sidebarListEl = domRefs.sidebarListEl;
    }
    this.options = normalizeDanmaku({ ...this.options, ...(options || {}) });
    this.fontSize = (this.options.size || 20) * (this.scale || 1);
    this.items = [];
    this.nextLane = 0;
    this.applyModeVisibility();
  }
};
