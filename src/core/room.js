// 直播状态三态：轮播标志（betard videoLoop / 搜索 isLoop）=1 → 轮播中；开播标志
// （show_status / isLive）=1 → 直播中；其余=未开播。实测接口语义：开播标志只有
// 1=开播、2=未开播（2 不是轮播），轮播由独立标志给出且开播时仍为 1。
export const liveStatusFromRaw = (raw, loop) => Number(loop) === 1 ? "carousel" : Number(raw) === 1 ? "live" : "offline";

export const parseRoom = (input) => {
  const text = input.trim();
  if (/^[1-9]\d{0,11}$/.test(text)) return text;
  try {
    const url = new URL(text);
    if (!/^https?:$/.test(url.protocol) || !/^(www\.|m\.)?douyu\.com$/.test(url.hostname)) throw new Error();
    const match = url.pathname.match(/^\/(?:topic\/)?([1-9]\d{0,11})\/?$/);
    if (match) return match[1];
  } catch {
  }
  throw new Error("\u8BF7\u8F93\u5165\u6570\u5B57\u623F\u53F7\uFF0C\u6216\u5305\u542B\u6570\u5B57\u623F\u53F7\u7684\u6597\u9C7C\u76F4\u64AD\u95F4\u94FE\u63A5\u3002\u5206\u4EAB\u77ED\u94FE\u6682\u4E0D\u652F\u6301\u3002");
};
