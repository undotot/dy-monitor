export const md5 = (value) => {
  const constants = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0);
  const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const bytes = new TextEncoder().encode(value);
  const words = new Int32Array(16 * (1 + (bytes.length + 8 >> 6)));
  for (let i = 0; i < bytes.length; i++) words[i >> 2] |= bytes[i] << i % 4 * 8;
  words[bytes.length >> 2] |= 128 << bytes.length % 4 * 8;
  words[words.length - 2] = bytes.length * 8;
  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (let block = 0; block < words.length; block += 16) {
    let x = a, y = b, z = c, w = d;
    for (let i = 0; i < 64; i++) {
      let f, index;
      if (i < 16) {
        f = y & z | ~y & w;
        index = i;
      } else if (i < 32) {
        f = w & y | ~w & z;
        index = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = y ^ z ^ w;
        index = (3 * i + 5) % 16;
      } else {
        f = z ^ (y | ~w);
        index = 7 * i % 16;
      }
      const sum = x + f + constants[i] + words[block + index] | 0;
      const shift = shifts[4 * (i >> 4) + i % 4];
      x = w;
      w = z;
      z = y;
      y = y + (sum << shift | sum >>> 32 - shift) | 0;
    }
    a = a + x | 0;
    b = b + y | 0;
    c = c + z | 0;
    d = d + w | 0;
  }
  return [a, b, c, d].map((word) => [0, 8, 16, 24].map((shift) => (word >>> shift & 255).toString(16).padStart(2, "0")).join("")).join("");
};

export const buildAuth = (rid, timestamp, encryption) => {
  if (!encryption || typeof encryption.key !== "string" || typeof encryption.rand_str !== "string" || typeof encryption.enc_data !== "string") throw new Error("\u7B7E\u540D\u7D20\u6750\u7F3A\u5C11 key\u3001rand_str \u6216 enc_data\u3002");
  const rounds = Number(encryption.enc_time ?? 0);
  if (!Number.isInteger(rounds) || rounds < 0 || rounds > 1e4) throw new Error("\u7B7E\u540D\u8F6E\u6570\u8D85\u51FA\u652F\u6301\u8303\u56F4\u3002");
  let seed = encryption.rand_str;
  for (let i = 0; i < rounds; i++) seed = md5(seed + encryption.key);
  return md5(seed + encryption.key + (Number(encryption.is_special) === 1 ? "" : `${rid}${timestamp}`));
};
