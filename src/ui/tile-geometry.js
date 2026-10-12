// 布局切换和画中画共用，只清理几何，不改播放器状态。
export const clearTileGeometry = (root) => {
  for (const property of ["position", "left", "right", "top", "width", "height", "gridColumn", "gridRow", "justifySelf", "alignSelf"]) root.style[property] = "";
};
