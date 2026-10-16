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
      const group = secondarySizes.find((size2) => Math.abs(size2.width - rect.width) < epsilon && Math.abs(size2.height - rect.height) < epsilon);
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
  var enumerateRecursiveLayouts = (options) => {
    const validation = calculateRecursiveLayout({ ...options, family: "auto", anchor: "top-left", selection: "coverage", candidateKey: null });
    if (!validation) return null;
    if (validation.status !== "ready") return { ...validation, candidates: [] };
    const main = validation.rects.find((rect) => rect.role === "main");
    const secondary = validation.rects.find((rect) => rect.role === "secondary");
    const raw = uniformCandidates(options.rooms.length - 1, main.ratio, secondary?.ratio ?? main.ratio);
    const preserveFocus = secondary && raw.some((candidate) => candidate.mainArea >= MAIN_DOMINANCE - EPSILON);
    const candidates = raw.filter((candidate) => !preserveFocus || candidate.mainArea >= MAIN_DOMINANCE - EPSILON).map((candidate) => {
      const family = candidate.leftColumns > 0 ? candidate.bottomRows > 0 ? "u-shape" : "sides" : candidate.sideColumns > 0 ? candidate.bottomRows > 0 ? "l-shape" : "right" : candidate.bottomRows > 0 ? "bottom" : "right";
      const plan = calculateRecursiveLayout({ ...options, family, anchor: "auto", selection: "coverage", candidateKey: candidate.key });
      if (plan?.status !== "ready") throw new Error("枚举的行列组合未能生成有效坐标。");
      return plan;
    });
    return { status: "ready", width: options.width, height: options.height, candidates };
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

  // preview/layout-research-engine.js
  var EPSILON2 = 1e-9;
  var unitLabel = (value) => Number.isInteger(value) ? String(value) : value.toFixed(2);
  var describeCandidate = (plan, range) => {
    const units = plan.units;
    const area = plan.metrics.mainToAverageVideo;
    const span = `${unitLabel(units.mainColumns)}×${unitLabel(units.mainRows)}`;
    const right = units.sideColumns - units.leftColumns;
    let title = plan.positionLabel;
    if (plan.layoutShape === "l-shape") title = `${right > 1 ? "多列右侧" : "窄侧栏"}＋${units.bottomRows > 1 ? "多行底部" : "单行底部"} L 型`;
    if (plan.layoutShape === "u-shape") title = `顶部居中＋${units.bottomRows > 1 ? "多行底部" : "单行底部"} U 型`;
    if (plan.layoutShape === "right-strip") title = `右侧 ${right} 列 × ${unitLabel(units.mainRows)} 行`;
    if (plan.layoutShape === "bottom-strip") title = `底部 ${unitLabel(units.columns)} 列 × ${units.bottomRows} 行`;
    if (plan.layoutShape === "side-surround") title = `左右各 ${units.leftColumns} 列`;
    if (plan.layoutShape === "equal-grid") title = "全等大网格回退";
    const regions = [units.leftColumns ? `左 ${units.leftColumns} 列` : "", right ? `右 ${right} 列` : "", units.bottomRows ? `底 ${units.bottomRows} 行` : ""].filter(Boolean).join(" · ");
    return {
      id: plan.layoutShape === "equal-grid" ? `grid:${plan.signature}` : plan.signature,
      title,
      span,
      regions: regions || "单房间",
      area,
      moderate: area === null || area <= range.max + EPSILON2 && (area >= range.min - EPSILON2 || plan.metrics.prominenceLimited),
      error: area === null ? 0 : Math.abs(Math.log(area / range.target)),
      frontier: false,
      sizePreferred: false,
      coveragePreferred: false
    };
  };
  var calculateResearchLayouts = (options) => {
    const enumeration = enumerateRecursiveLayouts(options);
    if (!enumeration || enumeration.status !== "ready") return enumeration;
    const range = getMainSizePreference(options.mainWeight);
    const candidates = enumeration.candidates.map((plan) => ({ ...plan, research: describeCandidate(plan, range) }));
    if (candidates.length && candidates.every((plan) => plan.metrics.mainToAverageVideo > range.max + EPSILON2)) {
      const grid = calculateRecursiveLayout({ ...options, family: "auto", anchor: "top-left", selection: "equal-grid", candidateKey: null });
      if (grid?.status === "ready") {
        const research = describeCandidate(grid, range);
        candidates.push({ ...grid, research: { ...research, moderate: true } });
      }
    }
    let moderate = candidates.filter((plan) => plan.research.moderate);
    if (!moderate.length) {
      const closest = Math.min(...candidates.map((plan) => plan.research.error));
      moderate = candidates.filter((plan) => plan.research.error <= closest + EPSILON2);
      for (const plan of moderate) plan.research.moderate = true;
    }
    const minError = Math.min(...moderate.map((plan) => plan.research.error));
    const bestSizeCoverage = Math.max(...moderate.filter((plan) => plan.research.error <= minError + EPSILON2).map((plan) => plan.metrics.videoCoverage));
    const bestCoverage = Math.max(...moderate.map((plan) => plan.metrics.videoCoverage));
    for (const plan of candidates) {
      const audit = auditRecursiveLayout(plan, options.rooms.length);
      if (!audit.valid) throw new Error(`调研候选几何检查失败：${audit.errors.join("；")}`);
      if (!plan.research.moderate) continue;
      plan.research.frontier = !moderate.some((other) => other !== plan && other.metrics.videoCoverage >= plan.metrics.videoCoverage - EPSILON2 && other.research.error <= plan.research.error + EPSILON2 && (other.metrics.videoCoverage > plan.metrics.videoCoverage + EPSILON2 || other.research.error < plan.research.error - EPSILON2));
      plan.research.sizePreferred = plan.research.error <= minError + EPSILON2 && plan.metrics.videoCoverage >= bestSizeCoverage - EPSILON2;
      plan.research.coveragePreferred = plan.metrics.videoCoverage >= bestCoverage - EPSILON2;
    }
    candidates.sort((a, b) => Number(b.research.moderate) - Number(a.research.moderate) || a.research.error - b.research.error || b.metrics.videoCoverage - a.metrics.videoCoverage || a.units.leftColumns - b.units.leftColumns || a.research.id.localeCompare(b.research.id));
    return {
      ...enumeration,
      candidates,
      range,
      moderateCount: moderate.length,
      frontierCount: candidates.filter((plan) => plan.research.frontier).length
    };
  };

  // preview/layout-research-ui.js
  var $ = (id) => document.getElementById(id);
  var params = new URLSearchParams(location.search);
  var numberFrom = (value, fallback, min, max) => value !== null && Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
  var resolutions = ["auto", "2246x994", "1280x720", "800x600", "390x844", "custom"];
  var state = {
    count: Math.round(numberFrom(params.get("count"), 12, 1, 16)),
    ratio: params.get("ratios") === "portrait" ? "portrait" : "landscape",
    resolution: resolutions.includes(params.get("resolution")) ? params.get("resolution") : "auto",
    weight: numberFrom(params.get("weight"), 4, 2, 10),
    mainId: String(Math.round(numberFrom(params.get("main"), 1, 1, 16))).padStart(2, "0"),
    scope: ["moderate", "frontier", "all"].includes(params.get("scope")) ? params.get("scope") : "moderate",
    view: params.get("view") === "single" ? "single" : "compare",
    selectedId: params.get("candidate"),
    width: Math.round(numberFrom(params.get("w"), 1920, 32, 16384)),
    height: Math.round(numberFrom(params.get("h"), 1080, 32, 16384))
  };
  var scene = null;
  var dimensions = null;
  var lastKey = "";
  var timer = null;
  var generation = 0;
  var pad = (value) => String(value).padStart(2, "0");
  var percent = (value) => `${(value * 100).toFixed(2)}%`;
  var size = (rect) => `${rect.width.toFixed(1)} × ${rect.height.toFixed(1)}`;
  var escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  var signalSvg = (plan, label) => {
    const colors = ["#214b60", "#3c3c55", "#2b4945", "#4b3b32", "#30455f", "#463747"];
    const tiles = plan.rects.map((rect) => {
      const short = Math.min(rect.width, rect.height);
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const main = rect.role === "main";
      const margin = short * 0.035;
      const mark = short * 0.06;
      const corners = [[rect.x + margin, rect.y + margin, 1, 1], [rect.x + rect.width - margin, rect.y + margin, -1, 1], [rect.x + margin, rect.y + rect.height - margin, 1, -1], [rect.x + rect.width - margin, rect.y + rect.height - margin, -1, -1]].map(([x, y, dx, dy]) => `<path d="M${x + dx * mark} ${y}H${x}V${y + dy * mark}"/>`).join("");
      return `<g><rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="${main ? "#23546b" : colors[(Number(rect.roomId) - 1) % colors.length]}"/><path d="M${rect.x} ${rect.y + rect.height * 0.78}Q${cx} ${rect.y + rect.height * 0.42} ${rect.x + rect.width} ${rect.y + rect.height * 0.75}V${rect.y + rect.height}H${rect.x}Z" fill="#b6d8eb" opacity=".035"/><circle cx="${cx}" cy="${cy}" r="${short * 0.22}" fill="none" stroke="#adcfe2" stroke-opacity=".18" stroke-width="${short / 500}"/><text x="${cx}" y="${cy + short * 0.075}" text-anchor="middle" fill="#d8e9f2" font-family="Bahnschrift,Arial,sans-serif" font-size="${short * 0.25}" font-weight="300">${escapeHtml(rect.roomId)}</text><text x="${cx}" y="${cy + short * 0.32}" text-anchor="middle" fill="#a8c4d7" opacity=".7" font-family="Consolas,monospace" font-size="${short * 0.037}" letter-spacing="${short * 5e-3}">${main ? "FOCUS" : "SIGNAL"} / ${state.ratio === "portrait" ? "9:16" : "16:9"}</text><g fill="none" stroke="${main ? "#f3a77e" : "#a6c2d5"}" stroke-opacity=".45" stroke-width="${short / 180}">${corners}</g><rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="none" stroke="${main ? "#f3a77e" : "#9bb8cc"}" stroke-opacity="${main ? ".8" : ".18"}" stroke-width="${short / 220}"/></g>`;
    }).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${plan.width} ${plan.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(label)}" class="block w-full bg-black">${tiles}</svg>`;
  };
  var measure = () => {
    const rect = $("research-viewport").getBoundingClientRect();
    const actual = { width: Math.max(1, rect.width - 2 * $("research-viewport").clientLeft), height: Math.max(1, rect.height - 2 * $("research-viewport").clientTop) };
    if (state.resolution === "auto") return actual;
    if (state.resolution === "custom") return { width: state.width, height: state.height };
    const [width, height] = state.resolution.split("x").map(Number);
    return { width, height };
  };
  var syncUrl = () => {
    const query = new URLSearchParams({ count: String(state.count), ratios: state.ratio, resolution: state.resolution, weight: String(state.weight), main: state.mainId, scope: state.scope, view: state.view });
    if (state.view === "single" && state.selectedId) query.set("candidate", state.selectedId);
    if (state.resolution === "custom") {
      query.set("w", String(state.width));
      query.set("h", String(state.height));
    }
    try {
      history.replaceState(null, "", `${location.pathname}?${query}`);
    } catch {
    }
  };
  var syncControls = () => {
    $("research-resolution").value = state.resolution;
    $("research-ratio").value = state.ratio;
    $("research-weight").value = String(state.weight);
    $("research-weight-value").value = `${state.weight}×`;
    $("research-custom").hidden = state.resolution !== "custom";
    $("research-width").value = String(state.width);
    $("research-height").value = String(state.height);
    $("research-back").hidden = state.view !== "single";
    $("research-filters").hidden = state.view === "single";
    for (const button of document.querySelectorAll("[data-count]")) button.setAttribute("aria-current", String(Number(button.dataset.count) === state.count));
    for (const button of document.querySelectorAll("[data-scope]")) button.setAttribute("aria-pressed", String(button.dataset.scope === state.scope));
    $("research-main").replaceChildren(...Array.from({ length: state.count }, (_, index) => new Option(`房间 ${pad(index + 1)}`, pad(index + 1))));
    $("research-main").value = state.mainId;
  };
  var tagFor = (plan) => {
    if (plan.layoutShape === "equal-grid") return "没有适中解 · 等大回退";
    if (!plan.research.moderate) return "面积差较大 · 对照";
    if (plan.research.sizePreferred && plan.research.coveragePreferred) return "大小与覆盖兼顾";
    if (plan.research.sizePreferred) return "副窗优先";
    if (plan.research.coveragePreferred) return "覆盖优先";
    return plan.research.frontier ? "有效取舍" : "其他画墙比例备选";
  };
  var renderGallery = (plans) => {
    const fragment = document.createDocumentFragment();
    for (const plan of plans) {
      const index = scene.candidates.indexOf(plan) + 1;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.candidateId = plan.research.id;
      button.dataset.mainArea = String(Math.round((plan.research.area ?? 1) * 1e6) / 1e6);
      button.dataset.columns = String(plan.units.columns);
      button.dataset.rows = String(plan.units.rows);
      button.dataset.layoutShape = plan.layoutShape;
      button.setAttribute("aria-label", `查看调研 ${pad(index)}：${plan.research.title}，主窗 ${plan.research.span}`);
      button.className = "group overflow-hidden rounded-lg border border-white/10 bg-[#111722] text-left transition hover:border-[#f3a77e]/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f3a77e]";
      const main = plan.rects.find((rect) => rect.role === "main");
      const small = plan.rects.find((rect) => rect.role === "secondary");
      button.innerHTML = `<span class="flex items-start justify-between gap-2 px-3 py-3"><span><span class="block text-[10px] text-[#8495ad]">调研 ${pad(index)} · 主窗 ${plan.research.span}</span><span class="mt-1 block text-xs text-[#dce5f3]">${plan.research.title}</span></span><span class="shrink-0 rounded border border-[#f3a77e]/20 bg-[#f3a77e]/5 px-1.5 py-1 text-[9px] text-[#f3a77e]">${tagFor(plan)}</span></span><span class="block bg-black">${signalSvg(plan, `${state.count} 房 ${plan.research.title}`)}</span><span class="grid grid-cols-3 gap-2 border-t border-white/[0.06] px-3 py-3"><span><span class="block text-[10px] text-[#7f8da3]">主 / 副面积</span><b class="font-mono text-lg font-normal text-[#f3a77e]">${plan.research.area === null ? "单窗" : `${plan.research.area.toFixed(2)}×`}</b></span><span><span class="block text-[10px] text-[#7f8da3]">视频覆盖</span><b class="font-mono text-lg font-normal">${percent(plan.metrics.videoCoverage)}</b></span><span><span class="block text-[10px] text-[#7f8da3]">宽 / 高倍数</span><b class="font-mono text-xs font-normal text-[#afbdd1]">${small ? `${(main.width / small.width).toFixed(1)} / ${(main.height / small.height).toFixed(1)}` : "—"}</b></span></span><span class="block border-t border-white/[0.06] px-3 py-2 text-[10px] leading-5 text-[#93a5be]">${plan.research.regions}<span class="block font-mono">主 ${size(main)} · 副 ${small ? size(small) : "无"}</span></span>`;
      button.addEventListener("click", () => {
        state.selectedId = plan.research.id;
        state.view = "single";
        scheduleRender();
      });
      fragment.append(button);
    }
    $("research-grid").replaceChildren(fragment);
  };
  var renderDetail = (plan) => {
    const main = plan.rects.find((rect) => rect.role === "main");
    const small = plan.rects.find((rect) => rect.role === "secondary");
    $("research-detail-stats").innerHTML = `<span class="text-[#f3a77e]">${tagFor(plan)}</span><span>主窗 ${plan.research.span} · 面积 ${plan.research.area?.toFixed(2) ?? "—"}×</span><span>覆盖 ${percent(plan.metrics.videoCoverage)}</span><span>外围留白 ${percent(plan.metrics.outerMarginRatio)}</span><span>${plan.research.regions}</span><span>主 ${size(main)} · 副 ${small ? size(small) : "无"}</span>`;
    const host = $("research-detail-wall");
    const scale = Math.min(host.clientWidth / plan.width, host.clientHeight / plan.height);
    const width = plan.width * scale;
    const height = plan.height * scale;
    host.innerHTML = `<div data-detail-candidate="${escapeHtml(plan.research.id)}" data-count="${state.count}" class="absolute bg-black" style="left:${(host.clientWidth - width) / 2}px;top:${(host.clientHeight - height) / 2}px;width:${width}px;height:${height}px">${signalSvg(plan, `${state.count} 房 ${plan.research.title}，副窗全部等大`)}</div>`;
    host.dataset.mainArea = String(Math.round((plan.research.area ?? 1) * 1e6) / 1e6);
    $("research-title").textContent = `${pad(state.count)} 房 · ${plan.research.title} · 主窗 ${plan.research.span}`;
  };
  var handleRender = async () => {
    const current = ++generation;
    if (Number(state.mainId) > state.count) state.mainId = "01";
    syncControls();
    $("research-loading").hidden = false;
    $("research-empty").hidden = true;
    await new Promise(requestAnimationFrame);
    if (current !== generation) return;
    try {
      dimensions = measure();
      $("research-dimensions").value = `${dimensions.width.toFixed(0)} × ${dimensions.height.toFixed(0)} px`;
      const key = `${dimensions.width}/${dimensions.height}/${state.count}/${state.ratio}/${state.mainId}/${state.weight}`;
      if (key !== lastKey) {
        const ratio = state.ratio === "portrait" ? 9 / 16 : 16 / 9;
        scene = calculateResearchLayouts({ ...dimensions, rooms: Array.from({ length: state.count }, (_, index) => ({ id: pad(index + 1), ratio })), mainRoomId: state.mainId, mainWeight: state.weight });
        if (!scene || scene.status !== "ready") throw new Error(scene?.reason ?? "当前输入无法生成排列。");
        lastKey = key;
      }
      const plans = scene.candidates.filter((plan) => {
        if (state.scope === "all") return true;
        if (state.scope === "frontier") return plan.research.frontier;
        return plan.research.moderate;
      });
      const selected = scene.candidates.find((plan) => plan.research.id === state.selectedId);
      if (state.view === "single" && !selected) {
        state.view = "compare";
        state.selectedId = null;
      }
      $("research-gallery").hidden = state.view === "single";
      $("research-detail").hidden = state.view !== "single";
      $("research-back").hidden = state.view !== "single";
      $("research-filters").hidden = state.view === "single";
      $("research-title").textContent = `${pad(state.count)} 房 · ${state.scope === "all" ? "全部有效行列组合" : state.scope === "frontier" ? "覆盖率与大小的有效取舍" : "适中主窗的多种排列"}`;
      $("research-summary").textContent = `${scene.moderateCount} 个适中候选 / ${scene.candidates.length} 个全部候选 · 优先面积 ${scene.range.min.toFixed(1)}～${scene.range.max.toFixed(1)}× · 各方案副窗始终等大`;
      renderGallery(plans);
      if (state.view === "single") renderDetail(selected);
      $("research-hint").textContent = state.view === "single" ? "灰色仅表示预览区，黑色为目标画墙外围留白 · 返回可比较其他行列组合" : "点击卡片看大图 · 相同主窗跨度也可能有不同的侧栏列数和底栏行数";
      $("research-audit").textContent = `${scene.candidates.length} / ${scene.candidates.length} 几何检查通过 · 无内部空槽 · 保持源比例`;
      $("research-audit").dataset.valid = "true";
      $("research-viewport").dataset.count = String(state.count);
      if (!plans.length && state.view === "compare") {
        $("research-empty").hidden = false;
        $("research-empty").querySelector("p").textContent = "当前筛选没有候选，可切换到全部候选。";
      }
      syncUrl();
    } catch (error) {
      $("research-empty").hidden = false;
      $("research-empty").querySelector("p").textContent = error instanceof Error ? error.message : "生成预览失败，请调整输入。";
      $("research-audit").textContent = "当前预览未完成";
      $("research-audit").dataset.valid = "false";
      $("research-grid").replaceChildren();
      $("research-detail-wall").replaceChildren();
    } finally {
      if (current === generation) $("research-loading").hidden = true;
    }
  };
  var scheduleRender = () => {
    generation++;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void handleRender();
    }, 40);
  };
  var resetSelection = () => {
    state.view = "compare";
    state.selectedId = null;
  };
  for (let count = 1; count <= 16; count++) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.count = String(count);
    button.textContent = pad(count);
    button.setAttribute("aria-label", `调研 ${count} 个房间`);
    button.className = "h-7 w-7 shrink-0 rounded font-mono text-[11px] text-[#8a99af] hover:bg-white/5 aria-[current=true]:bg-[#f3a77e] aria-[current=true]:text-[#1a120c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f3a77e] md:w-8";
    button.addEventListener("click", () => {
      state.count = count;
      resetSelection();
      scheduleRender();
    });
    $("research-counts").append(button);
  }
  for (const button of document.querySelectorAll("[data-scope]")) button.addEventListener("click", () => {
    state.scope = button.dataset.scope;
    resetSelection();
    scheduleRender();
  });
  $("research-resolution").addEventListener("change", (event) => {
    state.resolution = event.target.value;
    $("research-custom-error").textContent = "";
    scheduleRender();
  });
  $("research-ratio").addEventListener("change", (event) => {
    state.ratio = event.target.value;
    resetSelection();
    scheduleRender();
  });
  $("research-main").addEventListener("change", (event) => {
    state.mainId = event.target.value;
    scheduleRender();
  });
  $("research-weight").addEventListener("input", (event) => {
    state.weight = Number(event.target.value);
    scheduleRender();
  });
  $("research-back").addEventListener("click", () => {
    resetSelection();
    scheduleRender();
  });
  $("research-example").addEventListener("click", () => {
    state.count = 12;
    state.ratio = "landscape";
    state.resolution = "2246x994";
    state.weight = 4;
    state.mainId = "01";
    state.scope = "moderate";
    resetSelection();
    scheduleRender();
  });
  $("research-custom").addEventListener("submit", (event) => {
    event.preventDefault();
    const width = Number($("research-width").value);
    const height = Number($("research-height").value);
    if (![width, height].every((value) => Number.isInteger(value) && value >= 32 && value <= 16384)) {
      $("research-custom-error").textContent = "宽高必须为 32～16384 的整数";
      return;
    }
    state.width = width;
    state.height = height;
    $("research-custom-error").textContent = "";
    scheduleRender();
  });
  $("research-fullscreen").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if ($("research-viewport").requestFullscreen) await $("research-viewport").requestFullscreen();
      else {
        $("research-hint").textContent = "当前浏览器不支持全屏，请使用窗口最大化。";
        return;
      }
      scheduleRender();
    } catch {
      $("research-hint").textContent = "全屏未能开启，请使用窗口最大化。";
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.target.closest("input,select,textarea") || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    state.count = Math.min(16, Math.max(1, state.count + (event.key === "ArrowRight" ? 1 : -1)));
    resetSelection();
    scheduleRender();
  });
  var observer = new ResizeObserver(scheduleRender);
  observer.observe($("research-viewport"));
  window.addEventListener("resize", scheduleRender);
  document.addEventListener("fullscreenchange", scheduleRender);
  window.addEventListener("pagehide", () => {
    observer.disconnect();
    clearTimeout(timer);
  }, { once: true });
  void handleRender();
})();
