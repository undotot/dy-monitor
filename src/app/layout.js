// 选择与焦点 + 布局计算。
// 平铺：布局模式 1–4 列或 auto（√n 夹取 1..4）；放大：主格 + 侧栏（默认 280px），主格跨全部行。
// 放大时主格与侧栏的分界线可拖动调宽，无图标，只靠 col-resize 光标示意。

// 侧栏宽度夹取：自由调整；唯一约束是主格不得窄于缩小的侧栏（侧栏 ≤ 墙宽一半），
// 另留 120px 可用性下限，避免侧栏拖到不可用。
export const clampSidebarWidth = (wallWidth, desired) => {
  const min = 120;
  const max = Math.max(min, Math.floor(wallWidth / 2));
  return Math.round(Math.min(max, Math.max(min, desired)));
};

export function initLayout(ctx) {
  ctx.sidebarWidth = 280; // 会话内记住，不写入存档
  ctx.wallResize = ctx.els?.wallResize || null;

  ctx.select = (tileOrId) => {
    const id = typeof tileOrId === "string" ? tileOrId : tileOrId?.id ?? null;
    ctx.selectedId = id && ctx.tiles.has(id) ? id : null;
    for (const tile of ctx.tiles.values()) tile.root.classList.toggle("is-selected", tile.id === ctx.selectedId);
    ctx.applyAudioAll();
  };

  ctx.setFocus = (id) => {
    ctx.focused = id && ctx.tiles.has(id) ? id : null;
    ctx.handleLayout();
    ctx.applyAudioAll();
  };

  ctx.toggleFocus = (tile) => ctx.setFocus(ctx.focused === tile.id ? null : tile.id);

  ctx.syncLayoutRadios = () => {
    for (const input of ctx.wrapper.querySelectorAll("[name=layout-preset]")) {
      input.checked = String(input.value) === String(ctx.layoutMode);
    }
  };

  ctx.handleLayout = () => {
    const list = [...ctx.tiles.values()];
    const n = list.length;
    const focusedMode = Boolean(ctx.focused && ctx.tiles.has(ctx.focused) && n > 1);
    ctx.wall.classList.toggle("is-focused", focusedMode);
    const gridRootOf = (tile) => (ctx.pipSession?.tile === tile ? ctx.pipSession.placeholder : tile.root);
    if (!focusedMode) {
      const columns = ctx.layoutMode === "auto"
        ? Math.max(1, Math.min(4, Math.ceil(Math.sqrt(Math.max(1, n)))))
        : Math.max(1, Math.min(Number(ctx.layoutMode), Math.max(1, n)));
      const rows = Math.max(1, Math.ceil(n / columns));
      ctx.wall.style.gridTemplateColumns = `repeat(${columns}, minmax(0,1fr))`;
      ctx.wall.style.gridTemplateRows = `repeat(${rows}, minmax(0,1fr))`;
      for (const tile of list) {
        gridRootOf(tile).style.gridColumn = "";
        gridRootOf(tile).style.gridRow = "";
        tile.root.classList.remove("is-focused");
      }
    } else {
      // 量不到墙宽时退回记录值；量得到则按当前墙宽夹取（窗口缩放不至于挤爆）
      const wallW = ctx.wall.clientWidth;
      const sideW = wallW > 0 ? clampSidebarWidth(wallW, ctx.sidebarWidth) : ctx.sidebarWidth;
      const secondaries = list.filter((tile) => tile.id !== ctx.focused);
      ctx.wall.style.gridTemplateColumns = `minmax(0,1fr) ${sideW}px`;
      ctx.wall.style.gridTemplateRows = `repeat(${Math.max(1, secondaries.length)}, minmax(110px, 1fr))`;
      for (const tile of list) {
        const gridRoot = gridRootOf(tile);
        if (tile.id === ctx.focused) {
          gridRoot.style.gridColumn = "1";
          gridRoot.style.gridRow = "1 / -1";
          tile.root.classList.add("is-focused");
        } else {
          gridRoot.style.gridColumn = "2";
          gridRoot.style.gridRow = String(secondaries.indexOf(tile) + 1);
          tile.root.classList.remove("is-focused");
        }
      }
      // 拖拽条实测吸附到主格右缘与侧栏左缘的中缝上，不吃 gap/padding/滚动条的误差
      const mainRoot = gridRootOf(list.find((tile) => tile.id === ctx.focused));
      const anchor = secondaries[0] && gridRootOf(secondaries[0]);
      if (ctx.wallResize && mainRoot && anchor) {
        const wallRect = ctx.wall.getBoundingClientRect();
        const mainRect = mainRoot.getBoundingClientRect();
        const anchorRect = anchor.getBoundingClientRect();
        if (wallRect.width > 0 && anchorRect.width > 0) {
          ctx.wallResize.style.right = `${wallRect.right - (mainRect.right + anchorRect.left) / 2 - 7}px`;
        }
      }
    }
    ctx.syncLayoutRadios();
  };

  /* --- 放大模式：拖主格/侧栏分界线调宽 --- */
  const resizeEl = ctx.wallResize;
  if (resizeEl) {
    let dragging = false;
    const stop = () => { dragging = false; };
    resizeEl.addEventListener("pointerdown", (event) => {
      if (!ctx.focused) return;
      dragging = true;
      try { resizeEl.setPointerCapture?.(event.pointerId); } catch {}
      event.preventDefault();
      event.stopPropagation();
    });
    resizeEl.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const rect = ctx.wall.getBoundingClientRect();
      // 指针对齐侧栏左缘：缝隙画在主格侧，侧栏宽 = 指针到墙右缘的距离
      if (rect.width > 0) ctx.sidebarWidth = clampSidebarWidth(rect.width, rect.width - (event.clientX - rect.left));
      ctx.handleLayout();
    });
    resizeEl.addEventListener("pointerup", stop);
    resizeEl.addEventListener("pointercancel", stop);
    // 墙纵向滚动时把分界条拉回视野
    ctx.wall.addEventListener("scroll", () => { resizeEl.style.top = `${ctx.wall.scrollTop}px`; });
  }
}
