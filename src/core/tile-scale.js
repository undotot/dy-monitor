// 以 640×360 为正常尺寸，小窗口统一缩放，保留可操作的下限。
export const getTileScale = (width, height) => Math.max(0.55, Math.min(1, width / 640, height / 360));

export const observeTileControls = (root) => {
  const header = root.querySelector(".tile-status");
  const audioCorner = root.querySelector(".tile-audio-corner");
  const tools = root.querySelector(".tile-tools");
  const handleResize = () => {
    const width = root.clientWidth, height = root.clientHeight;
    if (!width || !height) return;
    const scale = getTileScale(width, height);
    // 动态几何值由实际房间尺寸决定，兼容主墙、放大和画中画。
    // 胶囊宽度只随直播间名收缩（CSS width:auto），缩放仅用 transform；
    // 不得写内联 width/right 固定值——内联样式会盖过样式表，把胶囊拉成整格宽的横条。
    const headerScale = Math.max(0.8, scale);
    header.style.transformOrigin = "top left";
    header.style.transform = `scale(${headerScale})`;
    if (audioCorner) {
      audioCorner.style.transformOrigin = "top right";
      audioCorner.style.transform = `scale(${headerScale})`;
    }
    tools.style.transform = `translateX(-50%) scale(${scale})`;
    tools.style.transformOrigin = "bottom center";
    tools.style.maxWidth = `${Math.max(0, (width - 12) / scale)}px`;
    tools.style.bottom = `${8 * scale}px`;
    tools.style.justifyContent = "flex-start";
  };
  const ResizeObserverClass = root.ownerDocument.defaultView.ResizeObserver;
  const observer = ResizeObserverClass ? new ResizeObserverClass(handleResize) : null;
  observer?.observe(root);
  handleResize();
  return () => observer?.disconnect();
};
