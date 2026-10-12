import { API_BASE, DEFAULT_DID, CLIENT_DID_KEY, parseMultirates } from "../core/settings.js";
import { buildAuth } from "../core/auth.js";
import { fetchJson } from "../core/fetch-json.js";
import { storage } from "../platform/storage.js";

export function generateClientDid() {
  const hex = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
  return `1000000000000000000000000000${hex}`;
}

export function resolveClientDid(cookieStr = (typeof document !== "undefined" ? document.cookie : ""), storageImpl = storage) {
  const cookie = String(cookieStr || "").match(/(?:^|;\s*)dy_did=([^;]*)/)?.[1];
  try {
    const decoded = decodeURIComponent(cookie || "");
    if (/^[a-zA-Z0-9_-]{1,128}$/.test(decoded)) return decoded;
  } catch {}

  try {
    const saved = storageImpl?.get?.(CLIENT_DID_KEY, null);
    if (typeof saved === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(saved)) {
      return saved;
    }
  } catch {}

  const generated = generateClientDid();
  try {
    storageImpl?.set?.(CLIENT_DID_KEY, generated);
  } catch {}
  return generated;
}

// 签名取流：getEncryption 素材 → buildAuth 签名 → getH5PlayV1 换 FLV 地址。
// 经 scheduler.sign 串行化（500ms 节流）；仅接受平台返回的 HTTPS 流，不改写地址。
export function initStream(ctx) {
  ctx.getStream = (tile, signal) => ctx.scheduler.sign(async () => {
    if (Date.now() < ctx.cooldownUntil) throw new Error("接口冷却中，请稍后重试");
    const did = resolveClientDid(typeof document !== "undefined" ? document.cookie : "");
    ctx.setStatus(tile, "signing", "② 获取签名素材…");
    const encryption = await fetchJson(`${API_BASE}/wgapi/livenc/liveweb/websec/getEncryption?did=${encodeURIComponent(did)}`, { credentials: "include" }, signal, "签名素材");
    if (signal.aborted) throw new DOMException("已取消", "AbortError");
    const timestamp = Math.round(Date.now() / 1e3), auth = buildAuth(tile.rid, timestamp, encryption.data);
    ctx.setStatus(tile, "signing", "③ 请求直播地址…");
    const payload = await fetchJson(`${API_BASE}/lapi/live/getH5PlayV1/${tile.rid}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        enc_data: encryption.data.enc_data,
        tt: String(timestamp),
        did,
        auth,
        cdn: "",
        rate: String(tile.rate),
        hevc: ctx.hevc ? "1" : "0",
        fa: "0",
        ive: "0"
      })
    }, signal, "直播地址");
    if (signal.aborted) throw new DOMException("已取消", "AbortError");
    const { rtmp_url: base, rtmp_live: live } = payload.data || {};
    if (typeof base !== "string" || typeof live !== "string" || !base || !live) throw new Error("直播地址：缺少 rtmp_url / rtmp_live");
    const url = `${base}/${live}`, parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("直播地址不是可用的 HTTPS 流；未改写平台返回地址");
    const multirates = parseMultirates(payload.data?.multirates);
    const activeRate = payload.data?.rate != null && Number.isFinite(Number(payload.data.rate))
      ? Number(payload.data.rate)
      : tile.rate;
    return { url, multirates, rate: activeRate };
  }, signal);
}
