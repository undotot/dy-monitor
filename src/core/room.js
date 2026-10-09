// 直播状态三态：1=直播中，2=轮播中，其余=未开播。探测接口 show_status 为准，
// 关注 / 搜索接口的 isLive 等字段按同一原始值映射，缺失即未开播。
export const liveStatusFromRaw = (raw) => Number(raw) === 1 ? "live" : Number(raw) === 2 ? "carousel" : "offline";

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
