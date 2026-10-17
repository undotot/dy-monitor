// 整理位置：不依赖 HTML5 拖拽的点击换位。
// 进入后点源画格、再点目标画格即交换；取消会按记录逆序恢复。
export function initReorder(ctx) {
  const bar = ctx.wrapper.querySelector("[data-reorder-bar]");
  const swapHistory = [];
  let source = null;

  const clearMarks = () => {
    source = null;
    for (const tile of ctx.tiles.values()) tile.root.classList.remove("is-reorder-source");
    ctx.wrapper.querySelectorAll(".reorder-badge").forEach((badge) => badge.remove());
  };
  const markTiles = () => {
    clearMarks();
    [...ctx.tiles.values()].forEach((tile, index) => {
      const badge = tile.root.ownerDocument.createElement("span");
      badge.className = "reorder-badge";
      badge.textContent = String(index + 1).padStart(2, "0");
      badge.setAttribute("aria-hidden", "true");
      tile.root.append(badge);
    });
  };
  const stop = () => {
    ctx.reordering = false;
    swapHistory.length = 0;
    clearMarks();
    if (bar) bar.hidden = true;
    ctx.appShell.classList.remove("is-rearranging");
  };
  const start = () => {
    if (ctx.tiles.size < 2) {
      ctx.showToast?.("至少需要两个房间才能整理位置。", [], 4e3);
      return;
    }
    if (ctx.reordering) return;
    ctx.reordering = true;
    source = null;
    swapHistory.length = 0;
    markTiles();
    if (bar) bar.hidden = false;
    ctx.appShell.classList.add("is-rearranging");
    ctx.wrapper.querySelector("[data-reorder-done]")?.focus?.({ preventScroll: true });
  };

  const handleSwap = (sourceTile, targetTile) => {
    if (!sourceTile || !targetTile || sourceTile === targetTile) return;
    ctx.swapTiles(sourceTile, targetTile);
    swapHistory.push([sourceTile, targetTile]);
    source = null;
    markTiles();
  };

  ctx.enterReorder = start;
  ctx.exitReorder = stop;

  ctx.wrapper.querySelector("[data-reorder-open]")?.addEventListener("click", start);
  ctx.wrapper.querySelector("[data-reorder-done]")?.addEventListener("click", stop);
  ctx.wrapper.querySelector("[data-reorder-cancel]")?.addEventListener("click", () => {
    for (let index = swapHistory.length - 1; index >= 0; index--) {
      const [a, b] = swapHistory[index];
      if (ctx.tiles.get(a.id) === a && ctx.tiles.get(b.id) === b) ctx.swapTiles(a, b);
    }
    stop();
  });

  ctx.wall.addEventListener("click", (event) => {
    if (!ctx.reordering) return;
    const tileRoot = event.target.closest?.(".tile-shell");
    if (!tileRoot) return;
    event.preventDefault();
    event.stopPropagation();
    const tile = [...ctx.tiles.values()].find((entry) => entry.root === tileRoot);
    if (!tile) return;
    if (!source) {
      source = tile;
      tile.root.classList.add("is-reorder-source");
      return;
    }
    if (source === tile) {
      tile.root.classList.remove("is-reorder-source");
      source = null;
      return;
    }
    handleSwap(source, tile);
  }, true);

  ctx.appShell.addEventListener("keydown", (event) => {
    if (ctx.reordering && event.key === "Escape") {
      event.preventDefault();
      ctx.wrapper.querySelector("[data-reorder-cancel]")?.click();
    }
  });
}
