(() => {
  // src/core/focus-layout-geometry.js
  var DEFAULT_RATIO = 16 / 9;
  var DEFAULT_FOCUS_MAIN_WEIGHT = 6;
  var MAIN_DOMINANCE = 2;
  var COVERAGE_ALLOWANCE = 0.15;
  var EPSILON = 1e-9;
  var COVERAGE_SIZE_PENALTY = 0.12;
  var areaOf = (rect) => rect.width * rect.height;
  var ratioOf = (value) => Number.isFinite(value) && value > 0 ? value : DEFAULT_RATIO;
  var nearlyEqual = (a, b) => Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
  var positiveInteger = (value) => Math.round(value) >= 1 && nearlyEqual(value, Math.round(value));
  var clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  var getMainSizePreference = (mainWeight = 4) => {
    const target = Number.isFinite(mainWeight) ? clamp(mainWeight, 1.5, 12) : 4;
    return { target, min: Math.max(MAIN_DOMINANCE, target / 2), max: target * 2.25 };
  };
  var getCoverageSizePreference = (mainWeight = DEFAULT_FOCUS_MAIN_WEIGHT) => {
    const preference = getMainSizePreference(mainWeight);
    return { ...preference, max: preference.target * (8 / 3) };
  };
  var coverageSizeBalanceScore = (coverage, areaRatio, mainWeight = DEFAULT_FOCUS_MAIN_WEIGHT) => coverage - COVERAGE_SIZE_PENALTY * Math.abs(Math.log2((areaRatio ?? mainWeight) / mainWeight));
  var preferMainSizeRange = (choices, { target, min, max }, getAreaRatio) => {
    if (!choices.length) return [];
    const moderate = choices.filter((candidate) => getAreaRatio(candidate) >= min - EPSILON && getAreaRatio(candidate) <= max + EPSILON);
    if (moderate.length) return moderate;
    const error = (candidate) => Math.abs(Math.log(getAreaRatio(candidate) / target));
    const closest = Math.min(...choices.map(error));
    return choices.filter((candidate) => error(candidate) <= closest + EPSILON);
  };
  var preferModerateMainSize = (choices, mainWeight, getAreaRatio) => preferMainSizeRange(choices, getMainSizePreference(mainWeight), getAreaRatio);
  var containVideo = (rect, ratio) => {
    const width = Math.min(rect.width, rect.height * ratioOf(ratio));
    const height = width / ratioOf(ratio);
    return { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height };
  };
  var measureLayoutGeometry = ({ width, height, bounds, rects, mainWeight = 4 }) => {
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
      boxCoverage: rects.reduce((sum, rect) => sum + areaOf(rect), 0) / area,
      videoCoverage: videoArea / area,
      letterboxRatio: 0,
      emptyRatio: 0,
      gapRatio: 0,
      unoccupiedRatio: Math.max(0, 1 - videoArea / area),
      outerMarginRatio: Math.max(0, 1 - contentArea / area),
      marginAxis,
      contentFillRatio: videoArea / contentArea,
      contentRatio: bounds.width / bounds.height,
      mainShare: areaOf(main) / contentArea,
      mainVideoShare: areaOf(main) / area,
      mainToLargestVideo: largestSmall ? areaOf(main) / largestSmall : null,
      mainToAverageVideo,
      targetMainShare: mainWeight / (mainWeight + small.length),
      prominenceLimited: largestSmall > 0 && areaOf(main) < MAIN_DOMINANCE * largestSmall - epsilon,
      secondarySize: secondarySizes.length === 1 ? { width: secondarySizes[0].width, height: secondarySizes[0].height } : null,
      secondarySizes,
      secondaryEqual: secondarySizes.length <= 1,
      weightLimited: mainToAverageVideo !== null && Math.abs(mainToAverageVideo / mainWeight - 1) > 0.2
    };
  };
  var uniformCandidates = (count, mainRatio, smallRatio) => {
    const candidates = /* @__PURE__ */ new Map();
    const ratioMultiplier = mainRatio / smallRatio;
    const add = (mainColumns, mainRows, sideColumns, bottomRows) => {
      if (![mainColumns, mainRows].every((value) => Number.isFinite(value) && value > 0)) return;
      const placements = [0];
      if (sideColumns >= 2 && sideColumns % 2 === 0) placements.push(sideColumns / 2);
      for (const leftColumns of placements) {
        const key = [mainColumns, mainRows, sideColumns, bottomRows, leftColumns].map((value) => Number(value.toPrecision(12))).join("/");
        const columns = mainColumns + sideColumns;
        const rows = mainRows + bottomRows;
        candidates.set(key, {
          mainColumns,
          mainRows,
          sideColumns,
          bottomRows,
          leftColumns,
          columns,
          rows,
          ratio: smallRatio * columns / rows,
          mainArea: mainColumns * mainRows,
          key
        });
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
  var materialize = (candidate, bounds, main, secondaries, smallRatio) => {
    const smallHeight = bounds.height / candidate.rows;
    const smallWidth = smallHeight * smallRatio;
    const boxFor = (room, role, region, column, row, columns = 1, rows = 1) => {
      const video = {
        x: bounds.x + column * smallWidth,
        y: bounds.y + row * smallHeight,
        width: columns * smallWidth,
        height: rows * smallHeight
      };
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
    addBand(
      candidate.sideColumns - candidate.leftColumns,
      candidate.mainRows,
      candidate.leftColumns + candidate.mainColumns,
      0,
      "right"
    );
    addBand(candidate.bottomRows ? candidate.columns : 0, candidate.bottomRows, 0, candidate.mainRows, "bottom");
    return rects;
  };
  var calculateRecursiveLayout = ({ width, height, rooms, mainRoomId, anchor = "auto", mainWeight = 4, previous = null, selection = "balanced", family = "auto", candidateKey = null }) => {
    if (![width, height].every((value) => Number.isFinite(value) && value > 0)) return null;
    if (!Array.isArray(rooms) || rooms.length < 1 || rooms.length > 16 || rooms.some((room) => !room || !["string", "number"].includes(typeof room.id) || !String(room.id).trim())) return null;
    const normalized = rooms.map((room) => ({ id: String(room.id), ratio: ratioOf(room.ratio) }));
    if (new Set(normalized.map((room) => room.id)).size !== normalized.length) return null;
    const main = normalized.find((room) => room.id === String(mainRoomId));
    if (!main) return null;
    const secondaries = normalized.filter((room) => room !== main);
    const smallRatio = secondaries[0]?.ratio ?? main.ratio;
    if (secondaries.some((room) => !nearlyEqual(room.ratio / smallRatio, 1))) {
      return {
        status: "infeasible",
        code: "SECONDARY_RATIO_MISMATCH",
        width,
        height,
        rects: [],
        reason: "副窗源比例不同，无法同时满足等宽等高、保持源比例和无内部黑边。请将副窗统一为同一源比例。"
      };
    }
    if (selection === "equal-grid" && !nearlyEqual(main.ratio / smallRatio, 1)) {
      return {
        status: "infeasible",
        code: "GRID_RATIO_MISMATCH",
        width,
        height,
        rects: [],
        reason: "主副窗源比例不同，无法在保持源比例和无格内黑边的同时改为全等大网格。"
      };
    }
    const requestedAnchor = ["top-left", "top-center"].includes(anchor) ? anchor : "auto";
    const weight = Number.isFinite(mainWeight) ? clamp(mainWeight, 1.5, 12) : 4;
    const candidates = uniformCandidates(secondaries.length, main.ratio, smallRatio);
    const viewportRatio = width / height;
    const coverageOf = (candidate) => Math.min(candidate.ratio / viewportRatio, viewportRatio / candidate.ratio);
    const distributionError = (candidate) => Math.abs(Math.log(candidate.mainArea / weight));
    const trackingCache = /* @__PURE__ */ new Map();
    const trackingCost = (candidate) => {
      if (trackingCache.has(candidate)) return trackingCache.get(candidate);
      const boxes = materialize(candidate, containVideo({ x: 0, y: 0, width, height }, candidate.ratio), main, secondaries, smallRatio);
      const focus = boxes[0];
      const cost = boxes.slice(1).reduce((sum, rect) => sum + Math.hypot(
        rect.x + rect.width / 2 - focus.x - focus.width / 2,
        rect.y + rect.height / 2 - focus.y - focus.height / 2
      ) / Math.min(width, height), 0);
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
    const bestOf = (choices2) => {
      if (!choices2.length) return null;
      if (selection === "equal-grid") {
        const equal = choices2.filter((candidate) => nearlyEqual(candidate.mainArea, 1));
        return equal.length ? equal.reduce((best, candidate) => better(candidate, best) ? candidate : best) : null;
      }
      const prominent = choices2.filter((candidate) => candidate.mainArea >= MAIN_DOMINANCE - EPSILON);
      const largest = choices2.filter((candidate) => candidate.mainArea >= 1 - EPSILON);
      const selectable = prominent.length ? prominent : largest.length ? largest : choices2;
      if (selection === "coverage") return selectable.reduce((best, candidate) => better(candidate, best) ? candidate : best);
      if (selection === "size-balanced") return preferModerateMainSize(selectable, weight, (candidate) => candidate.mainArea).reduce((best, candidate) => better(candidate, best) ? candidate : best);
      if (selection === "coverage-size-balanced") {
        const pool = preferMainSizeRange(selectable, getCoverageSizePreference(weight), (candidate) => candidate.mainArea);
        return pool.reduce((best, candidate) => {
          const delta = coverageSizeBalanceScore(coverageOf(candidate), candidate.mainArea, weight) - coverageSizeBalanceScore(coverageOf(best), best.mainArea, weight);
          if (Math.abs(delta) > EPSILON) return delta > 0 ? candidate : best;
          return better(candidate, best) ? candidate : best;
        });
      }
      const bestCoverage = Math.max(...selectable.map(coverageOf));
      const coverageFloor = Math.max(bestCoverage - COVERAGE_ALLOWANCE, bestCoverage * 0.8);
      const efficient = selectable.filter((candidate) => coverageOf(candidate) >= coverageFloor - EPSILON);
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
      "u-shape": (candidate) => candidate.leftColumns > 0 && candidate.bottomRows > 0
    };
    const familyLabels = { right: "右侧列排", bottom: "底部行排", "l-shape": "L 型", sides: "左右分列", "u-shape": "U 型" };
    const familyFilter = familyFilters[family];
    let familyChoices = familyFilter ? candidates.filter(familyFilter) : null;
    if (family === "right" && !secondaries.length) familyChoices = candidates;
    if (familyChoices) {
      const preserveFocus = candidates.some((candidate) => candidate.mainArea >= MAIN_DOMINANCE - EPSILON);
      if (preserveFocus && secondaries.length) familyChoices = familyChoices.filter((candidate) => candidate.mainArea >= MAIN_DOMINANCE - EPSILON);
      if (!familyChoices.length) return {
        status: "infeasible",
        code: "ARRANGEMENT_UNAVAILABLE",
        width,
        height,
        rects: [],
        reason: `${rooms.length} 房在保持源比例、小窗等大、完整矩形和放大主窗的条件下，无法组成${familyLabels[family]}。请选择其他排列。`
      };
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
        if (coverageGain > 0.015 || coverageGain >= -2e-3 && (allocationGain > 0.03 || trackingGain > 0.35)) {
          chosen = alternative;
          resolvedAnchor = "top-surround";
          autoReason = coverageGain > 0.015 ? "当前画墙下，顶部居中并在左右、底部使用等大小窗能减少外围留白。" : "当前画墙下，顶部居中并将等大小窗分配到两侧能缩短巡视距离，保持矩形完整。";
        }
      }
    }
    const hasSides = chosen.sideColumns > 0;
    const hasBottom = chosen.bottomRows > 0;
    const layoutShape = selection === "equal-grid" ? "equal-grid" : !secondaries.length ? "single" : chosen.leftColumns > 0 ? hasBottom ? "u-shape" : "side-surround" : hasSides && hasBottom ? "l-shape" : hasSides ? "right-strip" : "bottom-strip";
    const shapeLabels = {
      single: "单窗",
      "equal-grid": "等大网格",
      "l-shape": "L 型 · 左上",
      "u-shape": "U 型 · 居中",
      "side-surround": "两侧 · 居中",
      "right-strip": "右侧列排",
      "bottom-strip": "底部横排"
    };
    const lCandidates = candidates.filter((candidate) => !candidate.leftColumns && candidate.sideColumns > 0 && candidate.bottomRows > 0);
    const lShapeAvailable = lCandidates.some((candidate) => candidate.mainArea >= MAIN_DOMINANCE - EPSILON);
    const shapeConstraintNote = secondaries.length < 2 || lShapeAvailable ? "" : lCandidates.length ? "当前数量的 L 型只能让主副窗等大；保留主窗放大时采用条带排列。" : `${rooms.length} 房在等大小窗、源比例和完整矩形约束下没有 L 型解，仅缩小主窗仍无法满足。`;
    if (layoutShape === "l-shape") autoReason = "适当收紧主窗，等大小窗同时分布在右侧和底部，形成完整 L 型；外围留白仅保留一组。";
    if (layoutShape === "u-shape") autoReason = "主窗顶部居中，等大小窗分布在左右及底部，形成完整 U 型。";
    if (family === "right" && secondaries.length) autoReason = `主窗左上，等大小窗在右侧排列为 ${chosen.sideColumns} 列 × ${chosen.mainRows} 行，拼成完整矩形。`;
    if (family === "bottom") autoReason = `主窗左上，等大小窗在底部排列为 ${chosen.columns} 列 × ${chosen.bottomRows} 行，拼成完整矩形。`;
    if (family === "sides") autoReason = `主窗顶部居中，左右各 ${chosen.leftColumns} 列等大小窗，拼成完整矩形。`;
    if (selection === "equal-grid") autoReason = `所有窗口等大，${chosen.columns} 列 × ${chosen.rows} 行；当前主房间保留标记，画面尺寸一致。`;
    const bounds = containVideo({ x: 0, y: 0, width, height }, chosen.ratio);
    const rects = materialize(chosen, bounds, main, secondaries, smallRatio);
    const metrics = { ...measureLayoutGeometry({ width, height, bounds, rects, mainWeight: weight }), coverageAllowance: ["coverage", "size-balanced", "coverage-size-balanced", "equal-grid"].includes(selection) ? 0 : COVERAGE_ALLOWANCE };
    const positionLabel = shapeLabels[layoutShape];
    return {
      status: "ready",
      width,
      height,
      bounds,
      anchor: resolvedAnchor,
      requestedAnchor,
      family,
      autoReason,
      positionLabel,
      layoutShape,
      lShapeAvailable,
      shapeConstraintNote,
      rects,
      signature: chosen.key,
      metrics,
      candidateCount: candidates.length,
      gap: 0,
      grid: selection === "equal-grid" ? { columns: chosen.columns, rows: chosen.rows } : null,
      units: {
        mainColumns: chosen.mainColumns,
        mainRows: chosen.mainRows,
        sideColumns: chosen.sideColumns,
        bottomRows: chosen.bottomRows,
        leftColumns: chosen.leftColumns,
        columns: chosen.columns,
        rows: chosen.rows
      }
    };
  };
  var auditRecursiveLayout = (plan, expectedCount) => {
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
    if (!main || Math.abs(main.y - bounds.y) > epsilon || plan.anchor === "top-left" && Math.abs(main.x - bounds.x) > epsilon || ["top-center", "top-surround"].includes(plan.anchor) && Math.abs(main.x + main.width / 2 - bounds.x - bounds.width / 2) > epsilon) errors.push("主窗相对整体矩形的锚点错误");
    if (plan.anchor === "top-surround" && (!plan.rects.some((rect) => rect.region === "left") || !plan.rects.some((rect) => rect.region === "right"))) errors.push("围绕布局缺少一侧副窗");
    if (plan.layoutShape === "l-shape" && (plan.anchor !== "top-left" || plan.rects.some((rect) => rect.region === "left") || !plan.rects.some((rect) => rect.region === "right") || !plan.rects.some((rect) => rect.region === "bottom"))) errors.push("L 型必须同时具备右侧与底部副窗");
    if (plan.layoutShape === "u-shape" && ["left", "right", "bottom"].some((region) => !plan.rects.some((rect) => rect.region === region))) errors.push("U 型必须同时具备左右及底部副窗");
    return { valid: errors.length === 0, errors };
  };

  // src/core/focus-layout-policy.js
  var LAYOUT_VARIANTS = [
    { id: "coverage", letter: "A", title: "右侧列排", family: "right", description: "主窗左上，小窗全部在右侧排成完整列。大小与留白按当前取舍规则选优。" },
    { id: "bottom", letter: "B", title: "底部行排", family: "bottom", description: "主窗左上，小窗全部在底部排成完整行。适合比较横向副窗带的效果。" },
    { id: "balanced", letter: "C", title: "右侧＋底部 L 型", family: "l-shape", description: "主窗左上，小窗同时排列在右侧与底部，所有区域共用同一宽高。" },
    { id: "sides", letter: "D", title: "左右对称分列", family: "sides", description: "主窗水平居中、顶部对齐，小窗等大并分配到左右两侧。" },
    { id: "surround", letter: "E", title: "左右＋底部 U 型", family: "u-shape", description: "主窗水平居中、顶部对齐，小窗等大并填满左右两侧与底部。" }
  ];
  var EPSILON2 = 1e-9;
  var SWITCH_SCORE_GAIN = 0.02;
  var EQUAL_GRID_VARIANT = { id: "grid", letter: "F", title: "全等大网格", family: "grid", description: "当前数量没有适中放大解时，自动改为所有窗口等大；源比例与完整矩形仍保持。" };
  var priorityFor = (options) => ["coverage", "balanced"].includes(options.priority) ? options.priority : "compromise";
  var preferenceFor = (options) => priorityFor(options) === "compromise" ? getCoverageSizePreference(options.mainWeight) : getMainSizePreference(options.mainWeight);
  var calculateManualVariant = (options, variant) => {
    const priority2 = priorityFor(options);
    const sizeRange = preferenceFor(options);
    const selection = priority2 === "coverage" ? "coverage" : priority2 === "balanced" ? "size-balanced" : "coverage-size-balanced";
    const plan = calculateRecursiveLayout({ ...options, mainWeight: sizeRange.target, family: variant.family, selection });
    return plan ? { ...plan, variant, selection: { mode: "manual", priority: priority2, sizeRange } } : null;
  };
  var compareLayoutVariants = (options) => {
    const items = LAYOUT_VARIANTS.map((variant) => calculateManualVariant(options, variant));
    const feasible = items.filter((plan) => plan?.status === "ready");
    const priority2 = priorityFor(options);
    const sizeRange = preferenceFor(options);
    if (priority2 !== "coverage" && feasible.length && feasible.every((plan) => plan.metrics.mainToAverageVideo > sizeRange.max + EPSILON2)) {
      const grid = calculateRecursiveLayout({ ...options, mainWeight: sizeRange.target, anchor: "top-left", family: "auto", selection: "equal-grid" });
      if (grid?.status === "ready") items.push({ ...grid, variant: EQUAL_GRID_VARIANT, selection: { mode: "manual", priority: priority2, sizeRange } });
    }
    return items;
  };
  var hasCompatiblePrevious = (previous, plan) => previous?.status === "ready" && previous.rects.length === plan.rects.length && plan.rects.every((rect) => previous.rects.some((old) => old.roomId === rect.roomId && old.role === rect.role && Math.abs(old.ratio / rect.ratio - 1) <= EPSILON2));
  var trackingDistance = (plan) => {
    const main = plan.rects.find((rect) => rect.role === "main");
    return plan.rects.filter((rect) => rect.role === "secondary").reduce((sum, rect) => sum + Math.hypot(
      rect.x + rect.width / 2 - main.x - main.width / 2,
      rect.y + rect.height / 2 - main.y - main.height / 2
    ) / Math.min(plan.width, plan.height), 0);
  };
  var calculateAutomaticLayout = (options) => {
    const items = compareLayoutVariants(options);
    const feasible = items.filter((plan) => plan?.status === "ready");
    if (!feasible.length) {
      const failure = items.find(Boolean);
      return failure ? { ...failure, selection: { mode: "auto", feasibleCount: 0 } } : null;
    }
    const priority2 = priorityFor(options);
    const sizeRange = preferenceFor(options);
    const weight = sizeRange.target;
    const fallback = feasible.find((plan) => plan.variant.id === "grid");
    const pool = priority2 === "coverage" ? feasible : fallback ? [fallback] : preferMainSizeRange(feasible, sizeRange, (plan) => plan.metrics.mainToAverageVideo ?? weight);
    const bestCoverage = Math.max(...pool.map((plan) => plan.metrics.videoCoverage));
    const score = (plan) => priority2 === "compromise" ? coverageSizeBalanceScore(plan.metrics.videoCoverage, plan.metrics.mainToAverageVideo, weight) : plan.metrics.videoCoverage;
    const bestScore = Math.max(...pool.map(score));
    const scored = pool.filter((plan) => bestScore - score(plan) <= EPSILON2);
    const scoredCoverage = Math.max(...scored.map((plan) => plan.metrics.videoCoverage));
    const best = scored.filter((plan) => scoredCoverage - plan.metrics.videoCoverage <= EPSILON2);
    const weightError = (plan) => Math.abs(Math.log((plan.metrics.mainToAverageVideo ?? weight) / weight));
    const minWeightError = Math.min(...best.map(weightError));
    const preferred = best.filter((plan) => weightError(plan) - minWeightError <= EPSILON2);
    const retained = preferred.find((plan) => plan.variant.id === options.previous?.variant?.id && hasCompatiblePrevious(options.previous, plan));
    let chosen = retained ?? preferred.reduce((current, candidate) => trackingDistance(candidate) < trackingDistance(current) - EPSILON2 ? candidate : current);
    let stabilized = false;
    const previous = options.previous;
    if (priority2 === "compromise" && !fallback && previous?.selection?.priority === priority2 && previous.selection.sizeRange?.target === weight && hasCompatiblePrevious(previous, chosen)) {
      const variant = LAYOUT_VARIANTS.find((item) => item.id === previous.variant?.id);
      const old = variant && calculateRecursiveLayout({
        ...options,
        mainWeight: weight,
        family: variant.family,
        selection: "coverage-size-balanced",
        candidateKey: previous.signature
      });
      const area = old?.metrics?.mainToAverageVideo;
      if (old?.status === "ready" && area >= sizeRange.min - EPSILON2 && area <= sizeRange.max + EPSILON2 && bestScore - score(old) <= SWITCH_SCORE_GAIN + EPSILON2) {
        stabilized = old.signature !== chosen.signature || variant.id !== chosen.variant.id;
        chosen = { ...old, variant };
      }
    }
    const areaRatio = chosen.metrics.mainToAverageVideo;
    const rangeLabel = `${sizeRange.min.toFixed(1)}～${sizeRange.max.toFixed(1)}×`;
    const reason = fallback ? `${options.rooms.length} 房没有面积比 ${rangeLabel} 的适中放大解，自动回退 F · 全等大网格（${chosen.grid.columns} 列 × ${chosen.grid.rows} 行），视频覆盖 ${(chosen.metrics.videoCoverage * 100).toFixed(2)}%。` : priority2 !== "coverage" ? `自动${priority2 === "compromise" ? "综合均衡" : "大小均匀"} ${chosen.variant.letter} · ${chosen.variant.title}：${areaRatio === null ? "单房间" : `主/副面积 ${areaRatio.toFixed(2)}×，目标 ${weight}×，优先范围 ${rangeLabel}`}；视频覆盖 ${(chosen.metrics.videoCoverage * 100).toFixed(2)}%。${priority2 === "compromise" ? " 同时评价覆盖率和主副窗差距，覆盖收益不足时保留较小主窗。" : ""}` : `自动选择 ${chosen.variant.letter} · ${chosen.variant.title}：当前画墙下比较 ${feasible.length} 种可行排列，视频覆盖 ${(chosen.metrics.videoCoverage * 100).toFixed(2)}%，外围留白 ${(chosen.metrics.outerMarginRatio * 100).toFixed(2)}%（最少）。`;
    return { ...chosen, selection: {
      mode: "auto",
      priority: priority2,
      feasibleCount: feasible.length,
      bestCoverage,
      score: score(chosen),
      sizeRange,
      fallback: Boolean(fallback),
      stabilized,
      reason
    } };
  };
  var calculateLayoutVariant = (options, variantId = "auto") => {
    const variant = LAYOUT_VARIANTS.find((item) => item.id === variantId);
    return variant ? calculateManualVariant(options, variant) : calculateAutomaticLayout(options);
  };
  var auditLayoutVariant = (plan, count) => auditRecursiveLayout(plan, count);

  // preview/recursive-layout-ui.js
  var $ = (id) => document.getElementById(id);
  var params = new URLSearchParams(location.search);
  var comparisonPage = document.body.dataset.previewKind === "comparison";
  var priority = ["balanced", "coverage"].includes(params.get("priority")) ? params.get("priority") : "compromise";
  var asNumber = (value, fallback, min, max) => Number.isFinite(Number(value)) && value !== null ? Math.min(max, Math.max(min, Number(value))) : fallback;
  var state = {
    count: Math.round(asNumber(params.get("count"), 8, 1, 16)),
    anchor: "auto",
    ratioMode: ["landscape", "portrait", "mixed"].includes(params.get("ratios")) ? params.get("ratios") : "landscape",
    weight: asNumber(params.get("weight"), priority === "compromise" ? DEFAULT_FOCUS_MAIN_WEIGHT : 4, 2, 10),
    priority,
    mainId: "01",
    mainRatio: "auto",
    view: ["overview", "compare", "single"].includes(params.get("view")) ? params.get("view") : comparisonPage ? "compare" : "single",
    scheme: LAYOUT_VARIANTS.some((variant) => variant.id === params.get("scheme")) ? params.get("scheme") : "auto",
    resolution: ["auto", "2246x994", "1920x1080", "2560x1440", "1280x720", "800x600", "390x844", "custom"].includes(params.get("resolution")) ? params.get("resolution") : "auto",
    customWidth: Math.round(asNumber(params.get("w"), 1920, 32, 16384)),
    customHeight: Math.round(asNumber(params.get("h"), 1080, 32, 16384)),
    guides: false
  };
  var iconPaths = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    maximize: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/>',
    play: '<path d="m8 4 12 8-12 8Z"/>',
    pause: '<path d="M8 4v16M16 4v16"/>'
  };
  var icon = (name) => `<svg class="h-full w-full" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name]}</svg>`;
  for (const node of document.querySelectorAll("[data-icon]")) node.innerHTML = icon(node.dataset.icon);
  var pad = (number) => String(number).padStart(2, "0");
  var percent = (value) => `${(value * 100).toFixed(value > 0 && value < 1e-3 ? 3 : 2)}%`;
  var ratioLabel = (ratio) => {
    for (const [value, label] of [[16 / 9, "16:9"], [9 / 16, "9:16"], [4 / 3, "4:3"], [1, "1:1"], [21 / 9, "21:9"]]) if (Math.abs(value - ratio) < 1e-7) return label;
    return ratio.toFixed(2);
  };
  var makeRooms = (count, mainId = state.mainId) => Array.from({ length: count }, (_, index) => {
    const id = pad(index + 1);
    const ratios = state.ratioMode === "mixed" ? [16 / 9, 9 / 16, 4 / 3, 16 / 9, 1, 21 / 9] : [state.ratioMode === "portrait" ? 9 / 16 : 16 / 9];
    return { id, ratio: id === mainId && state.mainRatio !== "auto" ? Number(state.mainRatio) : ratios[index % ratios.length] };
  });
  var signalCache = /* @__PURE__ */ new Map();
  var signalFor = (room) => {
    const key = `${room.id}/${room.ratio}`;
    if (signalCache.has(key)) return signalCache.get(key);
    const height = 900;
    const width = height * room.ratio;
    const colors = [["#173f56", "#429da8"], ["#36334c", "#a88aaf"], ["#29423d", "#8fae89"], ["#433329", "#c5a07a"], ["#293b51", "#87a4cf"], ["#3d333d", "#bc8f9c"]];
    const [base, accent] = colors[(Number(room.id) - 1) % colors.length];
    const centerX = width / 2;
    const radius = Math.min(width, height) * 0.22;
    const numberSize = Math.min(width, height) * 0.24;
    const marks = [[20, 20, 1, 1], [width - 20, 20, -1, 1], [20, height - 20, 1, -1], [width - 20, height - 20, -1, -1]].map(([x, y, dx, dy]) => `<path d="M${x + dx * 44},${y}H${x}V${y + dy * 44}"/>`).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="${base}"/><stop offset="1" stop-color="#101a27"/></linearGradient><radialGradient id="light"><stop stop-color="${accent}" stop-opacity=".13"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient><pattern id="grid" width="75" height="75" patternUnits="userSpaceOnUse"><path d="M75 0H0V75" fill="none" stroke="#d8e9ff" stroke-opacity=".055" stroke-width="1"/></pattern></defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/><rect width="${width}" height="${height}" fill="url(#grid)"/>
    <ellipse cx="${centerX}" cy="450" rx="${width * 0.7}" ry="620" fill="url(#light)"/>
    <path d="M0 650 Q${width * 0.25} 410 ${width * 0.48} 620 T${width} 520 V900H0Z" fill="${accent}" opacity=".065"/>
    <circle cx="${centerX}" cy="420" r="${radius}" fill="none" stroke="${accent}" stroke-opacity=".34" stroke-width="1.5"/>
    <path d="M${centerX - radius - 20} 420H${centerX + radius + 20}M${centerX} ${420 - radius - 20}V${420 + radius + 20}" stroke="${accent}" stroke-opacity=".12"/>
    <text x="${centerX}" y="465" fill="#d6e5f1" opacity=".9" font-family="Bahnschrift,Arial,sans-serif" font-size="${numberSize}" font-weight="300" text-anchor="middle">${room.id}</text>
    <text x="${centerX}" y="${Math.min(800, 465 + numberSize * 0.43)}" fill="${accent}" font-family="Consolas,monospace" font-size="${Math.min(24, width / 20)}" letter-spacing="5" text-anchor="middle">SIGNAL ${room.id} / ${ratioLabel(room.ratio)}</text>
    <g fill="none" stroke="${accent}" stroke-width="2" stroke-opacity=".6">${marks}</g><rect x="1" y="1" width="${width - 2}" height="898" fill="none" stroke="${accent}" stroke-opacity=".18"/>
  </svg>`;
    const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    signalCache.set(key, source);
    return source;
  };
  var roomNodes = /* @__PURE__ */ new Map();
  var setBox = (node, rect) => Object.assign(node.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  var createRoom = (rect) => {
    const node = document.createElement("button");
    node.type = "button";
    node.dataset.roomId = rect.roomId;
    node.className = "absolute overflow-hidden bg-black text-left focus-visible:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#f3a77e]";
    node.innerHTML = '<img draggable="false" class="pointer-events-none block h-full w-full select-none object-contain object-center" alt=""><span data-status class="pointer-events-none absolute left-2 top-2 flex max-w-[calc(100%-16px)] items-center gap-1.5 rounded-full border border-white/10 bg-[#0d1520]/75 px-2 py-1 text-[10px] backdrop-blur-md"><i data-dot class="h-1 w-1 shrink-0 rounded-full bg-[#91b7cd]"></i><span data-name class="truncate"></span></span><span data-role class="pointer-events-none absolute right-2 top-2 rounded border border-[#f3a77e]/25 bg-[#18110d]/75 px-1.5 py-0.5 text-[9px] text-[#f3a77e]">主窗</span><span data-size class="pointer-events-none absolute bottom-2 left-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[9px] text-[#cbd9eb]"></span><span data-border class="pointer-events-none absolute inset-0 border border-[#a6bcd5]/30"></span>';
    const handleFocusRoom = () => {
      if (state.mainId === rect.roomId) return;
      stopCycle();
      state.mainId = rect.roomId;
      scheduleRender();
    };
    node.addEventListener("dblclick", handleFocusRoom);
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleFocusRoom();
      }
    });
    return node;
  };
  var plans = /* @__PURE__ */ new Map();
  var dimensions = { width: 0, height: 0 };
  var generation = 0;
  var renderTimer = null;
  var cycleTimer = null;
  var lastSceneKey = "";
  var lastComparisonKey = "";
  var recommendation = null;
  var comparisonCount = LAYOUT_VARIANTS.length;
  var sizeDifferenceLabel = (plan) => {
    const main = plan.rects.find((rect) => rect.role === "main");
    const secondary = plan.rects.find((rect) => rect.role === "secondary");
    if (!secondary) return "单房间";
    return `主/副面积 ${plan.metrics.mainToAverageVideo.toFixed(2)}× · 宽 ${(main.width / secondary.width).toFixed(2)}× / 高 ${(main.height / secondary.height).toFixed(2)}×`;
  };
  var measureViewport = () => {
    const rect = $("viewport").getBoundingClientRect();
    const width = Math.max(1, rect.width - 2 * $("viewport").clientLeft);
    const height = Math.max(1, rect.height - 2 * $("viewport").clientTop);
    if (state.resolution === "custom") return { width: state.customWidth, height: state.customHeight, hostWidth: width, hostHeight: height };
    if (state.resolution !== "auto") {
      const [customWidth, customHeight] = state.resolution.split("x").map(Number);
      return { width: customWidth, height: customHeight, hostWidth: width, hostHeight: height };
    }
    return { width, height, hostWidth: width, hostHeight: height };
  };
  var syncUrl = () => {
    const query = new URLSearchParams({ count: String(state.count), anchor: state.anchor, ratios: state.ratioMode, weight: String(state.weight), priority: state.priority, view: state.view, scheme: state.scheme, resolution: state.resolution });
    if (state.resolution === "custom") {
      query.set("w", String(state.customWidth));
      query.set("h", String(state.customHeight));
    }
    try {
      history.replaceState(null, "", `${location.pathname}?${query}`);
    } catch {
    }
  };
  var syncControls = () => {
    for (const button of document.querySelectorAll("[data-count]")) button.setAttribute("aria-current", button.dataset.count === String(state.count) ? "true" : "false");
    $("ratio-mode").value = state.ratioMode;
    $("variant-select").value = state.scheme;
    $("priority-select").value = state.priority;
    $("selection-mode").textContent = state.scheme === "auto" ? "自动" : "手动";
    $("resolution-mode").value = state.resolution;
    $("custom-width").value = String(state.customWidth);
    $("custom-height").value = String(state.customHeight);
    $("custom-resolution").hidden = state.resolution !== "custom";
    $("main-weight").value = String(state.weight);
    $("weight-value").value = `${state.weight}×`;
    $("guides").checked = state.guides;
    $("view-toggle").setAttribute("aria-pressed", String(state.view === "overview"));
    $("view-label").textContent = state.view === "overview" ? "单场景预览" : "1–16 总览";
    $("overview").hidden = state.view !== "overview";
    $("comparison").hidden = state.view !== "compare";
    $("compare-toggle").setAttribute("aria-pressed", String(state.view === "compare"));
    $("compare-label").textContent = state.view === "compare" ? "返回画墙" : "多方案对比";
    $("wall").hidden = state.view !== "single";
    $("scene-title").textContent = state.view === "overview" ? "1–16 房间总览" : state.view === "compare" ? `${pad(state.count)} 房 · 等大排列对比` : `${pad(state.count)} 房间`;
    $("main-room").replaceChildren(...Array.from({ length: state.count }, (_, index) => {
      const option = new Option(`房间 ${pad(index + 1)}`, pad(index + 1));
      option.selected = option.value === state.mainId;
      return option;
    }));
    syncUrl();
  };
  var renderWall = (plan, hostWidth, hostHeight) => {
    const scale = Math.min(hostWidth / plan.width, hostHeight / plan.height);
    const actualWidth = plan.width * scale;
    const actualHeight = plan.height * scale;
    const wall = $("wall");
    setBox(wall, { x: (hostWidth - actualWidth) / 2, y: (hostHeight - actualHeight) / 2, width: plan.width, height: plan.height });
    wall.style.transformOrigin = "top left";
    wall.style.transform = `scale(${scale})`;
    $("viewport").classList.toggle("!bg-[#192130]", scale < 0.999);
    wall.classList.toggle("outline", scale < 0.999);
    wall.classList.toggle("outline-1", scale < 0.999);
    wall.classList.toggle("outline-[#43516a]", scale < 0.999);
    wall.dataset.count = String(plan.rects.length);
    wall.dataset.layoutShape = plan.layoutShape;
    wall.dataset.variant = plan.variant.id;
    wall.dataset.selectionMode = plan.selection.mode;
    wall.setAttribute("aria-label", `${plan.rects.length} 房间布局，${plan.positionLabel}`);
    const activeIds = new Set(plan.rects.map((rect) => rect.roomId));
    for (const [id, node] of roomNodes) if (!activeIds.has(id)) {
      node.remove();
      roomNodes.delete(id);
    }
    for (const rect of plan.rects) {
      let node = roomNodes.get(rect.roomId);
      if (!node) {
        node = createRoom(rect);
        roomNodes.set(rect.roomId, node);
        wall.append(node);
      }
      setBox(node, rect);
      const main = rect.role === "main";
      node.dataset.role = rect.role;
      node.setAttribute("aria-label", `房间 ${rect.roomId}，${ratioLabel(rect.ratio)}，${main ? "当前主窗" : "双击或按回车设为主窗"}`);
      node.title = `房间 ${rect.roomId} · ${ratioLabel(rect.ratio)} · ${rect.width.toFixed(1)} × ${rect.height.toFixed(1)}`;
      const image = node.querySelector("img");
      const source = signalFor({ id: rect.roomId, ratio: rect.ratio });
      if (image.getAttribute("src") !== source) image.src = source;
      image.alt = `模拟信号 ${rect.roomId}，源比例 ${ratioLabel(rect.ratio)}，四角标记和完整圆形`;
      node.querySelector("[data-name]").textContent = `SIGNAL ${rect.roomId}`;
      node.querySelector("[data-role]").hidden = !main || rect.width < 150;
      node.querySelector("[data-status]").hidden = rect.width < 90 || rect.height < 60;
      node.querySelector("[data-dot]").classList.toggle("!bg-[#f3a77e]", main);
      node.querySelector("[data-size]").textContent = `${rect.width.toFixed(1)} × ${rect.height.toFixed(1)} · ${ratioLabel(rect.ratio)}`;
      node.querySelector("[data-size]").hidden = !state.guides || rect.width < 120 || rect.height < 45;
      node.querySelector("[data-border]").hidden = !state.guides;
      node.querySelector("[data-border]").classList.toggle("!border-[#f3a77e]/70", main);
    }
    $("scale-indicator").textContent = scale < 0.999 ? `缩放 ${(scale * 100).toFixed(0)}% · 灰色为预览区` : "1:1";
  };
  var thumbnailSvg = (plan) => {
    if (plan.status === "infeasible") return `<svg xmlns="http://www.w3.org/2000/svg" class="block w-full bg-black" viewBox="0 0 ${plan.width} ${plan.height}" aria-hidden="true"><text x="50%" y="50%" fill="#c78269" text-anchor="middle" dominant-baseline="middle" font-size="${Math.min(plan.width / 18, plan.height / 8)}">当前方案不可用</text></svg>`;
    const shapes = plan.rects.map((rect) => `<g><rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="#020304"/><image href="${signalFor({ id: rect.roomId, ratio: rect.ratio })}" x="${rect.video.x}" y="${rect.video.y}" width="${rect.video.width}" height="${rect.video.height}" preserveAspectRatio="xMidYMid meet"/>${rect.role === "main" ? `<rect x="${rect.x + 1}" y="${rect.y + 1}" width="${Math.max(0, rect.width - 2)}" height="${Math.max(0, rect.height - 2)}" fill="none" stroke="#f3a77e" stroke-width="${plan.width / 450}" opacity=".75"/>` : ""}</g>`).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" class="block w-full bg-black" viewBox="0 0 ${plan.width} ${plan.height}" aria-hidden="true">${shapes}</svg>`;
  };
  var renderOverview = () => {
    const fragment = document.createDocumentFragment();
    for (let count = 1; count <= 16; count++) {
      const plan = plans.get(count);
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.overviewCount = String(count);
      button.setAttribute("aria-label", `查看 ${count} 房间布局`);
      button.className = "group overflow-hidden rounded-md border border-white/10 bg-[#111722] text-left transition hover:border-[#f3a77e]/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f3a77e]";
      const feasible = plan.status !== "infeasible";
      button.dataset.feasible = String(feasible);
      button.dataset.layoutShape = plan.layoutShape ?? "infeasible";
      button.dataset.variant = plan.variant.id;
      button.innerHTML = `${thumbnailSvg(plan)}<span class="flex items-center justify-between gap-1 px-2.5 py-2"><span class="text-[11px] text-[#d8e1ee]"><b class="mr-1.5 font-mono text-[#f3a77e]">${pad(count)}</b>房间</span><span class="text-[9px] text-[#a2b0c3]">${feasible ? `${state.scheme === "auto" ? "自动 · " : ""}${plan.positionLabel}` : "方案不可用"}</span><span class="font-mono text-[10px] text-[#8192aa]">${feasible ? percent(plan.metrics.videoCoverage) : "不可行"}</span></span>${feasible ? `<span class="block border-t border-white/[0.06] px-2.5 py-1.5 font-mono text-[9px] text-[#a7b4c7]">${sizeDifferenceLabel(plan)}${plan.layoutShape === "equal-grid" ? " · 自动回退" : ""}</span>` : ""}`;
      button.addEventListener("click", () => {
        stopCycle();
        state.count = count;
        state.view = "single";
        if (Number(state.mainId) > count) state.mainId = "01";
        scheduleRender();
      });
      fragment.append(button);
    }
    $("overview-grid").replaceChildren(fragment);
  };
  var renderComparison = (items) => {
    const fragment = document.createDocumentFragment();
    for (const plan of items) {
      const metadata = plan.variant;
      const feasible = plan.status === "ready";
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.variant = metadata.id;
      button.dataset.feasible = String(feasible);
      const recommended = feasible && recommendation?.variant.id === metadata.id;
      button.dataset.recommended = String(recommended);
      button.disabled = !feasible;
      button.setAttribute("aria-label", `查看方案 ${metadata.letter}：${metadata.title}`);
      button.setAttribute("aria-pressed", String(state.scheme === metadata.id || state.scheme === "auto" && recommended));
      button.className = "overflow-hidden rounded-lg border border-white/10 bg-[#111722] text-left transition hover:border-[#f3a77e]/60 aria-pressed:border-[#f3a77e]/70 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f3a77e]";
      const excessive = state.priority !== "coverage" && feasible && plan.metrics.mainToAverageVideo > plan.selection.sizeRange?.max + 1e-7;
      const badge = metadata.id === "grid" ? "全等大 · 自动回退" : excessive ? "差距过大 · 手动可选" : recommended ? "自动推荐 · 小窗等大" : feasible ? "小窗全部等大" : "当前数量不可行";
      const main = feasible ? plan.rects.find((rect) => rect.role === "main") : null;
      const sizes = feasible ? `<span class="block border-t border-white/[0.06] px-3 py-2 font-mono text-[10px] leading-4 text-[#9aabc2]">主窗 ${main.width.toFixed(0)} × ${main.height.toFixed(0)}<span class="mt-1 block text-[#73859f]">副窗 ${plan.metrics.secondarySizes.map((size) => `${size.count} 窗 ${size.width.toFixed(0)} × ${size.height.toFixed(0)}`).join(" / ") || "无"}</span><span class="mt-1 block text-[#a7b4c7]">${sizeDifferenceLabel(plan)}</span></span>` : "";
      const numbers = feasible ? `<span class="grid grid-cols-3 gap-2 border-t border-white/[0.06] px-3 py-3"><span><span class="block text-[10px] text-[#7f8da3]">视频覆盖</span><b class="font-mono text-lg font-normal text-[#e2ebf8]">${percent(plan.metrics.videoCoverage)}</b></span><span><span class="block text-[10px] text-[#7f8da3]">外围留白</span><b class="font-mono text-sm font-normal text-[#c78269]">${percent(plan.metrics.outerMarginRatio)}</b></span><span><span class="block text-[10px] text-[#7f8da3]">主 / 副窗面积</span><b class="font-mono text-sm font-normal text-[#afbdd1]">${plan.metrics.mainToLargestVideo?.toFixed(2) ?? "—"}×</b></span></span>` : `<span class="block px-3 py-3 text-xs text-[#c78269]">${plan.reason}</span>`;
      button.innerHTML = `<span class="flex items-center justify-between gap-2 px-3 py-3"><span class="flex min-w-0 items-center gap-2"><b class="font-mono text-sm font-normal text-[#f3a77e]">${metadata.letter}</b><span class="truncate text-xs text-[#dce5f3]">${metadata.title}</span></span><span class="shrink-0 rounded border border-white/10 px-1.5 py-1 text-[9px] text-[#7fd6b0]">${badge}</span></span>${thumbnailSvg(plan)}${numbers}${sizes}<span class="block min-h-12 border-t border-white/[0.06] px-3 py-2 text-[10px] leading-4 text-[#8d9bb0]">${metadata.description}</span>`;
      button.addEventListener("click", () => {
        stopCycle();
        state.scheme = metadata.id === "grid" ? "auto" : metadata.id;
        state.view = "single";
        lastComparisonKey = "";
        scheduleRender();
      });
      fragment.append(button);
    }
    $("comparison-grid").replaceChildren(fragment);
    comparisonCount = items.length;
    $("comparison-availability").value = `${items.filter((item) => item.status === "ready").length} / ${items.length} 种结构可行`;
    for (const option of $("variant-select").options) option.disabled = option.value !== "auto" && items.find((item) => item.variant.id === option.value)?.status !== "ready";
    $("comparison-resolution").value = `${dimensions.width.toFixed(0)} × ${dimensions.height.toFixed(0)} · ${state.count} 房`;
  };
  var renderMetrics = (plan, elapsed2) => {
    const metrics = plan.metrics;
    const main = plan.rects.find((rect) => rect.role === "main");
    $("metric-video").value = (metrics.videoCoverage * 100).toFixed(2);
    for (const [id, value] of [["box", metrics.boxCoverage], ["letterbox", metrics.letterboxRatio], ["empty", metrics.emptyRatio], ["gap", metrics.gapRatio]]) $(`metric-${id}`).value = percent(value);
    $("metric-outer").value = percent(metrics.outerMarginRatio);
    const marginLabel = { "left-right": "仅左右", "top-bottom": "仅上下", none: "无外围留白" }[metrics.marginAxis];
    $("metric-margin").value = marginLabel;
    $("metric-content").value = `${plan.bounds.width.toFixed(0)} × ${plan.bounds.height.toFixed(0)}`;
    $("metric-content-ratio").value = `${metrics.contentRatio.toFixed(4)}:1`;
    $("content-resolution").value = `拼接 ${plan.bounds.width.toFixed(0)} × ${plan.bounds.height.toFixed(0)}`;
    $("position-strategy").value = plan.positionLabel;
    $("constraint-badge").textContent = "所有方案 · 小窗全部等大";
    $("secondary-label").textContent = "等大小窗";
    $("secondary-heading").textContent = "副窗分布 · 全部等大";
    const limitNote = plan.layoutShape === "equal-grid" ? " 已按约定采用全部窗口等大的回退方案。" : metrics.prominenceLimited ? " 当前约束限制了主窗放大幅度。" : metrics.weightLimited ? " 等大小窗与完整矩形限制了主窗可选倍数，面积目标无法精确满足。" : "";
    const selectionReason = state.scheme === "auto" ? plan.selection.reason : `手动选择 ${plan.variant.letter} · ${plan.variant.title}。${recommendation ? `自动推荐 ${recommendation.variant.letter}，覆盖率 ${percent(recommendation.metrics.videoCoverage)}。` : ""}`;
    $("layout-note").textContent = `${selectionReason} ${plan.autoReason}${limitNote}`;
    const priorityLabel = state.priority === "compromise" ? "综合均衡 · 主窗适度放大" : state.priority === "balanced" ? "大小均匀" : "覆盖最全";
    $("layout-explanation").value = state.view === "overview" ? `${priorityLabel} · ${state.scheme === "auto" ? "各数量自动选优" : "使用手动排列"} · 小窗全部等大` : selectionReason;
    $("layout-explanation").title = $("layout-explanation").value;
    $("layout-explanation").title = $("layout-explanation").value;
    $("bar-video").style.width = percent(metrics.videoCoverage);
    $("bar-letterbox").style.width = percent(metrics.letterboxRatio);
    $("bar-empty").style.width = percent(metrics.outerMarginRatio);
    $("metric-main-size").value = `${main.width.toFixed(0)} × ${main.height.toFixed(0)}`;
    $("metric-main-share").value = `${percent(metrics.targetMainShare)} / ${percent(metrics.mainShare)}`;
    $("metric-dominance").value = metrics.mainToLargestVideo === null ? "单房间" : `${metrics.mainToLargestVideo.toFixed(2)}×`;
    const secondary = plan.rects.find((rect) => rect.role === "secondary");
    $("metric-linear").value = secondary ? `${(main.width / secondary.width).toFixed(2)}× / ${(main.height / secondary.height).toFixed(2)}×` : "单房间";
    $("metric-secondary-size").value = metrics.secondarySize ? `${metrics.secondarySize.width.toFixed(1)} × ${metrics.secondarySize.height.toFixed(1)}` : "无副窗";
    $("secondary-resolution").value = metrics.secondarySize ? `${metrics.secondarySize.width.toFixed(1)} × ${metrics.secondarySize.height.toFixed(1)}` : "";
    $("region-counts").innerHTML = [["left", "左侧"], ["right", "右侧"], ["bottom", "底部"]].map(([region, label]) => `<div class="rounded border border-white/[0.07] bg-white/[0.02] px-2 py-2 text-center"><span class="block font-mono text-lg text-[#c0d0e4]">${plan.rects.filter((rect) => rect.region === region).length}</span><span class="text-[10px] text-[#718097]">${label}</span></div>`).join("");
    $("compute-time").value = `${plan.candidateCount} 候选 · 16 场景 ${elapsed2.toFixed(0)} ms`;
    $("footer-summary").value = `${state.view === "overview" ? "16 SCENES" : state.view === "compare" ? `${comparisonCount} VARIANTS` : `${pad(state.count)} ROOMS`} / ${state.scheme === "auto" ? "AUTO → " : "手动 "}${plan.variant.letter} · ${plan.positionLabel} / 外围 ${percent(metrics.outerMarginRatio)} · ${marginLabel}`;
  };
  var showError = (message) => {
    $("loading").hidden = true;
    $("error-state").hidden = false;
    $("error-title").textContent = "暂时无法生成预览";
    $("retry").hidden = false;
    $("error-message").textContent = message;
    $("audit-status").textContent = "布局计算未完成";
  };
  var renderInfeasible = (plan) => {
    $("wall").replaceChildren();
    roomNodes.clear();
    $("wall").dataset.count = "0";
    $("wall").dataset.layoutShape = "infeasible";
    $("wall").dataset.variant = "infeasible";
    $("wall").dataset.selectionMode = state.scheme === "auto" ? "auto" : "manual";
    $("wall").setAttribute("aria-label", "当前源比例无法满足布局约束");
    $("viewport").classList.remove("!bg-[#192130]");
    $("wall").classList.remove("outline", "outline-1", "outline-[#43516a]");
    for (const node of document.querySelectorAll('output[id^="metric-"]')) node.value = "—";
    for (const id of ["bar-video", "bar-letterbox", "bar-empty"]) $(id).style.width = "0%";
    $("region-counts").replaceChildren();
    $("content-resolution").value = "无法生成完整矩形";
    $("secondary-resolution").value = "当前排列不可行";
    $("position-strategy").value = "方案不可用";
    $("scale-indicator").textContent = "";
    $("layout-note").textContent = plan.reason;
    $("layout-explanation").value = plan.reason;
    $("layout-explanation").title = plan.reason;
    $("constraint-badge").textContent = "所有方案 · 小窗全部等大";
    $("compute-time").value = "当前输入下没有可行方案";
    $("footer-summary").value = `${pad(state.count)} ROOMS / 当前方案不可用`;
    $("error-state").hidden = state.view !== "single";
    $("error-title").textContent = "当前输入不满足所选方案";
    $("error-message").textContent = plan.reason;
    $("retry").hidden = true;
  };
  var elapsed = 0;
  var handleRender = async () => {
    const currentGeneration = ++generation;
    if (Number(state.mainId) > state.count) state.mainId = "01";
    syncControls();
    dimensions = measureViewport();
    $("window-resolution").value = `窗口 ${innerWidth} × ${innerHeight}`;
    $("wall-resolution").value = `${dimensions.width.toFixed(0)} × ${dimensions.height.toFixed(0)} px`;
    const key = `${dimensions.width}/${dimensions.height}/${state.anchor}/${state.ratioMode}/${state.weight}/${state.mainId}/${state.mainRatio}/${state.scheme}/${state.priority}`;
    $("error-state").hidden = true;
    try {
      if (key !== lastSceneKey || plans.size !== 16) {
        $("loading").hidden = false;
        $("audit-status").textContent = "正在检查 1–16 房";
        const started = performance.now();
        const nextPlans = /* @__PURE__ */ new Map();
        for (let count = 1; count <= 16; count++) {
          if (currentGeneration !== generation) return;
          const mainRoomId = Number(state.mainId) <= count ? state.mainId : "01";
          const plan2 = calculateLayoutVariant({ ...dimensions, rooms: makeRooms(count, mainRoomId), mainRoomId, anchor: state.anchor, mainWeight: state.weight, priority: state.priority, previous: plans.get(count) }, state.scheme);
          if (plan2?.status !== "infeasible") {
            const audit = auditLayoutVariant(plan2, count);
            if (!audit.valid) throw new Error(`${count} 房：${audit.errors.join("；")}`);
          }
          nextPlans.set(count, plan2);
          if (count % 4 === 0) {
            $("loading-label").textContent = `正在计算布局 ${count} / 16`;
            await new Promise(requestAnimationFrame);
          }
        }
        if (currentGeneration !== generation) return;
        plans = nextPlans;
        lastSceneKey = key;
        elapsed = performance.now() - started;
        renderOverview();
      }
      const comparisonKey = `${key}/${state.count}`;
      if (comparisonKey !== lastComparisonKey) {
        const comparisons = compareLayoutVariants({ ...dimensions, rooms: makeRooms(state.count), mainRoomId: state.mainId, mainWeight: state.weight, priority: state.priority, anchor: state.anchor });
        for (const item of comparisons) if (item.status === "ready") {
          const audit = auditLayoutVariant(item, state.count);
          if (!audit.valid) throw new Error(`${item.variant.title}：${audit.errors.join("；")}`);
        }
        const automatic = state.scheme === "auto" ? plans.get(state.count) : calculateLayoutVariant({ ...dimensions, rooms: makeRooms(state.count), mainRoomId: state.mainId, mainWeight: state.weight, priority: state.priority });
        recommendation = automatic?.status === "ready" ? automatic : null;
        renderComparison(comparisons);
        lastComparisonKey = comparisonKey;
      }
      const plan = plans.get(state.count);
      $("l-shape-demo").disabled = getLShapeCounts().length === 0;
      for (const button of document.querySelectorAll("#count-navigation [data-count]")) {
        const item = plans.get(Number(button.dataset.count));
        button.title = `${button.dataset.count} 房 · ${item.positionLabel ?? "方案不可用"}`;
      }
      const feasible = plan.status !== "infeasible";
      if (feasible) {
        renderWall(plan, dimensions.hostWidth, dimensions.hostHeight);
        renderMetrics(plan, elapsed);
      } else renderInfeasible(plan);
      const readyCount = [...plans.values()].filter((item) => item.status === "ready").length;
      $("audit-status").textContent = feasible || state.view === "overview" ? `${readyCount} / 16 当前排列可用 · 小窗全部等大 · 无内部黑边 · 完整矩形` : "当前方案不可用 · 可切换其他方案";
      $("audit-status").dataset.valid = String(feasible);
      $("loading").hidden = true;
    } catch (error) {
      if (currentGeneration !== generation) return;
      $("audit-status").dataset.valid = "false";
      showError(error instanceof Error ? error.message : "未知错误，请重新计算。");
    }
  };
  var scheduleRender = () => {
    generation++;
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      void handleRender();
    }, 40);
  };
  var stopCycle = () => {
    clearInterval(cycleTimer);
    cycleTimer = null;
    $("cycle").setAttribute("aria-pressed", "false");
    $("cycle-label").textContent = "轮播";
    $("cycle-icon").innerHTML = icon("play");
  };
  for (let count = 1; count <= 16; count++) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.count = String(count);
    button.setAttribute("aria-label", `${count} 个房间`);
    button.className = "h-7 w-7 shrink-0 rounded font-mono text-[11px] text-[#8a99af] transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f3a77e] aria-[current=true]:bg-[#f3a77e] aria-[current=true]:font-semibold aria-[current=true]:text-[#1a120c] md:w-8";
    button.textContent = pad(count);
    button.addEventListener("click", () => {
      stopCycle();
      state.count = count;
      scheduleRender();
    });
    $("count-navigation").append(button);
  }
  $("ratio-mode").addEventListener("change", (event) => {
    state.ratioMode = event.target.value;
    scheduleRender();
  });
  $("main-weight").addEventListener("input", (event) => {
    state.weight = Number(event.target.value);
    $("weight-value").value = `${state.weight}×`;
    scheduleRender();
  });
  $("main-room").addEventListener("change", (event) => {
    state.mainId = event.target.value;
    scheduleRender();
  });
  $("main-ratio").addEventListener("change", (event) => {
    state.mainRatio = event.target.value;
    scheduleRender();
  });
  $("guides").addEventListener("change", (event) => {
    state.guides = event.target.checked;
    scheduleRender();
  });
  $("view-toggle").addEventListener("click", () => {
    state.view = state.view === "overview" ? "single" : "overview";
    scheduleRender();
  });
  $("compare-toggle").addEventListener("click", () => {
    stopCycle();
    state.view = state.view === "compare" ? "single" : "compare";
    scheduleRender();
  });
  $("variant-select").addEventListener("change", (event) => {
    stopCycle();
    state.scheme = event.target.value;
    scheduleRender();
  });
  $("priority-select").addEventListener("change", (event) => {
    stopCycle();
    state.priority = event.target.value;
    scheduleRender();
  });
  var getLShapeCounts = () => {
    const counts = [];
    for (let count = 1; count <= 16; count++) {
      const mainRoomId = Number(state.mainId) <= count ? state.mainId : "01";
      const plan = calculateLayoutVariant({ ...dimensions, rooms: makeRooms(count, mainRoomId), mainRoomId, mainWeight: state.weight, priority: state.priority }, "balanced");
      if (plan?.layoutShape === "l-shape") counts.push(count);
    }
    return counts.sort((a, b) => Math.abs(a - state.count) - Math.abs(b - state.count) || a - b);
  };
  var handleLShapeDemo = () => {
    const counts = getLShapeCounts();
    if (!counts.length) return;
    stopCycle();
    state.count = counts[0];
    state.scheme = "balanced";
    state.view = "single";
    scheduleRender();
  };
  $("l-shape-demo").addEventListener("click", handleLShapeDemo);
  $("resolution-mode").addEventListener("change", (event) => {
    state.resolution = event.target.value;
    $("custom-resolution").hidden = state.resolution !== "custom";
    $("custom-error").textContent = "";
    scheduleRender();
  });
  $("custom-resolution").addEventListener("submit", (event) => {
    event.preventDefault();
    const width = Number($("custom-width").value);
    const height = Number($("custom-height").value);
    if (![width, height].every((value) => Number.isInteger(value) && value >= 32 && value <= 16384)) {
      $("custom-error").textContent = "宽高必须为 32–16384 的整数";
      return;
    }
    $("custom-error").textContent = "";
    state.customWidth = width;
    state.customHeight = height;
    scheduleRender();
  });
  $("cycle").addEventListener("click", () => {
    if (cycleTimer) {
      stopCycle();
      return;
    }
    state.view = "single";
    state.count = 1;
    scheduleRender();
    $("cycle").setAttribute("aria-pressed", "true");
    $("cycle-icon").innerHTML = icon("pause");
    $("cycle-label").textContent = "暂停";
    cycleTimer = setInterval(() => {
      state.count = state.count % 16 + 1;
      scheduleRender();
    }, 2200);
  });
  $("fullscreen").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if ($("viewport").requestFullscreen) await $("viewport").requestFullscreen();
      else {
        $("audit-status").textContent = "当前浏览器不支持全屏，可使用浏览器的最大化功能";
        return;
      }
      scheduleRender();
    } catch {
      $("audit-status").textContent = "全屏未能开启，请使用浏览器最大化功能";
    }
  });
  $("retry").addEventListener("click", () => {
    lastSceneKey = "";
    scheduleRender();
  });
  document.addEventListener("keydown", (event) => {
    if (event.target.closest("input,select,textarea") || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    stopCycle();
    state.count = Math.max(1, Math.min(16, state.count + (event.key === "ArrowRight" ? 1 : -1)));
    scheduleRender();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopCycle();
  });
  document.addEventListener("fullscreenchange", scheduleRender);
  var resizeObserver = new ResizeObserver(scheduleRender);
  resizeObserver.observe($("viewport"));
  window.addEventListener("resize", scheduleRender);
  window.addEventListener("pagehide", () => {
    stopCycle();
    resizeObserver.disconnect();
    clearTimeout(renderTimer);
  }, { once: true });
  void handleRender();
})();
