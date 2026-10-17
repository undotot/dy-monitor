/**
 * 等大小窗拼接：先求完整矩形，再整体等比放大。
 * 小窗宽高为 r×1；主窗为 u×v；左右列和底部行必须用同一单元填满。
 * @typedef {{ id: string, ratio: number }} RoomInput
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 */
const DEFAULT_RATIO = 16 / 9;
export const DEFAULT_FOCUS_MAIN_WEIGHT = 6;
const MAIN_DOMINANCE = 2;
// 在最多让出 15 个百分点覆盖率的候选中，给完整 L/U 型和合理主窗倍数选择空间。
const COVERAGE_ALLOWANCE = 0.15;
const EPSILON = 1e-9;
// 主副面积偏离目标一倍，需约 12 个百分点覆盖率收益才值得接受。
const COVERAGE_SIZE_PENALTY = 0.12;
const areaOf = (rect) => rect.width * rect.height;
const ratioOf = (value) => Number.isFinite(value) && value > 0 ? value : DEFAULT_RATIO;
const nearlyEqual = (a, b) => Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
// 混合比例副窗的公共格子比例取出现次数最多者；并列时优先 16:9，减少黑边面积。
const dominantRatio = (rooms, fallback) => {
  if (!rooms.length) return ratioOf(fallback);
  const counts = new Map();
  for (const room of rooms) {
    const key = room.ratio.toFixed(6);
    const entry = counts.get(key) || { ratio: room.ratio, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  let best = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count
      || (entry.count === best.count && nearlyEqual(entry.ratio, DEFAULT_RATIO) && !nearlyEqual(best.ratio, DEFAULT_RATIO))) best = entry;
  }
  return best?.ratio ?? ratioOf(fallback);
};
const positiveInteger = (value) => Math.round(value) >= 1 && nearlyEqual(value, Math.round(value));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** 倍数指面积；默认 4 倍面积等于同源比例下宽高各 2 倍。 */
export const getMainSizePreference = (mainWeight = 4) => {
  const target = Number.isFinite(mainWeight) ? clamp(mainWeight, 1.5, 12) : 4;
  return { target, min: Math.max(MAIN_DOMINANCE, target / 2), max: target * 2.25 };
};

/** 综合均衡适度扩大主窗范围；默认 6 倍面积，最多 16 倍，避免回到极大主窗。 */
export const getCoverageSizePreference = (mainWeight = DEFAULT_FOCUS_MAIN_WEIGHT) => {
  const preference = getMainSizePreference(mainWeight);
  return { ...preference, max: preference.target * (8 / 3) };
};

export const coverageSizeBalanceScore = (coverage, areaRatio, mainWeight = DEFAULT_FOCUS_MAIN_WEIGHT) =>
  coverage - COVERAGE_SIZE_PENALTY * Math.abs(Math.log2((areaRatio ?? mainWeight) / mainWeight));

// 无范围内解时仍返回最接近目标的真实组合，供手动查看或全局判断是否需要网格回退。
export const preferMainSizeRange = (choices, { target, min, max }, getAreaRatio) => {
  if (!choices.length) return [];
  const moderate = choices.filter((candidate) => getAreaRatio(candidate) >= min - EPSILON && getAreaRatio(candidate) <= max + EPSILON);
  if (moderate.length) return moderate;
  const error = (candidate) => Math.abs(Math.log(getAreaRatio(candidate) / target));
  const closest = Math.min(...choices.map(error));
  return choices.filter((candidate) => error(candidate) <= closest + EPSILON);
};

export const preferModerateMainSize = (choices, mainWeight, getAreaRatio) =>
  preferMainSizeRange(choices, getMainSizePreference(mainWeight), getAreaRatio);

/** 只有整体矩形使用 contain，视频本身直接填满与源比例相同的画格。 */
export const containVideo = (rect, ratio) => {
  const width = Math.min(rect.width, rect.height * ratioOf(ratio));
  const height = width / ratioOf(ratio);
  return { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height };
};

/** 从最终视频几何计算覆盖率与副窗一致性，不能仅相信方案声明。 */
export const measureLayoutGeometry = ({ width, height, bounds, rects, mainWeight = 4 }) => {
  const area = width * height;
  const contentArea = areaOf(bounds);
  const main = rects.find((rect) => rect.role === "main");
  const small = rects.filter((rect) => rect.role === "secondary");
  const videoArea = rects.reduce((sum, rect) => sum + areaOf(rect.video), 0);
  const epsilon = Math.max(width, height) * 1e-7;
  const secondarySizes = [];
  for (const rect of small) {
    const group = secondarySizes.find((size) => Math.abs(size.width - rect.width) < epsilon && Math.abs(size.height - rect.height) < epsilon);
    if (group) group.count++;
    else secondarySizes.push({ width: rect.width, height: rect.height, count: 1 });
  }
  secondarySizes.sort((a, b) => areaOf(b) - areaOf(a));
  const largestSmall = Math.max(0, ...small.map(areaOf));
  const smallArea = small.reduce((sum, rect) => sum + areaOf(rect), 0);
  const mainToAverageVideo = smallArea ? areaOf(main) / (smallArea / small.length) : null;
  const marginAxis = width - bounds.width > epsilon ? "left-right" : height - bounds.height > epsilon ? "top-bottom" : "none";
  return {
    boxCoverage: rects.reduce((sum, rect) => sum + areaOf(rect), 0) / area, videoCoverage: videoArea / area,
    letterboxRatio: 0, emptyRatio: 0, gapRatio: 0,
    unoccupiedRatio: Math.max(0, 1 - videoArea / area), outerMarginRatio: Math.max(0, 1 - contentArea / area), marginAxis,
    contentFillRatio: videoArea / contentArea, contentRatio: bounds.width / bounds.height,
    mainShare: areaOf(main) / contentArea, mainVideoShare: areaOf(main) / area,
    mainToLargestVideo: largestSmall ? areaOf(main) / largestSmall : null, mainToAverageVideo,
    targetMainShare: mainWeight / (mainWeight + small.length),
    prominenceLimited: largestSmall > 0 && areaOf(main) < MAIN_DOMINANCE * largestSmall - epsilon,
    secondarySize: secondarySizes.length === 1 ? { width: secondarySizes[0].width, height: secondarySizes[0].height } : null,
    secondarySizes, secondaryEqual: secondarySizes.length <= 1,
    weightLimited: mainToAverageVideo !== null && Math.abs(mainToAverageVideo / mainWeight - 1) > 0.2,
  };
};

/**
 * 枚举完整的右侧/底部单元，以及左右对称的围绕单元。
 * 只有侧栏时 v 必须为整数；只有底栏时 u 必须为整数；两者都有时 u、v 都为整数。
 * 方程：副窗数 = 侧栏列数 × v + 底栏行数 × (u + 侧栏列数)。
 */
const uniformCandidates = (count, mainRatio, smallRatio) => {
  const candidates = new Map();
  const ratioMultiplier = mainRatio / smallRatio;
  const add = (mainColumns, mainRows, sideColumns, bottomRows) => {
    if (![mainColumns, mainRows].every((value) => Number.isFinite(value) && value > 0)) return;
    const placements = [0];
    if (sideColumns >= 2 && sideColumns % 2 === 0) placements.push(sideColumns / 2);
    for (const leftColumns of placements) {
      const key = [mainColumns, mainRows, sideColumns, bottomRows, leftColumns].map((value) => Number(value.toPrecision(12))).join("/");
      const columns = mainColumns + sideColumns;
      const rows = mainRows + bottomRows;
      candidates.set(key, { mainColumns, mainRows, sideColumns, bottomRows, leftColumns,
        columns, rows, ratio: smallRatio * columns / rows, mainArea: mainColumns * mainRows, key });
    }
  };
  if (!count) {
    add(ratioMultiplier, 1, 0, 0);
    return [...candidates.values()];
  }
  for (let divisor = 1; divisor <= count; divisor++) {
    if (count % divisor !== 0) continue;
    const mainRows = count / divisor;
    add(ratioMultiplier * mainRows, mainRows, divisor, 0);
    const mainColumns = divisor;
    add(mainColumns, mainColumns / ratioMultiplier, 0, count / divisor);
  }
  for (let mainRows = 1; mainRows < count; mainRows++) {
    const rawColumns = ratioMultiplier * mainRows;
    if (!positiveInteger(rawColumns)) continue;
    const mainColumns = Math.round(rawColumns);
    for (let sideColumns = 1; sideColumns * mainRows < count; sideColumns++) {
      const bottomCount = count - sideColumns * mainRows;
      const columns = mainColumns + sideColumns;
      if (!positiveInteger(bottomCount / columns)) continue;
      add(mainColumns, mainRows, sideColumns, Math.round(bottomCount / columns));
    }
  }
  return [...candidates.values()];
};

const materialize = (candidate, bounds, main, secondaries, smallRatio) => {
  // 使用同一浮点宽高，不逐窗取整，避免最后一列尺寸不同或累计产生缝隙。
  const smallHeight = bounds.height / candidate.rows;
  const smallWidth = smallHeight * smallRatio;
  const boxFor = (room, role, region, column, row, columns = 1, rows = 1) => {
    const video = { x: bounds.x + column * smallWidth, y: bounds.y + row * smallHeight,
      width: columns * smallWidth, height: rows * smallHeight };
    return { ...video, roomId: room.id, ratio: room.ratio, role, region, video: { ...video } };
  };
  const rects = [boxFor(main, "main", "main", candidate.leftColumns, 0, candidate.mainColumns, candidate.mainRows)];
  let index = 0;
  const addBand = (columns, rows, x, y, region) => {
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      rects.push(boxFor(secondaries[index++], "secondary", region, x + column, y + row));
    }
  };
  addBand(candidate.leftColumns, candidate.mainRows, 0, 0, "left");
  addBand(candidate.sideColumns - candidate.leftColumns, candidate.mainRows,
    candidate.leftColumns + candidate.mainColumns, 0, "right");
  addBand(candidate.bottomRows ? candidate.columns : 0, candidate.bottomRows, 0, candidate.mainRows, "bottom");
  return rects;
};

/**
 * 硬约束：源比例、等大小窗、无格内黑边、无空洞矩形、主窗顶部对齐。
 * 在主窗可突出时保留放大效果；限制覆盖损失后，优先完整 L/U 型和面积偏好。
 * 混合副窗比例返回明确的不可行结果，不能用拉伸/裁切/黑边伪造成功。
 * @param {{width:number,height:number,rooms:RoomInput[],mainRoomId:string,anchor?:string,mainWeight?:number,previous?:object,selection?:string,family?:string,candidateKey?:string}} options
 */
export const calculateRecursiveLayout = ({ width, height, rooms, mainRoomId, anchor = "auto", mainWeight = 4, previous = null, selection = "balanced", family = "auto", candidateKey = null, containSecondary = false }) => {
  if (![width, height].every((value) => Number.isFinite(value) && value > 0)) return null;
  if (!Array.isArray(rooms) || rooms.length < 1 || rooms.length > 16 || rooms.some((room) => !room || !["string", "number"].includes(typeof room.id) || !String(room.id).trim())) return null;
  const normalized = rooms.map((room) => ({ id: String(room.id), ratio: ratioOf(room.ratio) }));
  if (new Set(normalized.map((room) => room.id)).size !== normalized.length) return null;
  const main = normalized.find((room) => room.id === String(mainRoomId));
  if (!main) return null;
  const secondaries = normalized.filter((room) => room !== main);
  const rawSmallRatio = secondaries[0]?.ratio ?? main.ratio;
  const mixedSecondaries = secondaries.some((room) => !nearlyEqual(room.ratio / rawSmallRatio, 1));
  const useContain = containSecondary === true && mixedSecondaries;
  const smallRatio = useContain ? dominantRatio(secondaries, main.ratio) : rawSmallRatio;
  if (mixedSecondaries && !useContain) {
    return { status: "infeasible", code: "SECONDARY_RATIO_MISMATCH", width, height, rects: [],
      reason: "副窗源比例不同，无法同时满足等宽等高、保持源比例和无内部黑边。请将副窗统一为同一源比例。" };
  }
  // 保留用户指定的主窗：混合比例副窗共用出现最多的格子比例，实际视频按 contain 在黑边内显示。
  const layoutSecondaries = useContain
    ? secondaries.map((room) => ({ ...room, ratio: smallRatio }))
    : secondaries;
  if (selection === "equal-grid" && !nearlyEqual(main.ratio / smallRatio, 1)) {
    return { status: "infeasible", code: "GRID_RATIO_MISMATCH", width, height, rects: [],
      reason: "主副窗源比例不同，无法在保持源比例和无格内黑边的同时改为全等大网格。" };
  }
  const requestedAnchor = ["top-left", "top-center"].includes(anchor) ? anchor : "auto";
  const weight = Number.isFinite(mainWeight) ? clamp(mainWeight, 1.5, 12) : 4;
  const candidates = uniformCandidates(secondaries.length, main.ratio, smallRatio);
  const viewportRatio = width / height;
  const coverageOf = (candidate) => Math.min(candidate.ratio / viewportRatio, viewportRatio / candidate.ratio);
  const distributionError = (candidate) => Math.abs(Math.log(candidate.mainArea / weight));
  const trackingCache = new Map();
  const trackingCost = (candidate) => {
    if (trackingCache.has(candidate)) return trackingCache.get(candidate);
    const boxes = materialize(candidate, containVideo({ x: 0, y: 0, width, height }, candidate.ratio), main, layoutSecondaries, smallRatio);
    const focus = boxes[0];
    const cost = boxes.slice(1).reduce((sum, rect) => sum + Math.hypot(rect.x + rect.width / 2 - focus.x - focus.width / 2,
      rect.y + rect.height / 2 - focus.y - focus.height / 2) / Math.min(width, height), 0);
    trackingCache.set(candidate, cost);
    return cost;
  };
  const better = (a, b) => {
    const coverageDelta = coverageOf(a) - coverageOf(b);
    if (Math.abs(coverageDelta) > EPSILON) return coverageDelta > 0;
    const marginDepth = (candidate) => (candidate.ratio > viewportRatio ? height : width) * (1 - coverageOf(candidate)) / 2;
    const marginDelta = marginDepth(a) - marginDepth(b);
    if (Math.abs(marginDelta) > Math.max(width, height) * EPSILON) return marginDelta < 0;
    const errorDelta = distributionError(a) - distributionError(b);
    if (Math.abs(errorDelta) > EPSILON) return errorDelta < 0;
    const trackingDelta = trackingCost(a) - trackingCost(b);
    if (Math.abs(trackingDelta) > EPSILON) return trackingDelta < 0;
    if (a.key === previous?.signature) return true;
    if (b.key === previous?.signature) return false;
    return a.key < b.key;
  };
  const bestOf = (choices) => {
    if (!choices.length) return null;
    if (selection === "equal-grid") {
      const equal = choices.filter((candidate) => nearlyEqual(candidate.mainArea, 1));
      return equal.length ? equal.reduce((best, candidate) => better(candidate, best) ? candidate : best) : null;
    }
    const prominent = choices.filter((candidate) => candidate.mainArea >= MAIN_DOMINANCE - EPSILON);
    const largest = choices.filter((candidate) => candidate.mainArea >= 1 - EPSILON);
    const selectable = prominent.length ? prominent : largest.length ? largest : choices;
    if (selection === "coverage") return selectable.reduce((best, candidate) => better(candidate, best) ? candidate : best);
    if (selection === "size-balanced") return preferModerateMainSize(selectable, weight, (candidate) => candidate.mainArea)
      .reduce((best, candidate) => better(candidate, best) ? candidate : best);
    if (selection === "coverage-size-balanced") {
      const pool = preferMainSizeRange(selectable, getCoverageSizePreference(weight), (candidate) => candidate.mainArea);
      return pool.reduce((best, candidate) => {
        const delta = coverageSizeBalanceScore(coverageOf(candidate), candidate.mainArea, weight)
          - coverageSizeBalanceScore(coverageOf(best), best.mainArea, weight);
        if (Math.abs(delta) > EPSILON) return delta > 0 ? candidate : best;
        return better(candidate, best) ? candidate : best;
      });
    }
    const bestCoverage = Math.max(...selectable.map(coverageOf));
    const coverageFloor = Math.max(bestCoverage - COVERAGE_ALLOWANCE, bestCoverage * 0.8);
    const efficient = selectable.filter((candidate) => coverageOf(candidate) >= coverageFloor - EPSILON);
    // 必须同时有侧栏和底栏，才是真正包住主窗的 L/U 型，单侧条带不能冒充。
    const wrapped = efficient.filter((candidate) => candidate.sideColumns > 0 && candidate.bottomRows > 0);
    const shortlist = wrapped.length ? wrapped : efficient;
    return shortlist.reduce((best, candidate) => {
      const errorDelta = distributionError(candidate) - distributionError(best);
      if (Math.abs(errorDelta) > EPSILON) return errorDelta < 0 ? candidate : best;
      return better(candidate, best) ? candidate : best;
    });
  };
  const familyFilters = {
    right: (candidate) => !candidate.leftColumns && candidate.sideColumns > 0 && !candidate.bottomRows,
    bottom: (candidate) => !candidate.sideColumns && candidate.bottomRows > 0,
    "l-shape": (candidate) => !candidate.leftColumns && candidate.sideColumns > 0 && candidate.bottomRows > 0,
    sides: (candidate) => candidate.leftColumns > 0 && !candidate.bottomRows,
    "u-shape": (candidate) => candidate.leftColumns > 0 && candidate.bottomRows > 0,
  };
  const familyLabels = { right: "右侧列排", bottom: "底部行排", "l-shape": "L 型", sides: "左右分列", "u-shape": "U 型" };
  const familyFilter = familyFilters[family];
  let familyChoices = familyFilter ? candidates.filter(familyFilter) : null;
  // 单房间保留在默认右列方案中；不把相同单窗复制成五种虚假的排列。
  if (family === "right" && !secondaries.length) familyChoices = candidates;
  if (familyChoices) {
    const preserveFocus = candidates.some((candidate) => candidate.mainArea >= MAIN_DOMINANCE - EPSILON);
    if (preserveFocus && secondaries.length) familyChoices = familyChoices.filter((candidate) => candidate.mainArea >= MAIN_DOMINANCE - EPSILON);
    if (!familyChoices.length) return { status: "infeasible", code: "ARRANGEMENT_UNAVAILABLE", width, height, rects: [],
      reason: `${rooms.length} 房在保持源比例、小窗等大、完整矩形和放大主窗的条件下，无法组成${familyLabels[family]}。请选择其他排列。` };
  }
  const choices = familyChoices ?? candidates.filter((candidate) => requestedAnchor === "top-center" ? candidate.leftColumns * 2 === candidate.sideColumns : !candidate.leftColumns);
  let chosen = candidateKey ? choices.find((candidate) => candidate.key === candidateKey) : bestOf(choices);
  if (candidateKey && !chosen) return { status: "infeasible", code: "CANDIDATE_UNAVAILABLE", width, height, rects: [], reason: "当前房间数或源比例已无法组成所选行列组合，请选择其他候选。" };
  if (!chosen) return null;
  let resolvedAnchor = familyChoices ? chosen.leftColumns > 0 ? "top-surround" : "top-left" : requestedAnchor === "top-center" ? "top-center" : "top-left";
  let autoReason = "按当前画墙尺寸，在覆盖率与主副窗面积之间选择合适方案。";
  if (requestedAnchor === "auto" && !familyChoices && !candidateKey && selection !== "equal-grid") {
    const surrounding = candidates.filter((candidate) => candidate.leftColumns > 0 && candidate.mainArea >= MAIN_DOMINANCE - EPSILON);
    const alternative = bestOf(surrounding);
    if (alternative) {
      const coverageGain = coverageOf(alternative) - coverageOf(chosen);
      const trackingGain = trackingCost(chosen) - trackingCost(alternative);
      const allocationGain = distributionError(chosen) - distributionError(alternative);
      if (coverageGain > 0.015 || (coverageGain >= -0.002 && (allocationGain > 0.03 || trackingGain > 0.35))) {
        chosen = alternative;
        resolvedAnchor = "top-surround";
        autoReason = coverageGain > 0.015 ? "当前画墙下，顶部居中并在左右、底部使用等大小窗能减少外围留白。" : "当前画墙下，顶部居中并将等大小窗分配到两侧能缩短巡视距离，保持矩形完整。";
      }
    }
  }
  const hasSides = chosen.sideColumns > 0;
  const hasBottom = chosen.bottomRows > 0;
  const layoutShape = selection === "equal-grid" ? "equal-grid" : !secondaries.length ? "single" : chosen.leftColumns > 0
    ? hasBottom ? "u-shape" : "side-surround"
    : hasSides && hasBottom ? "l-shape" : hasSides ? "right-strip" : "bottom-strip";
  const shapeLabels = { single: "单窗", "equal-grid": "等大网格", "l-shape": "L 型 · 左上", "u-shape": "U 型 · 居中",
    "side-surround": "两侧 · 居中", "right-strip": "右侧列排", "bottom-strip": "底部横排" };
  const lCandidates = candidates.filter((candidate) => !candidate.leftColumns && candidate.sideColumns > 0 && candidate.bottomRows > 0);
  const lShapeAvailable = lCandidates.some((candidate) => candidate.mainArea >= MAIN_DOMINANCE - EPSILON);
  const shapeConstraintNote = secondaries.length < 2 || lShapeAvailable ? "" : lCandidates.length
    ? "当前数量的 L 型只能让主副窗等大；保留主窗放大时采用条带排列。"
    : `${rooms.length} 房在等大小窗、源比例和完整矩形约束下没有 L 型解，仅缩小主窗仍无法满足。`;
  if (layoutShape === "l-shape") autoReason = "适当收紧主窗，等大小窗同时分布在右侧和底部，形成完整 L 型；外围留白仅保留一组。";
  if (layoutShape === "u-shape") autoReason = "主窗顶部居中，等大小窗分布在左右及底部，形成完整 U 型。";
  if (family === "right" && secondaries.length) autoReason = `主窗左上，等大小窗在右侧排列为 ${chosen.sideColumns} 列 × ${chosen.mainRows} 行，拼成完整矩形。`;
  if (family === "bottom") autoReason = `主窗左上，等大小窗在底部排列为 ${chosen.columns} 列 × ${chosen.bottomRows} 行，拼成完整矩形。`;
  if (family === "sides") autoReason = `主窗顶部居中，左右各 ${chosen.leftColumns} 列等大小窗，拼成完整矩形。`;
  if (selection === "equal-grid") autoReason = `所有窗口等大，${chosen.columns} 列 × ${chosen.rows} 行；当前主房间保留标记，画面尺寸一致。`;
  const bounds = containVideo({ x: 0, y: 0, width, height }, chosen.ratio);
  const rects = materialize(chosen, bounds, main, layoutSecondaries, smallRatio);
  const metrics = { ...measureLayoutGeometry({ width, height, bounds, rects, mainWeight: weight }), coverageAllowance: ["coverage", "size-balanced", "coverage-size-balanced", "equal-grid"].includes(selection) ? 0 : COVERAGE_ALLOWANCE };
  const positionLabel = shapeLabels[layoutShape];
  return { status: "ready", width, height, bounds, anchor: resolvedAnchor, requestedAnchor, family, autoReason, containSecondary: useContain, secondaryRatio: smallRatio,
    positionLabel, layoutShape, lShapeAvailable, shapeConstraintNote, rects, signature: chosen.key, metrics, candidateCount: candidates.length, gap: 0,
    grid: selection === "equal-grid" ? { columns: chosen.columns, rows: chosen.rows } : null,
    units: { mainColumns: chosen.mainColumns, mainRows: chosen.mainRows, sideColumns: chosen.sideColumns,
      bottomRows: chosen.bottomRows, leftColumns: chosen.leftColumns, columns: chosen.columns, rows: chosen.rows } };
};

/** 暴露有效的全部行列组合，使用与单方案完全相同的校验和坐标生成路径。 */
export const enumerateRecursiveLayouts = (options) => {
  const validation = calculateRecursiveLayout({ ...options, family: "auto", anchor: "top-left", selection: "coverage", candidateKey: null });
  if (!validation) return null;
  if (validation.status !== "ready") return { ...validation, candidates: [] };
  const main = validation.rects.find((rect) => rect.role === "main");
  const secondary = validation.rects.find((rect) => rect.role === "secondary");
  const raw = uniformCandidates(options.rooms.length - 1, main.ratio, secondary?.ratio ?? main.ratio);
  const preserveFocus = secondary && raw.some((candidate) => candidate.mainArea >= MAIN_DOMINANCE - EPSILON);
  const candidates = raw.filter((candidate) => !preserveFocus || candidate.mainArea >= MAIN_DOMINANCE - EPSILON).map((candidate) => {
    const family = candidate.leftColumns > 0 ? candidate.bottomRows > 0 ? "u-shape" : "sides"
      : candidate.sideColumns > 0 ? candidate.bottomRows > 0 ? "l-shape" : "right" : candidate.bottomRows > 0 ? "bottom" : "right";
    const plan = calculateRecursiveLayout({ ...options, family, anchor: "auto", selection: "coverage", candidateKey: candidate.key });
    if (plan?.status !== "ready") throw new Error("枚举的行列组合未能生成有效坐标。");
    return plan;
  });
  return { status: "ready", width: options.width, height: options.height, candidates };
};

/** 从最终几何审计等大小窗、源比例、完整矩形、外围单轴留白与主窗锚点。 */
export const auditRecursiveLayout = (plan, expectedCount) => {
  if (!plan || plan.status === "infeasible") return { valid: false, errors: [plan?.reason ?? "没有可行方案"] };
  const errors = [];
  const epsilon = Math.max(plan.width, plan.height) * 1e-7;
  const bounds = plan.bounds;
  if (plan.rects.length !== expectedCount || new Set(plan.rects.map((rect) => rect.roomId)).size !== expectedCount) errors.push("房间数量或身份不一致");
  const secondary = plan.rects.find((rect) => rect.role === "secondary");
  for (const [index, rect] of plan.rects.entries()) {
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) errors.push(`${rect.roomId} 尺寸无效`);
    if (rect.x < bounds.x - epsilon || rect.y < bounds.y - epsilon || rect.x + rect.width > bounds.x + bounds.width + epsilon || rect.y + rect.height > bounds.y + bounds.height + epsilon) errors.push(`${rect.roomId} 越过整体矩形`);
    if (Math.abs(rect.width / rect.height / rect.ratio - 1) > 1e-7) errors.push(`${rect.roomId} 画格未保持源比例`);
    if (["x", "y", "width", "height"].some((property) => Math.abs(rect.video[property] - rect[property]) > epsilon)) errors.push(`${rect.roomId} 出现格内黑边`);
    if (rect.role === "secondary" && (Math.abs(rect.width - secondary.width) > epsilon || Math.abs(rect.height - secondary.height) > epsilon)) errors.push(`${rect.roomId} 副窗宽高不一致`);
    for (const other of plan.rects.slice(index + 1)) if (Math.min(rect.x + rect.width, other.x + other.width) - Math.max(rect.x, other.x) > epsilon && Math.min(rect.y + rect.height, other.y + other.height) - Math.max(rect.y, other.y) > epsilon) errors.push(`${rect.roomId} 与 ${other.roomId} 重叠`);
  }
  const totalArea = plan.rects.reduce((sum, rect) => sum + areaOf(rect), 0);
  if (Math.abs(totalArea / areaOf(bounds) - 1) > 1e-7) errors.push("整体矩形内部存在空洞");
  if (bounds.x < -epsilon || bounds.y < -epsilon || bounds.x + bounds.width > plan.width + epsilon || bounds.y + bounds.height > plan.height + epsilon) errors.push("整体矩形越过画墙");
  if (Math.abs(bounds.x + bounds.width / 2 - plan.width / 2) > epsilon || Math.abs(bounds.y + bounds.height / 2 - plan.height / 2) > epsilon) errors.push("外围留白未对称");
  if (Math.abs(bounds.width - plan.width) > epsilon && Math.abs(bounds.height - plan.height) > epsilon) errors.push("外围同时在两条轴留白");
  const main = plan.rects.find((rect) => rect.role === "main");
  if (!main || Math.abs(main.y - bounds.y) > epsilon || (plan.anchor === "top-left" && Math.abs(main.x - bounds.x) > epsilon) || (["top-center", "top-surround"].includes(plan.anchor) && Math.abs(main.x + main.width / 2 - bounds.x - bounds.width / 2) > epsilon)) errors.push("主窗相对整体矩形的锚点错误");
  if (plan.anchor === "top-surround" && (!plan.rects.some((rect) => rect.region === "left") || !plan.rects.some((rect) => rect.region === "right"))) errors.push("围绕布局缺少一侧副窗");
  if (plan.layoutShape === "l-shape" && (plan.anchor !== "top-left" || plan.rects.some((rect) => rect.region === "left") || !plan.rects.some((rect) => rect.region === "right") || !plan.rects.some((rect) => rect.region === "bottom"))) errors.push("L 型必须同时具备右侧与底部副窗");
  if (plan.layoutShape === "u-shape" && ["left", "right", "bottom"].some((region) => !plan.rects.some((rect) => rect.region === region))) errors.push("U 型必须同时具备左右及底部副窗");
  return { valid: errors.length === 0, errors };
};
