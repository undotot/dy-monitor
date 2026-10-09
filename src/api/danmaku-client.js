import { encodePacket, PacketReader } from "../core/danmaku-protocol.js";

export const DanmakuClient = class {
  constructor(rid, onMessage, onStatus, Socket = globalThis.WebSocket) {
    this.rid = rid;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.Socket = Socket;
    this.running = false;
    this.attempt = 0;
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.connect();
  }
  connect() {
    if (!this.running) return;
    this.onStatus("\u8FDE\u63A5\u5F39\u5E55\u2026");
    const reader = new PacketReader();
    let socket;
    try {
      socket = new this.Socket(`wss://danmuproxy.douyu.com:${8502 + this.attempt % 4}/`);
    } catch {
      this.retry();
      return;
    }
    this.socket = socket;
    socket.binaryType = "arraybuffer";
    const handleFailure = () => {
      if (this.socket !== socket) return;
      this.cleanup();
      this.retry();
    };
    this.timeout = setTimeout(handleFailure, 12e3);
    socket.onopen = () => {
      if (!this.running || this.socket !== socket) return;
      socket.send(encodePacket(`type@=loginreq/roomid@=${this.rid}/`));
      this.heartbeat = setInterval(() => {
        if (socket.readyState === 1) socket.send(encodePacket("type@=mrkl/"));
      }, 4e4);
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket || !this.running) return;
      try {
        for (const message of reader.push(event.data)) {
          if (message.type === "loginres") {
            clearTimeout(this.timeout);
            this.attempt = 0;
            socket.send(encodePacket(`type@=joingroup/rid@=${this.rid}/gid@=-9999/`));
            this.onStatus("\u5F39\u5E55\u5DF2\u8FDE\u63A5");
          }
          if (message.type === "chatmsg" && (!message.rid || message.rid === this.rid) && message.txt) this.onMessage(message);
        }
      } catch {
        handleFailure();
      }
    };
    socket.onerror = handleFailure;
    socket.onclose = handleFailure;
  }
  retry() {
    if (!this.running) return;
    if (this.attempt >= 6) {
      this.running = false;
      this.onStatus("\u5F39\u5E55\u8FDE\u63A5\u5931\u8D25\uFF0C\u5173\u95ED\u518D\u5F00\u542F\u53EF\u91CD\u8BD5");
      return;
    }
    const delay = Math.min(3e4, 1500 * 2 ** this.attempt++);
    this.onStatus(`\u5F39\u5E55\u91CD\u8FDE ${this.attempt}/6`);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }
  cleanup() {
    clearTimeout(this.timeout);
    clearInterval(this.heartbeat);
    clearTimeout(this.retryTimer);
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
    try {
      socket.close();
    } catch {
    }
  }
  stop() {
    this.running = false;
    this.cleanup();
    this.onStatus("\u5F39\u5E55\u672A\u8FDE\u63A5");
  }
};
