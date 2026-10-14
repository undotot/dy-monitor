export function bindTileDrag(ctx, tile) {
  const root = tile.root;
  const find = (selector) => root.querySelector(selector);

  root.draggable = true;
  const dragHandle = find("[data-drag]");
  if (dragHandle) dragHandle.draggable = true;

  const handleClearDrag = () => {
    ctx.dragSourceId = null;
    for (const room of ctx.tiles.values()) {
      room.root.classList.remove("is-dragging", "is-drop-target");
    }
  };

  const canDrop = () => (
    ctx.dragSourceId &&
    ctx.dragSourceId !== tile.id &&
    ctx.pipSession?.tile !== tile &&
    ctx.pipSession?.tile?.id !== ctx.dragSourceId
  );

  root.addEventListener("dragstart", (event) => {
    if (
      !event.dataTransfer ||
      tile.audioInteractionActive ||
      event.target.closest("button, input, select, textarea, label, a") ||
      ctx.pipSession?.tile === tile
    ) {
      event.preventDefault();
      return;
    }
    ctx.dragSourceId = tile.id;
    root.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", tile.id);
  });

  root.addEventListener("dragend", handleClearDrag);

  root.addEventListener("dragover", (event) => {
    if (!canDrop()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    root.classList.add("is-drop-target");
  });

  root.addEventListener("dragleave", (event) => {
    if (!root.contains(event.relatedTarget)) {
      root.classList.remove("is-drop-target");
    }
  });

  root.addEventListener("drop", (event) => {
    if (!canDrop()) return;
    event.preventDefault();
    const source = ctx.tiles.get(ctx.dragSourceId);
    handleClearDrag();
    if (source) ctx.swapTiles(source, tile);
  });

  root.addEventListener("keydown", (event) => {
    if (event.target !== root || !event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const rooms = [...ctx.tiles.values()];
    const target = rooms[rooms.indexOf(tile) + (event.key === "ArrowLeft" ? -1 : 1)];
    if (!target) return;
    event.preventDefault();
    ctx.swapTiles(tile, target);
    root.focus();
  });
}
