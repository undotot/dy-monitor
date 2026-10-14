import { clamp01 } from "../core/settings.js";

// 音量控件有独立的指针生命周期，不参与画格选择、换位或菜单操作。
export const bindTileAudio = (ctx, tile) => {
  const corner = tile.audioCorner;
  if (!corner || !tile.volSlider) return;
  const win = tile.root.ownerDocument.defaultView;
  const subscriptions = [];
  const listen = (element, type, handler, options = {}) => {
    element.addEventListener(type, handler, options);
    subscriptions.push(() => element.removeEventListener(type, handler, options));
  };
  let activePointer = null, previousDraggable = false, dirty = false;
  const handleSave = () => {
    if (!dirty) return;
    dirty = false;
    ctx.save();
  };
  const handleFinish = (event) => {
    if (activePointer === null || (event?.pointerId !== undefined && event.pointerId !== activePointer)) return;
    activePointer = null;
    tile.audioInteractionActive = false;
    corner.classList.remove("is-dragging-vol");
    tile.root.draggable = previousDraggable;
    handleSave();
  };
  const handleVolume = (value) => {
    tile.vol = clamp01(value, tile.vol);
    if (tile.vol > 0) tile.muted = false;
    tile.volSlider.value = String(tile.vol);
    ctx.applyAudio(tile);
    ctx.updateTileChrome(tile);
    dirty = true;
  };
  for (const type of ["pointermove", "pointerup", "pointercancel", "mousedown", "click", "dblclick", "keydown", "input", "change"]) listen(corner, type, (event) => event.stopPropagation());
  listen(corner, "contextmenu", (event) => { event.preventDefault(); event.stopPropagation(); });
  listen(corner, "dragstart", (event) => { event.preventDefault(); event.stopPropagation(); });
  listen(corner, "pointerdown", (event) => {
    event.stopPropagation();
    if (activePointer !== null || (event.button !== undefined && event.button !== 0)) return;
    activePointer = event.pointerId;
    previousDraggable = tile.root.draggable;
    tile.audioInteractionActive = true;
    tile.root.draggable = false;
    corner.classList.add("is-dragging-vol");
  });
  listen(win, "pointerup", handleFinish, { capture: true });
  listen(win, "pointercancel", handleFinish, { capture: true });
  listen(win, "blur", () => handleFinish());
  listen(tile.volSlider, "lostpointercapture", handleFinish);
  listen(tile.volSlider, "input", (event) => handleVolume(event.target.value));
  listen(tile.volSlider, "change", () => { if (activePointer === null) handleSave(); });
  listen(tile.muteBtn, "click", () => ctx.toggleMute(tile));
  listen(corner, "wheel", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (activePointer !== null || !event.deltaY) return;
    const increment = event.shiftKey ? 0.01 : 0.05;
    handleVolume(Number((tile.vol + (event.deltaY < 0 ? increment : -increment)).toFixed(2)));
    handleSave();
  }, { passive: false });
  tile.disconnectAudio = () => {
    handleFinish();
    for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
  };
};
