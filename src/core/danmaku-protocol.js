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
  constructor() {
    this.bytes = new Uint8Array();
  }
  push(buffer) {
    const incoming = new Uint8Array(buffer);
    if (incoming.length + this.bytes.length > 1024 * 1024) throw new Error("\u5F39\u5E55\u5305\u8FC7\u5927");
    const joined = new Uint8Array(this.bytes.length + incoming.length);
    joined.set(this.bytes);
    joined.set(incoming, this.bytes.length);
    const messages = [];
    let offset = 0;
    while (joined.length - offset >= 12) {
      const view = new DataView(joined.buffer, offset);
      const length = view.getUint32(0, true), total = length + 4;
      if (length < 9 || length > 1024 * 1024 || view.getUint32(4, true) !== length) throw new Error("\u5F39\u5E55\u5305\u683C\u5F0F\u9519\u8BEF");
      if (joined.length - offset < total) break;
      if (joined[offset + total - 1] !== 0) throw new Error("\u5F39\u5E55\u5305\u672A\u6B63\u786E\u7ED3\u675F");
      messages.push(parseFields(new TextDecoder().decode(joined.subarray(offset + 12, offset + total - 1))));
      offset += total;
    }
    this.bytes = joined.slice(offset);
    return messages;
  }
};
