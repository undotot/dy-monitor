// GM_* 存储适配层：Tampermonkey 以全局函数注入；测试时在 globalThis.GM_* 放置 mock。
// get 失败回退默认值；set 不吞异常，由调用方决定如何提示。
export const storage = {
  get(key, fallback) {
    try {
      return typeof GM_getValue === "function" ? GM_getValue(key, fallback) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    if (typeof GM_setValue === "function") GM_setValue(key, value);
  },
};
