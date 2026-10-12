export const Scheduler = class {
  constructor(capacity = 8) {
    this.capacity = capacity;
    this.active = /* @__PURE__ */ new Set();
    this.pending = [];
    this.tail = Promise.resolve();
  }
  acquire(id, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException("\u5DF2\u53D6\u6D88", "AbortError"));
        return;
      }
      const entry = { id, signal, resolve, reject, handleAbort: null };
      entry.handleAbort = () => {
        this.pending = this.pending.filter((candidate) => candidate !== entry);
        reject(new DOMException("\u5DF2\u53D6\u6D88", "AbortError"));
      };
      signal.addEventListener("abort", entry.handleAbort, { once: true });
      this.pending.push(entry);
      this.drain();
    });
  }
  release(id) {
    this.active.delete(id);
    this.drain();
  }
  drain() {
    while (this.active.size < this.capacity && this.pending.length) {
      const entry = this.pending.shift();
      entry.signal.removeEventListener("abort", entry.handleAbort);
      if (entry.signal.aborted) {
        entry.reject(new DOMException("\u5DF2\u53D6\u6D88", "AbortError"));
        continue;
      }
      this.active.add(entry.id);
      entry.resolve();
    }
  }
  sign(task, signal) {
    if (signal.aborted) return Promise.reject(new DOMException("\u5DF2\u53D6\u6D88", "AbortError"));
    let executed = false;
    const result = this.tail.then(() => {
      if (signal.aborted) throw new DOMException("\u5DF2\u53D6\u6D88", "AbortError");
      executed = true;
      return task();
    });
    this.tail = result.catch(() => void 0).then(() => {
      if (executed) return new Promise((resolve) => setTimeout(resolve, 500));
    });
    return new Promise((resolve, reject) => {
      const handleAbort = () => reject(new DOMException("\u5DF2\u53D6\u6D88", "AbortError"));
      signal.addEventListener("abort", handleAbort, { once: true });
      result.then(resolve, reject).finally(() => signal.removeEventListener("abort", handleAbort));
    });
  }
};
