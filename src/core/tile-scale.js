// 以 640×360 为正常尺寸，小窗口统一缩放，保留可操作的下限。
export const getTileScale = (width, height) => Math.max(0.55, Math.min(1, width / 640, height / 360));

export const observeTileControls = (root) => {
  const header = root.querySelector(".tile-status");
  const audioCorner = root.querySelector(".tile-audio-corner");
  const tools = root.querySelector(".tile-tools");
  const viewport = root.querySelector(".tile-viewport") || root;
  const handleResize = () => {
    const width = viewport.clientWidth, height = viewport.clientHeight;
    if (!width || !height) return;
    const settings = root.querySelector("[data-tile-settings]");
    settings?.classList.toggle("is-room-flyout", !settings.hidden && (root.clientWidth < 420 || height < 340));
    const scale = getTileScale(width, height);
    root.style.setProperty("--audio-popover-width", `${Math.max(48, Math.min(128, width - 16))}px`);
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
    // 通过隐藏文字、收纳低频功能压缩工具条，保留真实的点击尺寸。
    root.classList.toggle("tools-compact", width < 420);
    root.classList.toggle("tools-mini", width < 300);
    root.classList.toggle("tools-tiny", width < 150);
    root.classList.toggle("tools-narrow", width < 120);
    root.classList.toggle("tools-micro", width < 85);
    tools.style.maxWidth = `${Math.max(0, width - 12)}px`;
    const menu = root.querySelector("[data-t-more-menu]");
    menu?.classList.toggle("is-tool-flyout", width < 300 || height < 270);
    if (menu && !menu.classList.contains("is-tool-flyout")) {
      for (const property of ["left", "right", "top", "bottom"]) menu.style.removeProperty(property);
    }
    const quality = root.querySelector(".tool-quality");
    const qualitySlot = root.querySelector("[data-tool-quality-slot]");
    const qualityAnchor = root.querySelector("[data-tool-quality-anchor]");
    if (quality && qualitySlot && qualityAnchor) {
      const parent = width < 300 ? qualitySlot : qualityAnchor;
      if (quality.parentElement !== parent) parent.append(quality);
      qualitySlot.hidden = width >= 300;
    }
  };
  const ResizeObserverClass = root.ownerDocument.defaultView.ResizeObserver;
  const observer = ResizeObserverClass ? new ResizeObserverClass(handleResize) : null;
  observer?.observe(viewport);
  handleResize();
  return () => observer?.disconnect();
};
