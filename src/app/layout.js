import { calculateFocusLayout as defaultFocusLayout, resolveFocusLayout } from "../core/focus-layout.js";
import { clearTileGeometry } from "../ui/tile-geometry.js";

export function initLayout(ctx, { calculateFocusLayout = defaultFocusLayout, allowSingleFocus = false } = {}) {
  const doc = ctx.wall.ownerDocument;
  const clock = doc.defaultView;
  const regions = {};
  for (const [name, label] of [["right", "右侧小直播间"], ["bottom", "底部小直播间"]]) {
    const region = doc.createElement("section");
    region.className = "focus-region";
    region.dataset.focusRegion = name;
    region.setAttribute("aria-label", label);
    region.tabIndex = 0;
    region.hidden = true;
    const content = doc.createElement("div");
    content.className = "focus-content";
    region.append(content);
    ctx.wall.append(region);
    regions[name] = { root: region, content };
  }
  const hint = doc.createElement("span");
  hint.className = "focus-size-hint";
  hint.dataset.focusHint = "";
  hint.setAttribute("role", "status");
  hint.textContent = "窗口较小：画面已统一缩放，所有房间保持同屏";
  hint.hidden = true;
  ctx.wall.append(hint);

  const gridRootOf = (tile) => ctx.pipSession?.tile === tile ? ctx.pipSession.placeholder : tile.root;
  const moveRoot = (parent, root, reorder = false) => {
    if (root.parentElement === parent && !reorder) return;
    const video = root.querySelector("video");
    const wasPlaying = video && !video.paused;
    // 支持 moveBefore 的浏览器保留媒体播放状态，旧浏览器复用节点并恢复播放。
    if (parent.moveBefore && parent.isConnected && root.isConnected && parent.ownerDocument === root.ownerDocument) parent.moveBefore(root, null);
    else parent.append(root);
    if (wasPlaying && video.paused) void video.play().catch(() => ctx.log?.("", "布局调整后视频未能自动继续，请点击播放"));
  };

  ctx.select = (tileOrId) => {
    const id = typeof tileOrId === "string" ? tileOrId : tileOrId?.id ?? null;
    ctx.selectedId = id && ctx.tiles.has(id) ? id : null;
    for (const tile of ctx.tiles.values()) {
      const selected = tile.id === ctx.selectedId;
      tile.root.classList.toggle("is-selected", selected);
      if (selected) tile.root.setAttribute("aria-current", "true");
      else tile.root.removeAttribute("aria-current");
    }
    ctx.applyAudioAll();
    if (id) ctx.showInspectorTab?.("room");
    ctx.renderRoomChrome?.();
  };
  ctx.setFocus = (id) => {
    ctx.focused = id && ctx.tiles.has(id) ? id : null;
    ctx.handleLayout();
    ctx.applyAudioAll();
    ctx.renderRoomChrome?.();
  };
  ctx.toggleFocus = (tile) => ctx.setFocus(ctx.focused === tile.id ? null : tile.id);
  ctx.syncLayoutRadios = () => {
    for (const input of ctx.wrapper.querySelectorAll("[name=layout-preset]")) input.checked = String(input.value) === String(ctx.layoutMode);
  };

  ctx.handleLayout = () => {
    const list = [...ctx.tiles.values()];
    const focusedMode = Boolean(ctx.focused && ctx.tiles.has(ctx.focused) && (list.length > 1 || allowSingleFocus));
    ctx.wall.classList.toggle("is-focused", focusedMode);
    hint.hidden = true;
    if (!focusedMode) {
      ctx.focusLayout = null;
      delete ctx.wall.dataset.focusLayout;
      delete ctx.wall.dataset.focusFallback;
      ctx.wall.style.gap = "";
      ctx.wall.style.columnGap = "";
      ctx.wall.style.rowGap = "";
      regions.right.root.hidden = true;
      regions.right.root.style.cssText = "";
      regions.bottom.root.hidden = true;
      regions.bottom.root.style.cssText = "";
      const total = Math.max(1, list.length);
      let columns, rows;
      if (ctx.layoutMode === "auto") {
        // 平铺格子尽量 16:9：枚举行列组合取格子比例最接近 16:9 者；
        // 空格子按面积占比加权惩罚，避免为凑比例空掉大片墙。
        columns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(total))));
        rows = Math.max(1, Math.ceil(total / columns));
        const rect = ctx.wall.getBoundingClientRect();
        const width = rect.width || ctx.wall.clientWidth;
        const height = rect.height || ctx.wall.clientHeight;
        if (width > 0 && height > 0) {
          let bestScore = Infinity;
          for (let cols = 1; cols <= total; cols++) {
            for (let rowst = Math.ceil(total / cols); rowst <= total; rowst++) {
              const cellRatio = (width / cols) / (height / rowst);
              const score = Math.abs(cellRatio / (16 / 9) - 1) + 2 * ((cols * rowst - total) / (cols * rowst));
              if (score < bestScore) { bestScore = score; columns = cols; rows = rowst; }
            }
          }
        }
      } else {
        columns = Math.max(1, Math.min(Number(ctx.layoutMode), total));
        rows = Math.max(1, Math.ceil(total / columns));
      }
      ctx.wall.style.gridTemplateColumns = `repeat(${columns}, minmax(0,1fr))`;
      ctx.wall.style.gridTemplateRows = `repeat(${rows}, minmax(0,1fr))`;
      for (const tile of list) {
        const root = gridRootOf(tile);
        moveRoot(ctx.wall, root);
        clearTileGeometry(root);
        tile.root.classList.remove("is-focused");
      }
      // 平铺依赖 DOM 顺序；只有顺序变化时移动节点。
      const roots = list.map(gridRootOf);
      const current = [...ctx.wall.children].filter((root) => roots.includes(root));
      if (current.some((root, index) => root !== roots[index])) {
        for (const root of roots) moveRoot(ctx.wall, root, true);
      }
      ctx.syncLayoutRadios();
      ctx.renderRoomChrome?.();
      return;
    }
    const rect = ctx.wall.getBoundingClientRect();
    // clientWidth/Height 会取整；保留小数像素，避免底部画格被裁掉半个像素。
    const width = rect.width || ctx.wall.clientWidth;
    const height = rect.height || ctx.wall.clientHeight;
    // 关闭的 dialog 无尺寸，等待打开后的 ResizeObserver，避免用虚构屏幕尺寸计算。
    if (!width || !height) return;
    const ratioOf = (tile) => tile.video.videoWidth && tile.video.videoHeight ? tile.video.videoWidth / tile.video.videoHeight : 16 / 9;
    const resolved = resolveFocusLayout({ width, height, mainRoomId: ctx.focused,
      rooms: list.map((tile) => ({ id: tile.id, ratio: ratioOf(tile) })), previous: ctx.focusLayout }, calculateFocusLayout);
    const plan = resolved?.plan;
    if (!plan) return;
    // 已检查其他主窗；只有整个场景仍不可行时才清理坐标并恢复平铺。
    if (plan.status === "infeasible") {
      ctx.focused = null;
      ctx.handleLayout();
      ctx.applyAudioAll();
      const reason = plan.code === "SECONDARY_RATIO_MISMATCH"
        ? "已检查所有房间作为主窗，副窗源比例仍无法统一，不能同时满足小窗等大与无内部黑边。" : plan.reason;
      ctx.showToast?.(`${reason}已恢复平铺。`, [], 6000);
      return;
    }
    const mainTile = ctx.tiles.get(resolved.mainRoomId);
    const secondaries = resolved.secondaryRoomIds.map((id) => ctx.tiles.get(id));
    ctx.focusLayout = plan;
    ctx.wall.dataset.focusLayout = plan.layoutShape ?? plan.family;
    ctx.wall.dataset.focusFallback = String(Boolean(plan.fallback));
    if (plan.absolute) {
      ctx.wall.style.gap = "0";
      ctx.wall.style.gridTemplateColumns = "minmax(0,1fr)";
      ctx.wall.style.gridTemplateRows = "minmax(0,1fr)";
      regions.right.root.hidden = true;
      regions.bottom.root.hidden = true;
      const rooms = [{ tile: mainTile, box: plan.main }, ...plan.placements.map((box) => ({ tile: secondaries[box.index], box }))];
      for (const { tile, box } of rooms) {
        const root = gridRootOf(tile);
        moveRoot(ctx.wall, root);
        clearTileGeometry(root);
        Object.assign(root.style, { position: "absolute", left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px`, height: `${box.height}px` });
      }
      for (const tile of list) tile.root.classList.toggle("is-focused", tile.id === ctx.focused && ctx.pipSession?.tile !== tile);
      hint.textContent = plan.fallback ? "当前数量采用等大布局，避免主副窗尺寸悬殊" : "窗口较小：画面已统一缩放，所有房间保持同屏";
      hint.hidden = !plan.fallback && !plan.constrained;
      if (plan.containSecondary) {
        hint.textContent = "副窗源比例不同：已保留所选主窗，个别小窗会以黑边适配。";
        hint.hidden = false;
      }
      ctx.syncLayoutRadios();
      ctx.renderRoomChrome?.();
      return;
    }
    ctx.wall.style.gap = "";
    ctx.wall.style.columnGap = `${plan.gapX ?? plan.gap}px`;
    ctx.wall.style.rowGap = `${plan.gapY ?? plan.gap}px`;
    ctx.wall.style.gridTemplateColumns = plan.rightWidth ? `${plan.main.width}px ${plan.rightWidth}px` : `${plan.main.width}px`;
    ctx.wall.style.gridTemplateRows = plan.bottomHeight ? `${plan.topHeight}px ${plan.bottomHeight}px` : `${plan.topHeight}px`;
    const mainRoot = gridRootOf(mainTile);
    moveRoot(ctx.wall, mainRoot);
    clearTileGeometry(mainRoot);
    // 主窗在自身列内垂直居中：细留黑上下均分呈 letterbox 观感，无留黑时居中等价于顶对齐。
    Object.assign(mainRoot.style, { gridColumn: "1", gridRow: "1", width: `${plan.main.width}px`, height: `${plan.main.height}px`, justifySelf: "start", alignSelf: plan.mainOffsetY > 0.01 ? "center" : "start" });
    for (const tile of list) tile.root.classList.toggle("is-focused", tile.id === ctx.focused && ctx.pipSession?.tile !== tile);
    regions.right.root.hidden = !plan.rightWidth;
    regions.bottom.root.hidden = !plan.bottomHeight;
    Object.assign(regions.right.root.style, { gridColumn: "2", gridRow: plan.bottomSpansWall ? "1" : "1 / -1" });
    Object.assign(regions.bottom.root.style, { gridColumn: plan.bottomSpansWall ? "1 / -1" : "1", gridRow: "2" });
    regions.right.content.style.height = `${plan.rightContentHeight}px`;
    regions.bottom.content.style.height = `${plan.bottomContentHeight}px`;
    for (const placement of plan.placements) {
      const root = gridRootOf(secondaries[placement.index]);
      moveRoot(regions[placement.region].content, root);
      clearTileGeometry(root);
      Object.assign(root.style, { position: "absolute", left: `${placement.x}px`, top: `${placement.y}px`, width: `${placement.width}px`, height: `${placement.height}px` });
    }
    // 键盘和屏幕阅读器的访问顺序与画面中的房间顺序一致。
    for (const name of ["right", "bottom"]) {
      const roots = plan.placements.filter((placement) => placement.region === name).map((placement) => gridRootOf(secondaries[placement.index]));
      const parent = regions[name].content;
      if ([...parent.children].some((root, index) => root !== roots[index])) {
        for (const root of roots) moveRoot(parent, root, true);
      }
    }
    hint.hidden = !plan.constrained || plan.quality >= 0.98;
    if (plan.containSecondary) {
      hint.textContent = "副窗源比例不同：已保留所选主窗，个别小窗会以黑边适配。";
      hint.hidden = false;
    }
    ctx.syncLayoutRadios();
    ctx.renderRoomChrome?.();
  };

  let frame = null;
  ctx.scheduleLayout = () => {
    if (frame !== null) return;
    frame = clock.requestAnimationFrame(() => { frame = null; ctx.handleLayout(); });
  };
  const observer = clock.ResizeObserver ? new clock.ResizeObserver(ctx.scheduleLayout) : null;
  observer?.observe(ctx.wall);
  clock.addEventListener("resize", ctx.scheduleLayout);
  clock.addEventListener("pagehide", () => { observer?.disconnect(); if (frame !== null) clock.cancelAnimationFrame(frame); }, { once: true });

}
