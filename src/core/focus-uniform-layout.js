const DEFAULT_RATIO = 16 / 9;
const ratioOf = (ratio) => Number.isFinite(ratio) && ratio > 0 ? ratio : DEFAULT_RATIO;
const areaOf = (box) => box.width * box.height;
const fitVideo = (width, height, ratio) => {
  const videoWidth = Math.min(width, height * ratioOf(ratio));
  return { width: videoWidth, height: videoWidth / ratioOf(ratio) };
};

// 所有显示框严格16:9。主窗自由缩放，小窗只使用一个统一尺寸。
// 墙面剩余面积是真实代价，不能用任意比例的主窗容器把留边藏到内部。
export const calculateUniformFocusLayout = ({ width, height, mainRatio = DEFAULT_RATIO, secondaryRatios = [], anchor = "auto", previous = null }) => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 2 || height <= 2 || secondaryRatios.length > 15) return null;
  const count = secondaryRatios.length;
  const gapX = Math.min(0.5, width / (count + 3), height / (count + 3));
  const gapY = gapX / DEFAULT_RATIO;
  const viewportArea = width * height;
  // 副窗可操作下限：常态 120px（沿用 FOCUS_LIMITS.smallMin），窄墙/极扁墙自适应收缩。
  // 下限只拒绝退化细条，绝不阻止「全部房间同屏」这一硬约束——800×220 配 16 房
  // 需要约 97px 格子，width/8=100 会误拒，width/10=80 才留有余量。
  const cellFloor = Math.min(120, width / 10, height * DEFAULT_RATIO / 10);
  // 主窗跨度上界：由「格子不小于下限」推出主窗最多能横向铺几格，再留 2 格余量。
  // 旧上限 max(4,count) 会把 2~3 房的最优主窗直接截断，白白损失墙面。
  const scaleMax = Math.min(32, Math.ceil(width / Math.max(1, cellFloor)) + 2);
  let best = null, stable = null;
  const handleCandidate = (leftCols, rightCols, sideRows, bottomRows, sideCount, scale, position) => {
    const sideCols = leftCols + rightCols;
    const bottomCount = count - sideCount;
    const limits = [(width + gapX) / (scale + sideCols) - gapX, (height + gapY) * DEFAULT_RATIO / (scale + bottomRows) - gapX];
    if (sideRows) limits.push((height + gapY) * DEFAULT_RATIO / (sideRows + bottomRows) - gapX);
    const cellWidth = Math.min(...limits), cellHeight = cellWidth / DEFAULT_RATIO;
    if (cellWidth <= 0 || cellHeight <= 0) return;
    if (count && cellWidth < cellFloor) return;
    const mainWidth = scale * (cellWidth + gapX) - gapX, mainHeight = mainWidth / DEFAULT_RATIO;
    // 主窗明显大于副窗：跨度下限 2 即主窗宽度至少两格。
    if (count && mainWidth < 2 * cellWidth - 1e-9) return;
    const containerW = mainWidth + sideCols * (cellWidth + gapX);
    const topHeight = Math.max(mainHeight, sideRows ? sideRows * cellHeight + (sideRows - 1) * gapY : 0);
    const containerH = topHeight + bottomRows * (cellHeight + gapY);
    const bottomCols = Math.floor((containerW + gapX + 1e-7) / (cellWidth + gapX));
    if (sideCount > sideCols * sideRows || (sideCols && sideCount < sideCols) || (bottomCount && (!bottomRows || bottomCount > bottomCols * bottomRows))) return;
    const offsetX = (width - containerW) / 2, offsetY = (height - containerH) / 2;
    const main = { x: offsetX + leftCols * (cellWidth + gapX), y: offsetY, width: mainWidth, height: mainHeight };
    const slots = [];
    const columns = [];
    for (let column = 0; column < leftCols; column++) columns.push({ x: offsetX + column * (cellWidth + gapX), region: "left" });
    for (let column = 0; column < rightCols; column++) columns.push({ x: main.x + mainWidth + gapX + column * (cellWidth + gapX), region: "right" });
    for (const [columnIndex, column] of columns.entries()) {
      const inColumn = Math.floor(sideCount / sideCols) + (columnIndex < sideCount % sideCols ? 1 : 0);
      for (let row = 0; row < inColumn; row++) slots.push({ x: column.x, y: offsetY + row * (cellHeight + gapY), region: column.region });
    }
    let remaining = bottomCount;
    for (let row = 0; row < bottomRows; row++) {
      const inRow = Math.min(bottomCols, Math.ceil(remaining / (bottomRows - row)));
      if (!inRow) return;
      const rowWidth = inRow * cellWidth + (inRow - 1) * gapX;
      const startX = offsetX + (position === "center" ? (containerW - rowWidth) / 2 : 0);
      for (let column = 0; column < inRow; column++) slots.push({ x: startX + column * (cellWidth + gapX), y: offsetY + topHeight + gapY + row * (cellHeight + gapY), region: "bottom" });
      remaining -= inRow;
    }
    if (slots.length !== count) return;
    const mainVideo = fitVideo(mainWidth, mainHeight, mainRatio);
    // 主窗显著大于副窗：视频面积至少 1.5 倍。不再用「占视口 20%」门槛——
    // 窄高墙（350×1000 配 16 房）下该门槛数学上不可达，会把所有候选拒掉而返回 null。
    if (count && areaOf(mainVideo) < cellWidth * cellHeight * 1.5) return;
    let videoArea = areaOf(mainVideo);
    for (let index = 0; index < count; index++) videoArea += areaOf(fitVideo(cellWidth, cellHeight, secondaryRatios[index]));
    const score = videoArea / viewportArea;
    const signature = ["E",position,leftCols,rightCols,sideRows,bottomRows,sideCount,count].join(":");
    const candidate = { signature,position,scale,main,mainVideo,cell:{width:cellWidth,height:cellHeight},slots,containerW,containerH,offsetX,offsetY,score };
    if (!best || score > best.score + 1e-8 || (Math.abs(score - best.score) < 1e-8 && cellWidth > best.cell.width)) best = candidate;
    if (signature === previous && (!stable || score > stable.score)) stable = candidate;
  };
  if (!count) handleCandidate(0,0,0,0,0,1,"center");
  const viewportRatio = width / height / DEFAULT_RATIO;
  for (const position of ["left","center"].includes(anchor) ? [anchor] : ["left","center"]) {
    for (let sideCols = 0; sideCols <= Math.min(4,count); sideCols++) {
      if (position === "center" && sideCols % 2) continue;
      const leftCols = position === "center" ? sideCols / 2 : 0;
      const rightCols = sideCols - leftCols;
      for (let sideCount = sideCols; sideCount <= count; sideCount++) {
        if (!sideCols && sideCount) continue;
        const bottomCount = count - sideCount;
        for (let bottomRows = bottomCount ? 1 : 0; bottomRows <= Math.min(5,bottomCount); bottomRows++) {
          const firstSideRows = sideCols ? Math.ceil(sideCount / sideCols) : 0;
          const lastSideRows = sideCols ? Math.min(count,firstSideRows + 1) : 0;
          for (let sideRows = firstSideRows; sideRows <= lastSideRows; sideRows++) {
            const scales = new Set([2,sideRows]);
            for (let scale = 2; scale <= scaleMax; scale += 0.5) scales.add(scale);
            // 宽高限制相交处，以及底行恰好装满的位置，都是重要候选。
            if (Math.abs(viewportRatio - 1) > 1e-7) scales.add((sideCols - viewportRatio * bottomRows) / (viewportRatio - 1));
            scales.add(viewportRatio * (sideRows + bottomRows) - sideCols);
            if (bottomCount) scales.add(Math.ceil(bottomCount / bottomRows) - sideCols);
            for (const scale of scales) if (Number.isFinite(scale) && scale >= 2 && scale <= scaleMax) handleCandidate(leftCols,rightCols,sideRows,bottomRows,sideCount,scale,position);
          }
        }
      }
    }
  }
  if (!best) return null;
  if (stable && stable.score >= best.score * 0.995) best = stable;
  const placements = best.slots.map((slot,index) => {
    const video = fitVideo(best.cell.width,best.cell.height,secondaryRatios[index]);
    return { ...slot,index,...best.cell,video,visible:areaOf(video)/areaOf(best.cell),ratio:ratioOf(secondaryRatios[index]) };
  });
  const occupiedArea = areaOf(best.main) + count * areaOf(best.cell);
  const quality = Math.min(1,best.mainVideo.width/640,best.mainVideo.height/360);
  return {
    family:"E",absolute:true,signature:best.signature,position:best.position,main:best.main,mainVideo:best.mainVideo,mainArea:areaOf(best.main),placements,cell:count?best.cell:null,
    leftCount:placements.filter(room=>room.region==="left").length,rightCount:placements.filter(room=>room.region==="right").length,bottomCount:placements.filter(room=>room.region==="bottom").length,
    gap:gapX,gapX,gapY,containerW:best.containerW,containerH:best.containerH,offsetX:best.offsetX,offsetY:best.offsetY,
    viewportFillRatio:occupiedArea/viewportArea,videoViewportFillRatio:best.score,layoutFillRatio:occupiedArea/(best.containerW*best.containerH),unusedAreaRatio:1-occupiedArea/viewportArea,
    mainVisible:areaOf(best.mainVideo)/areaOf(best.main),meanVisible:count?placements.reduce((sum,room)=>sum+room.visible,0)/count:1,
    dominant:true,quality,constrained:quality<0.98,overflow:false
  };
};
