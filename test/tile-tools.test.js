import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { tileMarkup } from "../src/ui/tile-markup.js";
import { bindTileTools } from "../src/app/tile-tools.js";

test("更多菜单排除隐藏操作，支持方向键、Escape与焦点返回", () => {
  const win = new Window();
  try {
    const root = win.document.createElement("article");
    root.innerHTML = tileMarkup();
    win.document.body.append(root);
    bindTileTools({ root });
    const more = root.querySelector("[data-t-more]");
    const menu = root.querySelector("[data-t-more-menu]");
    more.click();
    assert.equal(menu.hidden, false);
    assert.equal(win.document.activeElement, root.querySelector("[data-t-reload]"));
    win.document.activeElement.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    assert.equal(win.document.activeElement, root.querySelector("[data-t-dm-settings]"));
    win.document.activeElement.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(menu.hidden, true);
    assert.equal(more.getAttribute("aria-expanded"), "false");
    assert.equal(win.document.activeElement, more);
  } finally { win.close(); }
});

test("小窗收纳的独奏操作调用原按钮一次，多房菜单互斥", () => {
  const win = new Window();
  try {
    const roots = Array.from({ length: 2 }, () => {
      const root = win.document.createElement("article");
      root.innerHTML = tileMarkup();
      root.classList.add("tools-mini");
      win.document.body.append(root);
      bindTileTools({ root });
      return root;
    });
    roots[0].querySelector("[data-t-more]").click();
    roots[1].querySelector("[data-t-more]").click();
    assert.equal(roots[0].querySelector("[data-t-more-menu]").hidden, true);
    assert.equal(win.document.activeElement, roots[1].querySelector('[data-tool-action="solo"]'));
    let calls = 0;
    roots[1].querySelector("[data-t-solo]").addEventListener("click", () => calls++);
    roots[1].querySelector('[data-tool-action="solo"]').click();
    assert.equal(calls, 1);
    assert.equal(roots[1].querySelector("[data-t-more-menu]").hidden, true);
    assert.equal(win.document.activeElement, roots[1].querySelector("[data-t-more]"));
  } finally { win.close(); }
});

test("极窄画格收纳播放和弹幕开关，菜单保留全部操作且只触发一次", () => {
  const win = new Window();
  try {
    const root = win.document.createElement("article");
    root.innerHTML = tileMarkup();
    root.classList.add("tools-mini", "tools-narrow", "tools-micro");
    win.document.body.append(root);
    root.querySelector("[data-t-resume]").setAttribute("aria-label", "暂停");
    root.querySelector("[data-t-danmaku]").setAttribute("aria-label", "关闭弹幕");
    bindTileTools({ root });
    let calls = 0;
    root.querySelector("[data-t-danmaku]").addEventListener("click", () => calls++);
    root.querySelector("[data-t-more]").click();
    assert.equal(win.document.activeElement, root.querySelector('[data-tool-action="resume"]'));
    assert.equal(root.querySelector('[data-tool-action="resume"]').dataset.toolLabel, "暂停");
    win.document.activeElement.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    assert.equal(win.document.activeElement, root.querySelector('[data-tool-action="danmaku"]'));
    assert.equal(win.document.activeElement.getAttribute("aria-label"), "关闭弹幕");
    win.document.activeElement.click();
    assert.equal(calls, 1);
    assert.equal(root.querySelector("[data-t-more-menu]").hidden, true);
  } finally { win.close(); }
});
