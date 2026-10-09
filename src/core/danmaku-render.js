export const normalizeDanmaku = (value = {}) => {
  value = value && typeof value === "object" ? value : {};
  return {
    enabled: value.enabled !== false,
    size: Math.max(12, Math.min(36, Number(value.size) || 20)),
    speed: [0.5, 0.75, 1, 1.25, 1.5, 2].includes(value.speed) ? value.speed : 1,
    opacity: Number.isFinite(Number(value.opacity)) ? Math.max(0.1, Math.min(1, Number(value.opacity))) : 1,
    area: [0.25, 0.5, 0.75, 1].includes(value.area) ? value.area : 1,
    blockedWords: (Array.isArray(value.blockedWords) ? value.blockedWords : []).filter((word) => typeof word === "string").map((word) => word.trim().slice(0, 40)).filter(Boolean).slice(0, 50)
  };
};

export const colors = { 1: "#ff5555", 2: "#55ccff", 3: "#55ee77", 4: "#ffcc55", 5: "#cc77ff", 6: "#ff88bb" };

export const DanmakuRenderer = class {
  constructor(canvas, options) {
    this.canvas = canvas;
    this.options = options;
    this.items = [];
    this.nextLane = 0;
  }
  resize() {
    const width = Math.round(this.canvas.clientWidth), height = Math.round(this.canvas.clientHeight);
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.items = [];
    this.nextLane = 0;
  }
  add(message) {
    if (!this.options.enabled || this.items.length >= 60 || !this.frame) return;
    this.resize();
    const width = this.width || 0, height = this.height || 0;
    if (!width || !height) return;
    const context = this.canvas.getContext("2d");
    if (!context) return;
    context.font = `${this.options.size}px sans-serif`;
    const text = String(message.txt).slice(0, 300), textWidth = context.measureText(text).width;
    if ((this.options.blockedWords || []).some((word) => text.toLocaleLowerCase().includes(word.toLocaleLowerCase()))) return;
    const speed = (120 + width / 6) * this.options.speed;
    const lanes = Math.max(1, Math.floor((Math.min(height - 44, height * (this.options.area || 1)) - 6) / (this.options.size + 8)));
    const lane = Array.from({ length: lanes }, (_, index) => (this.nextLane + index) % lanes).find((index) => this.items.every((item) => item.lane !== index || item.x + item.width + 30 < width && (speed <= item.speed || (width - item.x - item.width - 30) / (speed - item.speed) > (item.x + item.width) / item.speed)));
    if (lane === void 0) return;
    this.nextLane = (lane + 1) % lanes;
    this.items.push({ text, width: textWidth, x: width, lane, speed, color: colors[message.col] || "#ffffff" });
  }
  start() {
    if (this.frame) return;
    this.last = 0;
    const handleFrame = (timestamp) => {
      const canvas = this.canvas, context = canvas.getContext("2d");
      this.resize();
      const width = this.width, height = this.height;
      const delta = this.last ? Math.min(0.1, (timestamp - this.last) / 1e3) : 0;
      this.last = timestamp;
      if (context) {
        context.globalAlpha = 1;
        context.clearRect(0, 0, width, height);
        context.globalAlpha = this.options.opacity ?? 1;
        context.font = `${this.options.size}px sans-serif`;
        context.textBaseline = "top";
        context.lineWidth = 3;
        context.strokeStyle = "#000000";
        for (const item of this.items) {
          item.x -= item.speed * delta;
          const y = item.lane * (this.options.size + 8) + 6;
          context.strokeText(item.text, item.x, y);
          context.fillStyle = item.color;
          context.fillText(item.text, item.x, y);
        }
        this.items = this.items.filter((item) => item.x + item.width > 0);
      }
      this.clock = canvas.ownerDocument.defaultView;
      this.frame = this.clock.requestAnimationFrame(handleFrame);
    };
    this.clock = this.canvas.ownerDocument.defaultView;
    this.frame = this.clock.requestAnimationFrame(handleFrame);
  }
  stop() {
    this.clock?.cancelAnimationFrame(this.frame);
    this.frame = null;
    this.items = [];
    this.nextLane = 0;
    this.canvas.getContext("2d")?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  update(options) {
    this.options = options;
    this.items = [];
    this.nextLane = 0;
  }
};
