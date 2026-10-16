import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { bindTileFullscreen, isTileFullscreen } from "../src/app/tile-fullscreen.js";
import { initContextMenu } from "../src/app/context-menu.js";

const settle = () => new Promise((resolve) => setImmediate(resolve));
const setup = ({ shadow = true, prefixed = false } = {}) => {
  const win = new Window();
  const doc = win.document;
  const host = doc.createElement("div");
  doc.body.append(host);
  const scope = shadow ? host.attachShadow({ mode: "open" }) : doc;
  const root = doc.createElement("article");
  root.innerHTML = '<video></video><button data-t-full></button><button data-tool-action="full"></button>';
  (shadow ? scope : doc.body).append(root);
  const state = { current: null, requests: 0, exits: 0, layouts: 0, toasts: [] };
  const field = prefixed ? "webkitFullscreenElement" : "fullscreenElement";
  Object.defineProperty(doc, field, { configurable: true, get: () => state.current && shadow ? host : state.current });
  if (shadow) Object.defineProperty(scope, field, { configurable: true, get: () => state.current });
  const notify = () => doc.dispatchEvent(new win.Event(prefixed ? "webkitfullscreenchange" : "fullscreenchange"));
  root[prefixed ? "webkitRequestFullscreen" : "requestFullscreen"] = () => {
    state.requests++;
    state.current = root;
    notify();
    return Promise.resolve();
  };
  doc[prefixed ? "webkitExitFullscreen" : "exitFullscreen"] = () => {
    state.exits++;
    state.current = null;
    notify();
    return Promise.resolve();
  };
  const tile = { root, video: root.querySelector("video") };
  const ctx = { scheduleLayout: () => state.layouts++, closeContextMenu: () => {}, showToast: (message) => state.toasts.push(message) };
  bindTileFullscreen(ctx, tile);
  return { win, doc, host, scope, root, tile, ctx, state, notify, button: root.querySelector("[data-t-full]") };
};

for (const options of [{ shadow: true }, { shadow: false }, { shadow: true, prefixed: true }]) {
  test(`全屏在${options.shadow ? "Shadow DOM" : "普通DOM"}${options.prefixed ? " Safari前缀" : "标准API"}下可反复进入退出`, async () => {
    const { win, root, tile, state, button } = setup(options);
    try {
      Object.assign(root.style, { position: "absolute", left: "237px", width: "411px", height: "231px" });
      const geometry = root.style.cssText;
      for (let count = 1; count <= 3; count++) {
        button.click();
        await settle();
        assert.equal(state.requests, count);
        assert.equal(isTileFullscreen(root), true);
        assert.equal(button.getAttribute("aria-label"), "退出全屏");
        assert.equal(root.querySelector("[data-tool-action=full]").dataset.toolLabel, "退出全屏");
        assert.equal(root.classList.contains("is-room-fullscreen"), true);
        button.click();
        await settle();
        assert.equal(state.exits, count);
        assert.equal(isTileFullscreen(root), false);
        assert.equal(button.getAttribute("aria-pressed"), "false");
        assert.equal(button.getAttribute("aria-label"), "全屏");
        assert.equal(root.style.cssText, geometry);
      }
      assert.equal(state.toasts.length, 0);
      assert.equal(state.layouts, 6);
    } finally { tile.disconnectFullscreen(); win.close(); }
  });
}

test("浏览器主动退出全屏会清理状态，宿主全屏不等于所有画格全屏", async () => {
  const { win, root, scope, state, button, tile, notify } = setup();
  try {
    button.click(); await settle();
    state.current = null;
    notify();
    assert.equal(button.getAttribute("aria-label"), "全屏");
    assert.equal(root.classList.contains("is-room-fullscreen"), false);
    const sibling = win.document.createElement("article");
    scope.append(sibling);
    state.current = sibling;
    assert.equal(isTileFullscreen(root), false);
  } finally { tile.disconnectFullscreen(); win.close(); }
});

test("旧版WebKit没有ShadowRoot getter时通过原生全屏伪类识别，不把宿主下其他画格算入", () => {
  const { win, root, scope, state, tile } = setup({ prefixed: true });
  try {
    Object.defineProperty(scope, "webkitFullscreenElement", { configurable: true, value: undefined });
    state.current = root;
    root.matches = (selector) => selector === ":-webkit-full-screen";
    assert.equal(isTileFullscreen(root), true);
    root.matches = () => false;
    assert.equal(isTileFullscreen(root), false);
  } finally { tile.disconnectFullscreen(); win.close(); }
});

test("异步进入/退出失败均有提示，保持真实状态并解除按钮禁用", async () => {
  const { win, doc, root, state, button, tile } = setup();
  try {
    root.requestFullscreen = () => Promise.reject(new Error("请求被拒绝"));
    button.click(); await settle();
    assert.equal(state.toasts.length, 1);
    assert.match(state.toasts[0], /请求被拒绝/);
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute("aria-pressed"), "false");
    state.current = root;
    doc.exitFullscreen = () => Promise.reject(new Error("退出被拒绝"));
    button.click(); await settle();
    assert.equal(state.toasts.length, 2);
    assert.equal(button.getAttribute("aria-pressed"), "true");
    assert.equal(button.disabled, false);
  } finally { tile.disconnectFullscreen(); win.close(); }
});

test("请求未完成时不重复进入，不支持API时给出可恢复说明", async () => {
  const { win, root, state, button, tile } = setup();
  try {
    let finish;
    root.requestFullscreen = () => { state.requests++; return new Promise((resolve) => { finish = resolve; }); };
    button.click(); button.click();
    assert.equal(state.requests, 1);
    assert.equal(button.disabled, true);
    finish(); await settle();
    root.requestFullscreen = undefined;
    button.click(); await settle();
    assert.match(state.toasts[0], /不支持画格全屏/);
    assert.equal(button.disabled, false);
  } finally { tile.disconnectFullscreen(); win.close(); }
});

test("画中画跨文档迁移后监听新文档，销毁后不再响应旧事件", async () => {
  const { win, root, state, button, tile, ctx, notify } = setup();
  const pip = new Window();
  try {
    pip.document.body.append(root);
    let active = null;
    Object.defineProperty(pip.document, "fullscreenElement", { get: () => active });
    root.requestFullscreen = async () => { active = root; pip.document.dispatchEvent(new pip.Event("fullscreenchange")); };
    pip.document.exitFullscreen = async () => { active = null; pip.document.dispatchEvent(new pip.Event("fullscreenchange")); };
    bindTileFullscreen(ctx, tile);
    button.click(); await settle();
    assert.equal(button.getAttribute("aria-label"), "退出全屏");
    const layouts = state.layouts;
    notify();
    assert.equal(state.layouts, layouts);
    await tile.exitFullscreen();
    assert.equal(button.getAttribute("aria-label"), "全屏");
    tile.disconnectFullscreen();
    button.click(); await settle();
    assert.equal(active, null);
  } finally { tile.disconnectFullscreen(); pip.close(); win.close(); }
});

test("全屏右键菜单放在全屏画格内，点击退出后恢复原菜单宿主", async () => {
  const { win, root, tile, ctx, state, notify } = setup();
  const previousDocument = globalThis.document;
  globalThis.document = win.document;
  try {
    const appShell = win.document.createElement("div");
    root.parentNode.append(appShell);
    appShell.append(root);
    const menu = win.document.createElement("div");
    appShell.append(menu);
    Object.assign(ctx, { appShell, wrapper: appShell, els: { ctx: menu }, tiles: new Map([["a", tile]]), audio: { mode: "mix" } });
    tile.danmaku = { enabled: false };
    initContextMenu(ctx);
    state.current = root;
    notify();
    ctx.openContextMenu(tile, 10, 10);
    assert.equal(menu.parentElement, root);
    const exit = [...menu.querySelectorAll("button")].find((button) => button.textContent === "退出全屏");
    assert.ok(exit);
    exit.click();
    await settle();
    assert.equal(isTileFullscreen(root), false);
    assert.equal(menu.hidden, true);
    assert.equal(menu.parentElement, appShell);
  } finally { globalThis.document = previousDocument; tile.disconnectFullscreen(); win.close(); }
});
