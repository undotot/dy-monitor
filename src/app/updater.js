import { SCRIPT_VERSION, UPDATE_META_URL, UPDATE_META_FALLBACK_URLS, DOWNLOAD_USER_URL } from "../core/settings.js";

/**
 * 严格比对两个语义化版本号，判断 remote 是否大于 local
 * @param {string} remote
 * @param {string} local
 * @returns {boolean}
 */
export function isNewerVersion(remote, local) {
  if (!remote || !local) return false;
  const parse = (v) =>
    String(v)
      .trim()
      .replace(/^v/i, "")
      .split(/[-+]/)[0]
      .split(".")
      .map((n) => parseInt(n, 10) || 0);

  const r = parse(remote);
  const l = parse(local);
  const maxLen = Math.max(r.length, l.length);
  for (let i = 0; i < maxLen; i++) {
    const rPart = r[i] || 0;
    const lPart = l[i] || 0;
    if (rPart > lPart) return true;
    if (rPart < lPart) return false;
  }
  return false;
}

/**
 * 从版本号列表中筛选出最高的语义化版本号
 * @param {string[]} versions
 * @returns {string|null}
 */
export function findHighestVersion(versions) {
  if (!Array.isArray(versions) || versions.length === 0) return null;
  let highest = null;
  for (const v of versions) {
    if (!v) continue;
    if (!highest || isNewerVersion(v, highest)) {
      highest = v;
    }
  }
  return highest;
}

/**
 * 从 Userscript 元数据头部提取 @version 标签
 * @param {string} metaText
 * @returns {string|null}
 */
export function extractVersionFromMeta(metaText) {
  if (!metaText || typeof metaText !== "string") return null;
  const match = metaText.match(/\/\/\s*@version\s+([0-9a-zA-Z._-]+)/i);
  return match ? match[1].trim() : null;
}

/**
 * 请求单个 URL 获取元数据版本号
 * @param {string} metaUrl
 * @returns {Promise<string|null>}
 */
async function fetchSingleVersion(metaUrl) {
  const urlWithCacheBust = `${metaUrl}${metaUrl.includes("?") ? "&" : "?"}_t=${Date.now()}`;

  // 油猴环境特权 API
  if (typeof GM_xmlhttpRequest === "function") {
    return new Promise((resolve) => {
      try {
        GM_xmlhttpRequest({
          method: "GET",
          url: urlWithCacheBust,
          timeout: 4000,
          onload: (res) => {
            if (res.status >= 200 && res.status < 300) {
              resolve(extractVersionFromMeta(res.responseText));
            } else {
              resolve(null);
            }
          },
          onerror: () => resolve(null),
          ontimeout: () => resolve(null)
        });
      } catch {
        resolve(null);
      }
    });
  }

  // 现代浏览器原生 fetch 降级
  if (typeof fetch === "function") {
    try {
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), 4000) : null;
      const res = await fetch(urlWithCacheBust, {
        cache: "no-cache",
        signal: ctrl?.signal
      });
      if (timer) clearTimeout(timer);
      if (!res.ok) return null;
      const text = await res.text();
      return extractVersionFromMeta(text);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * 发起非阻塞请求获取远程最新版本号
 * 支持多节点镜像并行比对，取最高版本号，彻底免疫单一 CDN 边缘节点的缓存滞后
 * @param {string|string[]} [urls]
 * @returns {Promise<string|null>}
 */
export async function fetchRemoteVersion(urls = UPDATE_META_FALLBACK_URLS) {
  const candidates = Array.isArray(urls) ? urls : [urls || UPDATE_META_URL];
  if (candidates.length === 1) {
    return fetchSingleVersion(candidates[0]);
  }

  try {
    const results = await Promise.allSettled(candidates.map((u) => fetchSingleVersion(u)));
    const versions = results
      .filter((r) => r.status === "fulfilled" && Boolean(r.value))
      .map((r) => r.value);
    return findHighestVersion(versions);
  } catch {
    return null;
  }
}

/**
 * 初始化方案 A 顶栏更新检测与交互联动
 * @param {object} ctx
 */
export function initUpdater(ctx) {
  const root = ctx?.wrapper || document;
  const badgeWrap = root.querySelector("[data-update-wrap]");
  const badge = root.querySelector("[data-ver-badge]");
  const dot = root.querySelector("[data-ver-dot]");
  const tag = root.querySelector("[data-ver-tag]");
  const tooltip = root.querySelector("[data-update-tooltip]");
  const remoteVerEl = root.querySelector("[data-remote-version]");

  if (!badge) return;

  const applyUpdateFound = (remoteVersion) => {
    badge.classList.add("has-update");
    badge.setAttribute("title", `发现新版本 v${remoteVersion}，点击打开油猴更新`);
    if (dot) dot.hidden = false;
    if (tag) tag.hidden = false;
    if (tooltip) tooltip.hidden = false;
    if (remoteVerEl) remoteVerEl.textContent = `v${remoteVersion}`;
  };

  // 点击事件：如果发现新版本，允许直接触发油猴安装链接
  badge.addEventListener("click", (e) => {
    if (badge.classList.contains("has-update")) {
      // 允许默认链接行为跳转到 DOWNLOAD_USER_URL
      return;
    }
    // 未发现新版本时阻止默认空跳转
    e.preventDefault();
  });

  // 延迟 3.5 秒执行静默检测，避免在首屏加载和流媒体拉流关键期抢占连接
  setTimeout(async () => {
    try {
      const remoteVer = await fetchRemoteVersion();
      if (remoteVer && isNewerVersion(remoteVer, SCRIPT_VERSION)) {
        applyUpdateFound(remoteVer);
      }
    } catch {
      // 静默失败，不打扰正常观播
    }
  }, 3500);
}
