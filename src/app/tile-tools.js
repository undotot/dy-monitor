export const closeTileMore = (root, { restoreFocus = false } = {}) => {
  const menu = root.querySelector("[data-t-more-menu]");
  const button = root.querySelector("[data-t-more]");
  if (!menu || !button) return;
  menu.hidden = true;
  for (const property of ["left", "right", "top", "bottom"]) menu.style.removeProperty(property);
  root.classList.remove("tile-more-open");
  button.setAttribute("aria-expanded", "false");
  if (restoreFocus) button.focus();
};

export const bindTileTools = (tile) => {
  const { root } = tile;
  const button = root.querySelector("[data-t-more]");
  const menu = root.querySelector("[data-t-more-menu]");
  if (!button || !menu) return;
  const getMenuItems = () => [...menu.querySelectorAll("button:not(:disabled):not([hidden])")].filter((item) => {
    for (const size of ["mini", "narrow", "micro"]) if (item.classList.contains(`tool-${size}-action`) && !root.classList.contains(`tools-${size}`)) return false;
    return true;
  });
  const handleOpen = () => {
    if (!menu.hidden) { closeTileMore(root, { restoreFocus: true }); return; }
    for (const other of root.getRootNode().querySelectorAll(".tile-more-open")) closeTileMore(other);
    menu.hidden = false;
    for (const proxy of menu.querySelectorAll("[data-tool-action]")) {
      const label = root.querySelector(`[data-t-${proxy.dataset.toolAction}]`)?.getAttribute("aria-label");
      if (label) { proxy.dataset.toolLabel = label; proxy.setAttribute("aria-label", label); }
    }
    root.classList.add("tile-more-open");
    button.setAttribute("aria-expanded", "true");
    if (menu.classList.contains("is-tool-flyout")) {
      // 小窗菜单脱离画格裁切，但仍靠近触发按钮，避免跳到屏幕另一角。
      const anchor = button.getBoundingClientRect();
      const bounds = menu.getBoundingClientRect();
      const view = root.ownerDocument.defaultView;
      const left = Math.max(8, Math.min(anchor.right - bounds.width, view.innerWidth - bounds.width - 8));
      const top = anchor.top - bounds.height - 8 >= 8 ? anchor.top - bounds.height - 8 : Math.max(8, Math.min(anchor.bottom + 8, view.innerHeight - bounds.height - 8));
      Object.assign(menu.style, { left: `${left}px`, right: "auto", top: `${top}px`, bottom: "auto" });
    }
    getMenuItems()[0]?.focus();
  };
  button.addEventListener("click", handleOpen);
  button.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    if (menu.hidden) handleOpen();
    else getMenuItems()[0]?.focus();
  });
  menu.addEventListener("click", (event) => {
    const item = event.target.closest("button");
    if (!item) return;
    if (item.dataset.toolAction) root.querySelector(`[data-t-${item.dataset.toolAction}]`)?.click();
    // 设置按钮会把焦点移入弹幕表单，其余操作返回“更多”。
    closeTileMore(root, { restoreFocus: !item.matches("[data-t-dm-settings], [data-t-remove], [data-t-pip]") });
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeTileMore(root, { restoreFocus: true }); return; }
    const items = getMenuItems();
    const index = items.indexOf(event.target.closest("button"));
    if (index < 0) return;
    const positions = { ArrowDown: (index + 1) % items.length, ArrowUp: (index - 1 + items.length) % items.length, Home: 0, End: items.length - 1 };
    if (event.key in positions) { event.preventDefault(); items[positions[event.key]].focus(); }
  });
  menu.addEventListener("focusout", (event) => {
    if (!menu.contains(event.relatedTarget) && event.relatedTarget !== button) closeTileMore(root);
  });
};
