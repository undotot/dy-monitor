export const fetchJson = async (url, options, signal, stage, fetcher = fetch) => {
  const timeout = new AbortController();
  let expired = false;
  const handleAbort = () => timeout.abort();
  signal.addEventListener("abort", handleAbort, { once: true });
  if (signal.aborted) timeout.abort();
  const timer = setTimeout(() => {
    expired = true;
    timeout.abort();
  }, 15e3);
  try {
    const response = await fetcher(url, { ...options, signal: timeout.signal });
    if (!response.ok) throw new Error(`${stage}\uFF1AHTTP ${response.status}`);
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`${stage}\uFF1A\u54CD\u5E94\u4E0D\u662F\u6709\u6548 JSON`);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error(`${stage}\uFF1A\u54CD\u5E94\u7ED3\u6784\u5F02\u5E38`);
    if (Number(payload.error) !== 0) {
      const message = typeof payload.msg === "string" ? payload.msg.replace(/https?:\/\/\S+/g, "[\u5730\u5740\u5DF2\u9690\u85CF]").slice(0, 160) : "\u8BF7\u6C42\u672A\u6210\u529F";
      throw new Error(`${stage}\uFF1A${message}\uFF08\u4EE3\u7801 ${String(payload.error).slice(0, 20)}\uFF09`);
    }
    return payload;
  } catch (error) {
    if (signal.aborted) throw new DOMException("\u5DF2\u53D6\u6D88", "AbortError");
    if (expired) throw new Error(`${stage}\uFF1A\u8BF7\u6C42\u8D85\u8FC7 15 \u79D2\uFF0C\u8BF7\u91CD\u8BD5`);
    if (error instanceof TypeError) throw new Error(`${stage}\uFF1A\u6D4F\u89C8\u5668\u65E0\u6CD5\u8BFB\u53D6\u54CD\u5E94\uFF0C\u53EF\u80FD\u662F\u8DE8\u57DF\u3001\u7F51\u7EDC\u3001TLS \u6216 CSP \u95EE\u9898\uFF1B\u8BF7\u7ED3\u5408\u6D4F\u89C8\u5668 Network / Console \u6392\u67E5`);
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", handleAbort);
  }
};
