export const encodePacket = (text) => {
  const bytes = new TextEncoder().encode(text), buffer = new ArrayBuffer(bytes.length + 13);
  const view = new DataView(buffer);
  view.setUint32(0, bytes.length + 9, true);
  view.setUint32(4, bytes.length + 9, true);
  view.setUint16(8, 689, true);
  new Uint8Array(buffer).set(bytes, 12);
  return buffer;
};

export const parseFields = (text) => Object.fromEntries(text.split("/").flatMap((part) => {
  const at = part.indexOf("@=");
  if (at < 0) return [];
  const decode = (value) => value.replace(/@S/g, "/").replace(/@A/g, "@");
  return [[decode(part.slice(0, at)), decode(part.slice(at + 2))]];
}));

export const PacketReader = class {
  constructor(initialCapacity = 65536) {
    this.buffer = new Uint8Array(initialCapacity);
    this.offset = 0;
    this.decoder = new TextDecoder();
  }
  push(buffer) {
    const incoming = new Uint8Array(buffer);
    if (this.offset + incoming.length > 1024 * 1024) throw new Error("\u5F39\u5E55\u5305\u8FC7\u5927");
    if (this.offset + incoming.length > this.buffer.length) {
      let newCapacity = Math.max(this.buffer.length * 2, this.offset + incoming.length);
      newCapacity = Math.min(1024 * 1024, Math.max(newCapacity, 65536));
      const expanded = new Uint8Array(newCapacity);
      expanded.set(this.buffer.subarray(0, this.offset));
      this.buffer = expanded;
    }
    this.buffer.set(incoming, this.offset);
    this.offset += incoming.length;

    const messages = [];
    let readIndex = 0;
    while (this.offset - readIndex >= 12) {
      const view = new DataView(this.buffer.buffer, this.buffer.byteOffset + readIndex);
      const length = view.getUint32(0, true), total = length + 4;
      if (length < 9 || length > 1024 * 1024 || view.getUint32(4, true) !== length) throw new Error("\u5F39\u5E55\u5305\u683C\u5F0F\u9519\u8BEF");
      if (this.offset - readIndex < total) break;
      if (this.buffer[readIndex + total - 1] !== 0) throw new Error("\u5F39\u5E55\u5305\u672A\u6B63\u786E\u7ED3\u675F");
      messages.push(parseFields(this.decoder.decode(this.buffer.subarray(readIndex + 12, readIndex + total - 1))));
      readIndex += total;
    }
    if (readIndex > 0) {
      if (readIndex < this.offset) {
        this.buffer.copyWithin(0, readIndex, this.offset);
        this.offset -= readIndex;
      } else {
        this.offset = 0;
      }
    }
    return messages;
  }
};
