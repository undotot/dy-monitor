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
    const priority = priorityFor(options);
    const sizeRange = preferenceFor(options);
    const selection = priority === "coverage" ? "coverage" : priority === "balanced" ? "size-balanced" : "coverage-size-balanced";
    const plan = calculateRecursiveLayout({ ...options, mainWeight: sizeRange.target, family: variant.family, selection });
    return plan ? { ...plan, variant, selection: { mode: "manual", priority, sizeRange } } : null;
  };
  var compareLayoutVariants = (options) => {
    const items = LAYOUT_VARIANTS.map((variant) => calculateManualVariant(options, variant));
    const feasible = items.filter((plan) => plan?.status === "ready");
    const priority = priorityFor(options);
    const sizeRange = preferenceFor(options);
    if (priority !== "coverage" && feasible.length && feasible.every((plan) => plan.metrics.mainToAverageVideo > sizeRange.max + EPSILON2)) {
      const grid = calculateRecursiveLayout({ ...options, mainWeight: sizeRange.target, anchor: "top-left", family: "auto", selection: "equal-grid" });
      if (grid?.status === "ready") items.push({ ...grid, variant: EQUAL_GRID_VARIANT, selection: { mode: "manual", priority, sizeRange } });
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
    const priority = priorityFor(options);
    const sizeRange = preferenceFor(options);
    const weight = sizeRange.target;
    const fallback = feasible.find((plan) => plan.variant.id === "grid");
    const pool = priority === "coverage" ? feasible : fallback ? [fallback] : preferMainSizeRange(feasible, sizeRange, (plan) => plan.metrics.mainToAverageVideo ?? weight);
    const bestCoverage = Math.max(...pool.map((plan) => plan.metrics.videoCoverage));
    const score = (plan) => priority === "compromise" ? coverageSizeBalanceScore(plan.metrics.videoCoverage, plan.metrics.mainToAverageVideo, weight) : plan.metrics.videoCoverage;
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
    if (priority === "compromise" && !fallback && previous?.selection?.priority === priority && previous.selection.sizeRange?.target === weight && hasCompatiblePrevious(previous, chosen)) {
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
    const reason = fallback ? `${options.rooms.length} 房没有面积比 ${rangeLabel} 的适中放大解，自动回退 F · 全等大网格（${chosen.grid.columns} 列 × ${chosen.grid.rows} 行），视频覆盖 ${(chosen.metrics.videoCoverage * 100).toFixed(2)}%。` : priority !== "coverage" ? `自动${priority === "compromise" ? "综合均衡" : "大小均匀"} ${chosen.variant.letter} · ${chosen.variant.title}：${areaRatio === null ? "单房间" : `主/副面积 ${areaRatio.toFixed(2)}×，目标 ${weight}×，优先范围 ${rangeLabel}`}；视频覆盖 ${(chosen.metrics.videoCoverage * 100).toFixed(2)}%。${priority === "compromise" ? " 同时评价覆盖率和主副窗差距，覆盖收益不足时保留较小主窗。" : ""}` : `自动选择 ${chosen.variant.letter} · ${chosen.variant.title}：当前画墙下比较 ${feasible.length} 种可行排列，视频覆盖 ${(chosen.metrics.videoCoverage * 100).toFixed(2)}%，外围留白 ${(chosen.metrics.outerMarginRatio * 100).toFixed(2)}%（最少）。`;
    return { ...chosen, selection: {
      mode: "auto",
      priority,
      feasibleCount: feasible.length,
      bestCoverage,
      score: score(chosen),
      sizeRange,
      fallback: Boolean(fallback),
      stabilized,
      reason
    } };
  };

  // preview/ui-prototype-model.js
  var ROOM_LIBRARY = [
    ["01", "晚风", "峡谷对局 · 游戏实况", "game", "#69c7c4"],
    ["02", "海盐", "深夜电台 · 聊天", "studio", "#e4ac7c"],
    ["03", "阿木", "旷野漫游 · 主机游戏", "landscape", "#a2b2d3"],
    ["04", "团子", "今天也要好好生活", "room", "#e5bb8c"],
    ["05", "北岛", "不插电现场 · 音乐", "music", "#8dbca8"],
    ["06", "小满", "城市漫步 · 户外", "city", "#cab5d4"],
    ["07", "青禾", "峡谷练习 · 游戏实况", "game", "#9fbfb5"],
    ["08", "橘子", "周末音乐会", "studio", "#c69ca6"],
    ["09", "山川", "远方的风景", "landscape", "#90b3c3"],
    ["10", "可乐", "我的小小工作室", "room", "#c6b68d"],
    ["11", "林间", "吉他与晚风", "music", "#98baa5"],
    ["12", "白露", "夜色里的城市", "city", "#aca7d4"],
    ["13", "麦子", "一起看比赛", "game", "#c8ae8a"],
    ["14", "星野", "晚安聊天室", "studio", "#8eabbc"],
    ["15", "南风", "去有风的地方", "landscape", "#bcb798"],
    ["16", "知夏", "日常记录", "room", "#c3a2aa"]
  ].map(([id, name, title, scene, color]) => ({ id, name, title, scene, color, ratio: 16 / 9 }));
  var createPrototypeState = (count = 6) => ({
    rooms: ROOM_LIBRARY.slice(0, Math.max(1, Math.min(16, count))).map((room, index) => ({ ...room, status: index < 8 ? "playing" : "queued", muted: false, volume: 65, danmaku: true })),
    selectedId: "01",
    focusedId: "01",
    soloId: "01",
    globalMuted: false,
    beforeSoloMuted: true,
    panel: null,
    panelPinned: false,
    arranging: false,
    arrangeSourceId: null,
    clean: false,
    roomTab: "added",
    query: "",
    pendingIds: [],
    followFocus: false,
    toast: "",
    themeChoice: null
  });
  var isRoomAudible = (state, room) => room.status === "playing" && !state.globalMuted && !room.muted && room.volume > 0 && (!state.soloId || state.soloId === room.id);
  var reducePrototype = (state, action) => {
    const roomId = action.roomId ?? state.selectedId;
    const target = state.rooms.find((room) => room.id === roomId);
    const updateRoom = (updates) => ({ ...state, rooms: state.rooms.map((room) => room.id === roomId ? { ...room, ...updates } : room) });
    const notice = (next, toast) => ({ ...next, toast });
    switch (action.type) {
      case "select": {
        if (!target) return state;
        if (!state.arranging) return { ...state, selectedId: roomId, toast: "" };
        if (!state.arrangeSourceId) return notice({ ...state, arrangeSourceId: roomId }, `已选择 ${target.name}，再点一个房间交换位置`);
        if (state.arrangeSourceId === roomId) return notice(state, "请选择另一个房间，或取消换位");
        const source = state.rooms.find((room) => room.id === state.arrangeSourceId);
        return notice({
          ...state,
          rooms: state.rooms.map((room) => room.id === source.id ? target : room.id === target.id ? source : room),
          focusedId: state.focusedId === source.id ? target.id : state.focusedId === target.id ? source.id : state.focusedId,
          arranging: false,
          arrangeSourceId: null
        }, `${source.name} 与 ${target.name} 已交换位置`);
      }
      case "focus": {
        if (!target) return state;
        const focusedId = state.focusedId === roomId ? null : roomId;
        return notice({ ...state, focusedId, ...state.followFocus && focusedId ? { soloId: focusedId, globalMuted: false } : {} }, focusedId ? `已放大 ${target.name}` : "已恢复平铺");
      }
      case "mode":
        return {
          ...state,
          focusedId: action.value === "focus" ? state.selectedId : null,
          ...action.value === "focus" && state.followFocus ? { soloId: state.selectedId, globalMuted: false } : {}
        };
      case "play":
        return target ? updateRoom({ status: target.status === "playing" ? "paused" : "playing" }) : state;
      case "mute":
        return target ? updateRoom({ muted: !target.muted }) : state;
      case "volume":
        return target ? updateRoom({ volume: Math.max(0, Math.min(100, Number(action.value) || 0)) }) : state;
      case "danmaku":
        return target ? updateRoom({ danmaku: !target.danmaku }) : state;
      case "solo": {
        if (!target) return state;
        if (state.soloId === roomId) return notice({ ...state, soloId: null, globalMuted: state.beforeSoloMuted }, "已取消仅听，恢复之前的全局声音状态");
        const next = {
          ...updateRoom({ muted: false }),
          soloId: roomId,
          globalMuted: false,
          beforeSoloMuted: state.soloId ? state.beforeSoloMuted : state.globalMuted
        };
        return notice(next, target.volume === 0 ? `仅听 ${target.name}，当前音量为 0` : `仅听 ${target.name}，选中其他房间不会切换声音`);
      }
      case "global-mute":
        return { ...state, globalMuted: !state.globalMuted };
      case "panel":
        return { ...state, panel: state.panel === action.value ? null : action.value, toast: "" };
      case "close-panel":
        return { ...state, panel: null };
      case "pin":
        return { ...state, panelPinned: !state.panelPinned };
      case "arrange":
        return notice({ ...state, panel: null, arranging: true, arrangeSourceId: null }, "点选要移动的房间，再点目标房间");
      case "cancel-arrange":
        return { ...state, arranging: false, arrangeSourceId: null, toast: "" };
      case "clean":
        return { ...state, clean: !state.clean, panel: null };
      case "query":
        return { ...state, query: action.value };
      case "room-tab":
        return { ...state, roomTab: action.value, query: "" };
      case "pending":
        return { ...state, pendingIds: state.pendingIds.includes(roomId) ? state.pendingIds.filter((id) => id !== roomId) : [...state.pendingIds, roomId] };
      case "add": {
        const additions = ROOM_LIBRARY.filter((room) => state.pendingIds.includes(room.id) && !state.rooms.some((item) => item.id === room.id));
        const available = Math.max(0, 8 - state.rooms.filter((room) => room.status === "playing" || room.status === "paused").length);
        return notice({ ...state, rooms: [...state.rooms, ...additions.map((room, index) => ({ ...room, status: index < available ? "playing" : "queued", volume: 65, muted: false, danmaku: true }))].slice(0, 16), pendingIds: [], roomTab: "added", query: "" }, `已添加 ${additions.length} 个模拟房间`);
      }
      case "remove": {
        if (!target) return state;
        const rooms = state.rooms.filter((room) => room.id !== roomId);
        return notice({
          ...state,
          rooms,
          selectedId: state.selectedId === roomId ? rooms[0]?.id ?? null : state.selectedId,
          focusedId: state.focusedId === roomId ? null : state.focusedId,
          soloId: state.soloId === roomId ? null : state.soloId,
          globalMuted: state.soloId === roomId ? true : state.globalMuted,
          panel: null
        }, state.soloId === roomId ? "已移除仅听房间，现已全部静音" : `已移除 ${target.name}`);
      }
      case "stop":
        return target ? notice({ ...updateRoom({ status: "stopped" }), panel: null }, `已停止 ${target.name} 的模拟连接`) : state;
      case "retry":
        return target ? notice(updateRoom({ status: "playing" }), "已恢复模拟播放") : state;
      case "all-start":
        return notice({ ...state, rooms: state.rooms.map((room, index) => ({ ...room, status: index < 8 ? "playing" : "queued" })), panel: null }, "已启动模拟房间，超过 8 路的房间等待播放额度");
      case "all-stop":
        return notice({ ...state, rooms: state.rooms.map((room) => ({ ...room, status: "stopped" })), panel: null }, "已停止所有模拟连接");
      case "follow":
        return { ...state, followFocus: !state.followFocus };
      case "count":
        return { ...createPrototypeState(action.value), themeChoice: state.themeChoice };
      case "reset":
        return createPrototypeState(state.rooms.length || 6);
      default:
        return state;
    }
  };

  // preview/ui-theme-prototype.js
  var THEMES = [
    {
      id: "graphite",
      letter: "A",
      name: "石墨蓝",
      english: "GRAPHITE",
      subtitle: "克制、清楚，适合长时间监看",
      detail: "冷灰外壳与柔和蓝色操作提示。视频始终是视觉中心。",
      recommended: true,
      swatches: ["bg-[#121920]", "bg-[#202b37]", "bg-[#8fc5ed]", "bg-[#dce8ef]"],
      tokens: "[--base:#111820] [--panel:#18222d] [--raised:#202d3a] [--line:#344456] [--text:#e3edf5] [--muted:#a6b7c9] [--accent:#9bcdf2] [--accent-ink:#112333] [--active:#2c465a] [--good:#86d3b0] [--warn:#e6b77f] [--danger:#f0a7a4]"
    },
    {
      id: "amber",
      letter: "B",
      name: "暖黑琥珀",
      english: "AFTER HOURS",
      subtitle: "温暖、沉稳，偏向夜间观看",
      detail: "炭黑与暖灰降低冷色感，琥珀色明确标记当前操作。",
      recommended: false,
      swatches: ["bg-[#1b1917]", "bg-[#302b25]", "bg-[#e7b878]", "bg-[#eee4d4]"],
      tokens: "[--base:#1b1917] [--panel:#25211d] [--raised:#342d26] [--line:#51463b] [--text:#f0e7dc] [--muted:#c2b29f] [--accent:#edbd7c] [--accent-ink:#302116] [--active:#51402c] [--good:#a5cdab] [--warn:#f0c184] [--danger:#efa7a0]"
    },
    {
      id: "porcelain",
      letter: "C",
      name: "雾白",
      english: "DAYLIGHT",
      subtitle: "明亮、轻巧，适合白天与 iPad",
      detail: "暖白面板与深青操作色。画墙保持黑底，信息区更易扫读。",
      recommended: false,
      swatches: ["bg-[#f1f2ed]", "bg-[#e3e8e2]", "bg-[#22665e]", "bg-[#283d38]"],
      tokens: "[--base:#f1f2ed] [--panel:#fafbf7] [--raised:#e8ede7] [--line:#c6d1c7] [--text:#263c35] [--muted:#5c7165] [--accent:#21665b] [--accent-ink:#ffffff] [--active:#dcece4] [--good:#236e4c] [--warn:#936321] [--danger:#a13f3a]"
    }
  ];
  var DEVICES = {
    desktop: { label: "桌面", caption: "鼠标操作 · 固定控制条", width: 1440, height: 900, touch: false, icon: "monitor" },
    ipad: { label: "iPad 横屏", caption: "触屏操作 · 48px 核心按钮", width: 1194, height: 834, touch: true, icon: "tablet" },
    split: { label: "iPad 分屏", caption: "窄窗口 · 两行控制 + 底部面板", width: 600, height: 900, touch: true, icon: "split" },
    fluid: { label: "跟随窗口", caption: "实际窗口宽度 · 可直接操作", width: 0, height: 0, touch: true, icon: "expand" }
  };
  var ICONS = {
    monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
    tablet: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M18 11v2"/>',
    split: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M11 4v16"/>',
    rooms: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    focus: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/><rect x="7" y="7" width="10" height="10" rx="1"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    speaker: '<path d="M11 5 6 9H3v6h3l5 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    mute: '<path d="M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6"/>',
    headphones: '<path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/>',
    settings: '<path d="m9 3-.6 2.1-2 .9-2-.6-2 3.5 1.5 1.5v2.3L2.4 14l2 3.5 2-.6 2 .9L9 20h4l.6-2.2 2-.9 2 .6 2-3.5-1.5-1.3v-2.3L19.6 9l-2-3.5-2 .6-2-.9L13 3Z"/><circle cx="11" cy="11.5" r="3"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    pause: '<path d="M8 5v14m8-14v14"/>',
    play: '<path d="m8 4 12 8-12 8V4Z"/>',
    chat: '<path d="M21 14a3 3 0 0 1-3 3H9l-6 4V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3Z"/><path d="M7 8h10M7 12h6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    swap: '<path d="M3 7h17m-5-5 5 5-5 5M21 17H4m5-5-5 5 5 5"/>',
    pin: '<path d="M8 3h8l-1 6 4 4v2H5v-2l4-4-1-6Zm4 12v7"/>',
    stop: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
    retry: '<path d="M20 7v5h-5M4 17a8 8 0 0 0 15-5M4 12a8 8 0 0 1 14-5"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    minus: '<path d="M4 12h16"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>'
  };
  var icon = (name, classes = "h-5 w-5") => `<svg class="${classes} shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ICONS.more}</svg>`;
  var escapeHtml = (text) => String(text ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  var params = new URLSearchParams(location.search);
  var findTheme = (id) => THEMES.find((theme) => theme.id === id) ?? THEMES[0];
  var review = {
    theme: findTheme(params.get("theme")).id,
    view: ["compare", "prototype", "devices", "live"].includes(params.get("view")) ? params.get("view") : "compare",
    device: Object.prototype.hasOwnProperty.call(DEVICES, params.get("device")) ? params.get("device") : "desktop",
    count: Math.min(16, Math.max(1, Number(params.get("count")) || 6)),
    chosen: null
  };
  try {
    review.chosen = THEMES.some((theme) => theme.id === localStorage.getItem("monitor-ui-theme-choice")) ? localStorage.getItem("monitor-ui-theme-choice") : null;
  } catch {
  }
  var appState = createPrototypeState(review.count);
  var instances = [];
  var renderFrame = 0;
  var root = document.getElementById("prototype-review");
  var sceneSvg = (room) => {
    const common = '<rect width="1600" height="900" fill="#172d31"/>';
    const patterns = {
      game: `${common}<path d="M0 0h1600v900H0Z" fill="#203b39"/><path d="M0 680 340 620 560 390 780 470 1100 190 1600 80v210l-420 80-360 270-230-60-240 220L0 900Z" fill="#315957"/><path d="M0 790 370 690 610 475 800 550 1160 280 1600 150" fill="none" stroke="#66949a" stroke-width="74"/><path d="M80 850 130 210 590 110 1110 80 1500 70 1480 680 1040 780 550 800Z" fill="none" stroke="#9b9678" stroke-width="48"/><path d="m260 780 110-250 190-80 320-180 420-80M180 300l340 50 320 180 300 80 270 100" fill="none" stroke="#6e7961" stroke-width="32"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<path d="m${50 + n * 150} ${120 + n % 3 * 235} 55-85 70 90-50-25Z" fill="${n % 2 ? "#294b38" : "#163c32"}"/>`).join("")}
      <path d="m150 690 60-45 70 50-60 80Z" fill="#82aeb0"/><path d="m1310 130 80-45 60 55-75 65Z" fill="#ba8380"/>
      ${[[440, 620], [640, 490], [950, 400], [1160, 285], [900, 505], [550, 320], [1250, 640]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i < 4 ? 22 : 14}" fill="${i < 4 ? "#9bd2d4" : "#e6a39b"}"/><circle cx="${x}" cy="${y}" r="${i < 4 ? 32 : 22}" fill="none" stroke="${i < 4 ? "#b7e4de" : "#cc8b80"}" stroke-width="3"/><rect x="${x - 24}" y="${y - 48}" width="48" height="6" rx="3" fill="#9ed4ac"/>`).join("")}
      <rect x="570" y="26" width="460" height="65" rx="8" fill="#14252b" fill-opacity=".92"/><text x="650" y="70" font-family="Consolas,monospace" font-size="30" fill="#9ad7dd">12</text><text x="800" y="69" text-anchor="middle" font-family="Consolas,monospace" font-size="22" fill="#c4d7d5">18:42</text><text x="925" y="70" font-family="Consolas,monospace" font-size="30" fill="#e3ada8">08</text><rect x="36" y="674" width="190" height="190" rx="6" fill="#102d2e" stroke="#668c81" stroke-width="3"/><path d="m52 845 155-150M60 700l140 140" stroke="#729f92" stroke-width="6"/><circle cx="130" cy="760" r="8" fill="#a8e5d5"/>`,
      studio: '<rect width="1600" height="900" fill="#655649"/><rect x="50" y="60" width="1500" height="720" rx="10" fill="#7d6d5d"/><path d="M160 50v660m75-660v660m75-660v660m75-660v660m75-660v660m75-660v660M1120 50v660m75-660v660m75-660v660m75-660v660m75-660v660" stroke="#55483e" stroke-width="18"/><rect x="575" y="160" width="430" height="200" rx="20" fill="#c5b098"/><text x="790" y="247" text-anchor="middle" font-family="Georgia,serif" font-size="46" fill="#473c32">on air.</text><text x="790" y="303" text-anchor="middle" font-family="Consolas,monospace" font-size="22" fill="#6a5643">LATE NIGHT RADIO</text><ellipse cx="800" cy="740" rx="310" ry="62" fill="#463a33"/><path d="M705 680q-40-190 95-190t95 190Z" fill="#333b39"/><circle cx="800" cy="443" r="68" fill="#b59a80"/><path d="M731 440q0-125 107-63l34 70-55-40-86 33" fill="#3e3832"/><path d="m1050 710-130-165M920 545h-74" stroke="#242c2b" stroke-width="15"/><rect x="819" y="512" width="42" height="95" rx="21" fill="#394742"/><path d="M1200 685h130l-20-180h-90Z" fill="#b2a079"/><path d="M1265 510V340m0 50q-100-90-100 10m100 30q100-100 100-5" fill="none" stroke="#344c3b" stroke-width="22"/><rect y="755" width="1600" height="145" fill="#443b35"/>',
      landscape: '<rect width="1600" height="900" fill="#8ba8b5"/><circle cx="1250" cy="180" r="85" fill="#e8d4af"/><path d="m0 550 250-300 250 260 280-350 300 350 220-190 300 260v320H0Z" fill="#687d89"/><path d="m0 650 350-220 400 200 250-270 600 260v280H0Z" fill="#8c928b"/><path d="m0 760 400-150 400 180 420-200 380 120v190H0Z" fill="#c0af89"/><path d="m430 900 350-230 310-90-180 150-140 170" fill="#d8c6a1"/><path d="M1160 702h90m-55-45v80" stroke="#4a6267" stroke-width="12"/><path d="m1160 662 35-20 35 20-35 28Z" fill="#4d6465"/><text x="70" y="810" font-size="25" font-family="Consolas,monospace" fill="#384e53">THE OPEN WORLD</text>',
      room: '<rect width="1600" height="900" fill="#ada492"/><rect x="80" y="95" width="590" height="470" fill="#677f7a"/><path d="M375 95v470M80 330h590" stroke="#d0c6af" stroke-width="20"/><path d="M100 470 240 230 420 460 550 260 650 460v85H100Z" fill="#435f59"/><rect x="815" y="180" width="500" height="290" rx="10" fill="#d0c2a8"/><path d="M900 400v-150l100 150 75-160 130 160" fill="none" stroke="#977c5f" stroke-width="22"/><rect x="230" y="650" width="1120" height="70" rx="8" fill="#5a554a"/><path d="M300 720v180m1000-180v180" stroke="#56534a" stroke-width="30"/><rect x="700" y="500" width="280" height="160" rx="10" fill="#414f4c"/><rect x="720" y="518" width="240" height="125" fill="#87a49c"/><path d="m820 580 30-20 35 30" stroke="#d5ddc9" stroke-width="5" fill="none"/><path d="m1110 640 50-210m-35 150q-100-110-60-135m85 55q130-120 125-35" fill="none" stroke="#4f6c50" stroke-width="24"/><path d="M1070 600h180l-30 100h-120Z" fill="#9a7860"/>',
      music: '<rect width="1600" height="900" fill="#243a3c"/><path d="M120 0v900m230-900v900m230-900v900m440-900v900m230-900v900m230-900v900" stroke="#314b4a" stroke-width="65"/><circle cx="800" cy="350" r="200" fill="#526d62"/><circle cx="800" cy="350" r="135" fill="#9aaa8e"/><circle cx="800" cy="350" r="50" fill="#324d46"/><path d="m880 200 110 220" stroke="#c9c0a1" stroke-width="12"/><path d="M400 680h800" stroke="#697b6b" stroke-width="2"/>' + Array.from({ length: 44 }, (_, i) => `<rect x="${400 + i * 18}" y="${680 - (20 + i * 29 % 115)}" width="6" height="${40 + i * 29 % 115 * 2}" rx="3" fill="${i % 3 ? "#a3b39b" : "#d0bea0"}"/>`).join(""),
      city: '<rect width="1600" height="900" fill="#536475"/><circle cx="1270" cy="170" r="70" fill="#d4c5a7"/><path d="M0 450h120V240h170v380h90V310h150v320h80V180h220v440h70V370h190V250h140v390h80V390h190v510H0Z" fill="#34434f"/>' + Array.from({ length: 14 }, (_, i) => `<path d="M${70 + i * 105} ${460 - i % 4 * 60}v130" stroke="#9b9d8b" stroke-width="13" stroke-dasharray="15 18"/>`).join("") + '<path d="M0 900 700 590h200l700 310" fill="#5d6164"/><path d="m800 900 1-210" stroke="#c3b590" stroke-width="12" stroke-dasharray="55 45"/><path d="M170 725h180v72H170Zm1060-10h140v70h-140Z" fill="#b1aba0"/>'
    };
    return `<svg class="block h-full w-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${patterns[room.scene] ?? patterns.game}</svg>`;
  };
  var appButton = (name, label, action, options = {}) => `<button type="button" data-action="${action}" ${options.roomId ? `data-room="${options.roomId}"` : ""} ${options.value ? `data-value="${options.value}"` : ""} aria-label="${escapeHtml(options.aria ?? label)}" ${options.pressed !== void 0 ? `aria-pressed="${options.pressed}"` : ""} class="${options.primary ? "bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-110" : options.pressed ? "bg-[var(--active)] text-[var(--accent)]" : "text-[var(--text)] hover:bg-[var(--raised)]"} ${options.touch ? "min-h-12 min-w-12" : "min-h-10 min-w-10"} inline-flex shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-[14px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${options.classes ?? ""}">${name ? icon(name) : ""}${options.iconOnly ? "" : `<span>${escapeHtml(label)}</span>`}</button>`;
  var statusLabel = (room) => ({ playing: "播放中", paused: "已暂停", stopped: "已停止", error: "连接异常", queued: "等待播放额度" })[room.status] ?? "等待连接";
  var findSelected = (state) => state.rooms.find((room) => room.id === state.selectedId);
  var renderToolbar = (state, device) => {
    const compact = device.width < 768;
    const touch = device.touch;
    const button = (name, label, action, options = {}) => appButton(name, label, action, { touch, ...options });
    return `<header class="${touch ? "h-[76px] px-5" : "h-[68px] px-6"} flex shrink-0 items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--base)]" data-app-toolbar>
    <div class="flex min-w-0 items-center gap-3"><div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent)] text-[var(--accent-ink)]">${icon("rooms", "h-[21px] w-[21px]")}</div><div><h2 class="font-display text-[19px] font-semibold tracking-wide">监控室<span class="ml-2 font-mono text-[11px] font-normal tracking-[.18em] text-[var(--muted)]">${compact ? "" : "MONITOR"}</span></h2><p class="mt-0.5 text-[11px] text-[var(--muted)]">我的观看空间</p></div></div>
    <nav aria-label="监看全局操作" class="flex items-center gap-2">${button("rooms", "房间", "panel", { value: "rooms", pressed: state.panel === "rooms" })}
    ${compact ? "" : `<div class="flex rounded-[10px] border border-[var(--line)] p-1">${button("rooms", "平铺", "mode", { value: "grid", pressed: !state.focusedId })}${button("focus", "放大", "mode", { value: "focus", pressed: Boolean(state.focusedId) })}</div>`}
    ${button(state.globalMuted ? "mute" : "speaker", "声音", "panel", { value: "audio", pressed: state.panel === "audio", iconOnly: compact })}
    ${compact ? "" : button("settings", "设置", "panel", { value: "settings", pressed: state.panel === "settings", iconOnly: device.width < 1e3 })}
    ${button("more", "全局更多", "panel", { value: "global", iconOnly: true, pressed: state.panel === "global" })}</nav>
  </header>`;
  };
  var renderStatus = (state, compact) => {
    const audible = state.rooms.filter((room) => isRoomAudible(state, room));
    const solo = state.rooms.find((room) => room.id === state.soloId);
    return `<div class="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-5 text-[11px] text-[var(--muted)]" data-status-row>
    <div class="flex items-center gap-4"><span class="font-mono"><strong class="text-[var(--text)]">${String(state.rooms.length).padStart(2, "0")}</strong> / 16 房间</span><span class="flex items-center gap-1.5"><span class="h-1.5 w-1.5 rounded-full bg-[var(--good)]"></span>${state.rooms.filter((room) => room.status === "playing").length} 播放${state.rooms.some((room) => room.status === "queued") ? ` · ${state.rooms.filter((room) => room.status === "queued").length} 等待` : ""}</span>${compact ? "" : `<span>${state.focusedId ? "放大 · 自动适配" : "平铺 · 等比例显示"}</span>`}</div>
    <span class="flex shrink-0 items-center gap-1.5 ${audible.length ? "text-[var(--accent)]" : ""}" data-audio-status>${icon(audible.length ? "headphones" : "mute", "h-3.5 w-3.5")}${state.globalMuted ? "全局静音" : solo ? `仅听 ${escapeHtml(solo.name)}` : audible.length ? `${audible.length} 房出声` : "全部静音"}</span></div>`;
  };
  var renderControls = (state, device) => {
    const room = findSelected(state);
    const compact = device.width < 768;
    const touch = device.touch;
    const button = (name, label, action, options = {}) => appButton(name, label, action, { touch, roomId: room?.id, ...options });
    if (!room) return `<footer class="flex h-[108px] shrink-0 items-center justify-center gap-4 border-t border-[var(--line)] bg-[var(--panel)] text-[var(--muted)]">选择或添加一个房间${appButton("plus", "添加房间", "panel", { value: "rooms", primary: true, touch })}</footer>`;
    const audible = isRoomAudible(state, room);
    return `<footer class="shrink-0 border-t border-[var(--line)] bg-[var(--panel)] px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3" data-room-controls>
    <div class="mb-3 flex min-h-6 items-center justify-between gap-3"><div class="flex min-w-0 items-center gap-2.5"><span class="h-6 w-1 rounded-full bg-[var(--accent)]"></span><strong class="truncate text-[16px] font-semibold">${escapeHtml(room.name)}</strong><span class="rounded border border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">当前操作</span><span class="text-[12px] text-[var(--muted)]">${statusLabel(room)}</span>${audible ? `<span class="flex items-center gap-1 text-[11px] text-[var(--good)]">${icon("speaker", "h-3 w-3")}正在出声</span>` : ""}</div><span class="shrink-0 font-mono text-[11px] text-[var(--muted)]">ROOM ${room.id}</span></div>
    <div class="${compact ? "grid grid-cols-5 gap-2" : "flex items-center gap-2"}">
    ${button(room.status === "playing" ? "pause" : "play", room.status === "playing" ? "暂停" : "播放", "play", { classes: compact ? "flex-col gap-1 px-1 text-[12px]" : "" })}
    ${button(room.muted ? "speaker" : "mute", room.muted ? "取消静音" : "静音", "mute", { pressed: room.muted, classes: compact ? "flex-col gap-1 px-1 text-[12px]" : "" })}
    ${compact ? "" : button("headphones", state.soloId === room.id ? "正在仅听" : "仅听此房", "solo", { pressed: state.soloId === room.id })}
    ${compact ? "" : '<span class="mx-1 h-6 w-px bg-[var(--line)]"></span>'}
    ${button("focus", state.focusedId === room.id ? "恢复平铺" : "放大", "focus", { primary: state.focusedId !== room.id, pressed: state.focusedId === room.id, classes: compact ? "flex-col gap-1 px-1 text-[12px]" : "" })}
    ${button("chat", "弹幕", "panel", { value: "danmaku", pressed: state.panel === "danmaku", classes: compact ? "flex-col gap-1 px-1 text-[12px]" : "" })}
    ${compact ? "" : button("speaker", `音量 ${room.volume}%`, "panel", { value: "audio", classes: "ml-auto border border-[var(--line)]", aria: `调节 ${room.name} 音量` })}
    ${button("more", compact ? "更多" : "房间更多", "panel", { value: "room-more", iconOnly: !compact, classes: compact ? "flex-col gap-1 px-1 text-[12px]" : "" })}
    </div></footer>`;
  };
  var panelRow = (name, title, text, action, options = {}) => `<button type="button" data-action="${action}" ${options.value ? `data-value="${options.value}"` : ""} class="flex min-h-[56px] w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[var(--raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${options.danger ? "text-[var(--danger)]" : ""}" ${options.pressed !== void 0 ? `aria-pressed="${options.pressed}"` : ""}>${icon(name)}<span class="min-w-0 flex-1"><span class="block text-[14px] font-medium">${title}</span>${text ? `<span class="mt-1 block text-[11px] text-[var(--muted)]">${text}</span>` : ""}</span>${options.pressed ? `<span class="text-[var(--accent)]">${icon("check", "h-4 w-4")}</span>` : icon("arrow", "h-4 w-4 text-[var(--muted)]")}</button>`;
  var panelTitle = (state) => ({ rooms: "房间", audio: "声音", danmaku: `${findSelected(state)?.name ?? "房间"} · 弹幕`, settings: "设置", global: "监看操作", "room-more": `${findSelected(state)?.name ?? "房间"} · 更多` })[state.panel] ?? "面板";
  var renderRoomList = (state) => {
    const source = state.roomTab === "added" ? state.rooms : ROOM_LIBRARY.filter((room, i) => state.roomTab === "history" ? [1, 5, 8, 10].includes(i) : state.roomTab === "group" ? [2, 7, 11].includes(i) : true);
    const query = state.query.trim().toLowerCase();
    const rooms = source.filter((room) => `${room.id} ${room.name} ${room.title} https://www.douyu.com/${room.id}`.toLowerCase().includes(query));
    if (!rooms.length) return `<div class="py-14 text-center"><div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--raised)] text-[var(--muted)]">${icon("search")}</div><p class="text-[14px]">没有找到匹配的房间</p><p class="mt-2 text-[12px] text-[var(--muted)]">换一个主播名或房间号试试</p></div>`;
    return rooms.map((room) => {
      const added = state.rooms.some((item) => item.id === room.id);
      const pending = state.pendingIds.includes(room.id);
      return `<button type="button" data-action="${state.roomTab === "added" ? "room-select" : "pending"}" data-room="${room.id}" ${added && state.roomTab !== "added" ? "disabled" : ""} ${state.roomTab !== "added" ? `role="checkbox" aria-checked="${pending}"` : `aria-pressed="${state.selectedId === room.id}"`} class="my-1 flex min-h-[68px] w-full items-center gap-3 rounded-xl p-3 text-left ${state.selectedId === room.id && state.roomTab === "added" ? "bg-[var(--active)]" : "hover:bg-[var(--raised)]"} disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--raised)] font-mono text-[13px] text-[var(--accent)]">${room.id}</span><span class="min-w-0 flex-1"><strong class="block truncate text-[14px] font-medium">${room.name}</strong><span class="mt-1 block truncate text-[11px] text-[var(--muted)]">${state.roomTab === "added" ? statusLabel(room) + " · " : ""}${room.title}</span></span>${state.roomTab === "added" ? state.selectedId === room.id ? icon("check", "h-4 w-4 text-[var(--accent)]") : "" : added ? '<span class="text-[11px] text-[var(--muted)]">已添加</span>' : `<span class="flex h-5 w-5 items-center justify-center rounded border border-[var(--line)] ${pending ? "bg-[var(--accent)] text-[var(--accent-ink)]" : ""}">${pending ? icon("check", "h-3.5 w-3.5") : ""}</span>`}</button>`;
    }).join("");
  };
  var renderPanelContent = (state, device) => {
    const room = findSelected(state);
    const button = (name, label, action, options = {}) => appButton(name, label, action, { touch: device.touch, ...options });
    if (state.panel === "rooms") return `<div class="flex h-full min-h-0 flex-col"><div class="px-5 pt-3"><label class="flex h-12 items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--base)] px-3 text-[var(--muted)]">${icon("search", "h-4 w-4")}<input data-room-search type="search" value="${escapeHtml(state.query)}" aria-label="搜索模拟房间" placeholder="搜索主播名、房号或链接" class="min-w-0 flex-1 bg-transparent text-[16px] text-[var(--text)] outline-none placeholder:text-[var(--muted)]"></label><p class="mt-2 text-[10px] text-[var(--muted)]">本地示例房间库 · 已添加 ${state.rooms.length}/16</p><div class="mt-4 grid grid-cols-4 gap-1 rounded-lg bg-[var(--base)] p-1" role="tablist" aria-label="房间来源">${[["added", "已添加"], ["following", "关注"], ["history", "历史"], ["group", "团播"]].map(([id, text]) => `<button type="button" role="tab" aria-selected="${state.roomTab === id}" data-action="room-tab" data-value="${id}" class="min-h-11 rounded-md px-1 text-[12px] ${state.roomTab === id ? "bg-[var(--raised)] text-[var(--accent)]" : "text-[var(--muted)]"}">${text}</button>`).join("")}</div></div><div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3" data-room-list>${renderRoomList(state)}</div><div class="flex min-h-[80px] items-center justify-between gap-2 border-t border-[var(--line)] px-5 py-3"><span class="text-[12px] text-[var(--muted)]" data-pending-label>已选 ${state.pendingIds.length} 个</span>${state.roomTab === "added" ? button("plus", "添加房间", "room-tab", { value: "following", primary: true }) : `<button type="button" data-action="add" ${state.pendingIds.length ? "" : "disabled"} class="min-h-12 rounded-lg bg-[var(--accent)] px-4 text-[14px] font-medium text-[var(--accent-ink)] disabled:opacity-40" data-add-button>添加 ${state.pendingIds.length} 个</button>`}</div></div>`;
    if (state.panel === "audio") return `<div class="space-y-5 p-5"><div class="rounded-xl border border-[var(--line)] bg-[var(--base)] p-4"><p class="text-[11px] tracking-wider text-[var(--muted)]">当前操作房间</p><div class="mt-2 flex items-center justify-between"><strong class="text-[18px]">${room?.name ?? "未选择"}</strong><span class="font-mono text-[13px] text-[var(--accent)]" data-volume-output>${room?.volume ?? 0}%</span></div><div class="mt-4 flex min-h-12 items-center gap-3">${button("minus", "音量减少 5%", "volume-down", { iconOnly: true })}<input data-volume-input type="range" min="0" max="100" step="5" value="${room?.volume ?? 0}" aria-label="当前房间音量" class="h-12 min-w-0 flex-1 cursor-pointer accent-[var(--accent)]">${button("plus", "音量增加 5%", "volume-up", { iconOnly: true })}</div><div class="mt-2 grid grid-cols-3 gap-2">${[0, 50, 100].map((value) => button("", `${value}%`, "volume-preset", { value: String(value), classes: "border border-[var(--line)] px-1 text-[12px]" })).join("")}</div></div><div class="space-y-1">${panelRow("headphones", state.soloId === room?.id ? `正在仅听 ${room?.name}` : `仅听 ${room?.name ?? "当前房间"}`, "切换选中房间不会改变听音对象", "solo", { pressed: state.soloId === room?.id })}${panelRow("mute", state.globalMuted ? "解除全局静音" : "全部静音", "保留各房间的音量设置", "global-mute", { pressed: state.globalMuted })}${panelRow("focus", "声音跟随大窗", state.followFocus ? "主动切换大窗时，同时切换仅听对象" : "已关闭 · 放大和声音分别控制", "follow", { pressed: state.followFocus })}</div><p class="border-t border-[var(--line)] pt-4 text-[11px] leading-6 text-[var(--muted)]">仅听目标：${state.rooms.find((item) => item.id === state.soloId)?.name ?? "未设置"}<br>这里演示声音状态，不播放实际音频。</p></div>`;
    if (state.panel === "danmaku") return `<div class="flex h-full flex-col"><div class="flex items-center justify-between border-b border-[var(--line)] px-5 py-3"><span class="text-[12px] text-[var(--muted)]">只作用于 ${room?.name ?? "当前房间"}</span>${button("chat", room?.danmaku ? "弹幕已开" : "弹幕已关", "danmaku", { pressed: room?.danmaku })}</div><div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">${room?.danmaku ? [["小行星", "今天的状态很好！", "20:41"], ["青柠汽水", "来了来了，晚上好", "20:42"], ["路过的猫", "这波配合很漂亮", "20:42"], ["山有木", "慢慢来，不着急", "20:43"], ["白日梦", "好喜欢这个画面", "20:43"], ["七月", "再来一局～", "20:44"]].map(([name, text, time]) => `<div><p class="mb-1.5 flex justify-between text-[11px] text-[var(--muted)]"><span>${name}</span><span class="font-mono">${time}</span></p><p class="text-[14px] leading-6">${text}</p></div>`).join("") : '<p class="py-10 text-center text-[14px] text-[var(--muted)]">已关闭当前房间的模拟弹幕</p>'}</div><p class="border-t border-[var(--line)] p-5 text-[11px] leading-5 text-[var(--muted)]">弹幕独立于视频显示。打开面板不改变单个画格的比例。</p></div>`;
    if (state.panel === "settings") return `<div class="space-y-5 p-5"><p class="text-[11px] tracking-wider text-[var(--muted)]">观看偏好</p>${panelRow("focus", "声音跟随大窗", state.followFocus ? "已开启" : "关闭 · 听音和放大独立", "follow", { pressed: state.followFocus })}<div class="rounded-xl bg-[var(--base)] p-4 text-[13px] leading-7"><p class="flex justify-between"><span class="text-[var(--muted)]">视频显示</span><span>保持原比例</span></p><p class="flex justify-between"><span class="text-[var(--muted)]">放大布局</span><span>综合均衡 · 自动适配</span></p><p class="flex justify-between"><span class="text-[var(--muted)]">操作密度</span><span>${device.touch ? "舒适触控" : "桌面标准"}</span></p></div>${panelRow("retry", "恢复默认示例", "重置模拟房间及操作状态", "reset")}<div class="border-t border-[var(--line)] pt-5"><p class="text-[14px]">监控室 · 界面原型</p><p class="mt-2 text-[12px] leading-6 text-[var(--muted)]">这是供主题评审使用的本地原型。房间、画面、弹幕和声音状态均为模拟。</p></div></div>`;
    if (state.panel === "global") return `<div class="space-y-1 p-3">${panelRow("play", "开始 / 继续全部", `作用于 ${state.rooms.length} 个房间`, "all-start")}${panelRow("stop", "停止全部连接", "停止后可重新开始", "all-stop")}${panelRow("swap", "调整房间位置", "先点源房间，再点目标房间", "arrange")}${panelRow("expand", "简洁观看", "收起界面，保留可见的控制恢复入口", "clean")}${panelRow("settings", "设置", "观看偏好与关于", "panel", { value: "settings" })}</div>`;
    return `<div class="space-y-1 p-3"><p class="px-3 py-2 text-[11px] text-[var(--muted)]">操作对象：${room?.name ?? "未选择"} · ROOM ${room?.id ?? "—"}</p>${panelRow("retry", "重新连接", "恢复当前模拟房间的播放", "retry")}${panelRow("swap", "调整位置", "两次轻点即可交换两个房间", "arrange")}${panelRow("stop", "停止连接", "释放当前房间的播放连接", "stop")}${panelRow("trash", "移除房间", "从当前模拟观看空间移除", "remove", { danger: true })}<p class="mx-3 mt-5 border-t border-[var(--line)] pt-4 text-[11px] leading-6 text-[var(--muted)]">桌面可双击画面放大、右键打开此面板。触屏使用底部按钮完成相同操作。</p></div>`;
  };
  var renderPanel = (state, device) => {
    if (!state.panel) return "";
    const compact = device.width < 768;
    const canDock = device.width >= 1320 && state.panelPinned;
    return `<div class="pointer-events-none absolute inset-0 z-30" data-panel-layer>${canDock ? "" : '<button type="button" data-action="close-panel" aria-label="关闭面板遮罩" tabindex="-1" class="pointer-events-auto absolute inset-0 bg-black/35"></button>'}<section role="dialog" aria-modal="${!canDock}" aria-label="${panelTitle(state)}面板" class="pointer-events-auto absolute ${compact ? "inset-x-0 bottom-0 h-[86%] rounded-t-[20px]" : "inset-y-0 right-0 w-[360px] border-l border-[var(--line)]"} flex flex-col overflow-hidden bg-[var(--panel)] shadow-[-20px_0_60px_rgba(0,0,0,0.25)]" data-active-panel>${compact ? '<div class="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-[var(--line)]"></div>' : ""}<header class="flex min-h-[72px] shrink-0 items-center justify-between border-b border-[var(--line)] px-5"><div><h3 class="text-[18px] font-semibold">${panelTitle(state)}</h3>${state.panel === "rooms" ? '<p class="mt-1 text-[11px] text-[var(--muted)]">管理当前观看空间</p>' : ""}</div><div class="flex items-center gap-1">${device.width >= 1320 ? appButton("pin", state.panelPinned ? "取消固定面板" : "固定面板", "pin", { iconOnly: true, pressed: state.panelPinned }) : ""}${appButton("close", "关闭面板", "close-panel", { touch: device.touch, iconOnly: true })}</div></header><div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">${renderPanelContent(state, device)}</div></section></div>`;
  };
  var drawWall = (instance) => {
    const { element, state } = instance;
    const wall = element.querySelector("[data-video-wall]");
    if (!wall) return;
    const width = wall.clientWidth;
    const height = wall.clientHeight;
    if (!width || !height) return;
    if (!state.rooms.length) {
      wall.innerHTML = `<div class="absolute inset-0 flex flex-col items-center justify-center gap-5 text-white"><span class="text-[var(--muted)]">观看空间还是空的</span>${appButton("plus", "添加房间", "panel", { value: "rooms", primary: true, touch: instance.device.touch })}</div>`;
      return;
    }
    const options = { width, height, rooms: state.rooms, mainRoomId: state.focusedId ?? state.rooms[0].id, mainWeight: 6, priority: "compromise", previous: instance.plan };
    const plan = state.focusedId ? calculateAutomaticLayout(options) : equalGrid(options);
    instance.plan = plan;
    if (plan?.status !== "ready") return;
    wall.innerHTML = plan.rects.map((rect) => {
      const room = state.rooms.find((item) => item.id === rect.roomId);
      const selected = room.id === state.selectedId;
      const audible = isRoomAudible(state, room);
      const main = room.id === state.focusedId;
      const label = `${room.name}，${statusLabel(room)}${selected ? "，当前选中" : ""}${main ? "，大窗" : ""}${audible ? "，正在出声" : ""}`;
      return `<button type="button" data-action="select" data-room="${room.id}" aria-label="${label}" aria-pressed="${selected}" class="group absolute overflow-hidden border-0 bg-black p-0 text-white focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--accent)]" data-tile="${room.id}">
    ${sceneSvg(room)}${selected ? '<span class="absolute left-0 right-0 top-0 h-[3px] bg-[var(--accent)]"></span>' : ""}<span class="absolute left-2 top-2 inline-flex max-w-[85%] items-center gap-1.5 rounded-md bg-[#0c141b]/85 px-2 py-1 text-[11px] text-white"><span class="h-1.5 w-1.5 shrink-0 rounded-full ${room.status === "playing" ? "bg-[#92d4af]" : room.status === "error" ? "bg-[#f2a6a1]" : "bg-[#f1c692]"}"></span><span class="truncate">${room.name}</span>${main ? '<span class="ml-1 rounded bg-white/15 px-1 text-[9px]">大窗</span>' : ""}</span>${audible ? `<span class="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-md bg-[#0c141b]/85 text-[#a9ded5]">${icon("speaker", "h-4 w-4")}</span>` : ""}${main ? `<span class="absolute bottom-5 left-6 text-left"><span class="block font-display text-[26px] font-semibold tracking-wide text-white [text-shadow:0_2px_10px_#000]">${room.title.split(" · ")[0]}</span><span class="mt-1 block font-mono text-[10px] tracking-[.2em] text-white/80">LOCAL SCENE / ${room.id}</span></span>` : ""}
    ${room.status !== "playing" ? `<span class="absolute inset-0 flex items-center justify-center bg-[#101820]/75"><span class="rounded-xl border border-white/20 bg-[#17212a] px-5 py-3 text-[13px]">${statusLabel(room)}${room.status === "error" ? " · 选中后重新连接" : ""}</span></span>` : ""}
    ${state.arranging ? `<span class="absolute inset-0 flex items-center justify-center bg-black/35"><span class="flex h-12 w-12 items-center justify-center rounded-full ${state.arrangeSourceId === room.id ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "bg-black/60 text-white"}">${icon(state.arrangeSourceId === room.id ? "check" : "swap")}</span></span>` : ""}</button>`;
    }).join("");
    for (const rect of plan.rects) {
      const tile = wall.querySelector(`[data-tile="${rect.roomId}"]`);
      Object.assign(tile.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    }
    wall.dataset.coverage = String(plan.metrics?.videoCoverage ?? 0);
    wall.dataset.layout = plan.variant?.title ?? "平铺";
  };
  var equalGrid = ({ width, height, rooms }) => {
    const ratio = 16 / 9;
    const candidates = Array.from({ length: rooms.length }, (_, i) => i + 1).filter((columns) => rooms.length % columns === 0).map((columns) => {
      const rows = rooms.length / columns;
      const tileWidth = Math.min(width / columns, height / rows * ratio);
      return { columns, rows, tileWidth, tileHeight: tileWidth / ratio, area: tileWidth ** 2 / ratio * rooms.length };
    });
    const best = candidates.sort((a, b) => b.area - a.area)[0];
    const offsetX = (width - best.columns * best.tileWidth) / 2;
    const offsetY = (height - best.rows * best.tileHeight) / 2;
    return { status: "ready", rects: rooms.map((room, index) => ({ roomId: room.id, x: offsetX + index % best.columns * best.tileWidth, y: offsetY + Math.floor(index / best.columns) * best.tileHeight, width: best.tileWidth, height: best.tileHeight })), metrics: { videoCoverage: best.area / (width * height) } };
  };
  var renderApp = (instance) => {
    const { state, device, element } = instance;
    const focused = element.contains(document.activeElement) ? document.activeElement : null;
    const focusAction = focused?.getAttribute("data-action");
    const focusAria = focused?.getAttribute("aria-label");
    const docked = state.panel && state.panelPinned && device.width >= 1320;
    element.innerHTML = `${state.clean ? "" : renderToolbar(state, device) + renderStatus(state, device.width < 768)}<div class="relative flex min-h-0 flex-1 overflow-hidden" data-app-workspace>
    <div class="relative min-h-0 flex-1 bg-[#070b0d]" data-video-wall></div>${docked ? '<div class="w-[360px] shrink-0"></div>' : ""}${renderPanel(state, device)}
    ${state.clean ? `<div class="absolute right-4 top-4 z-20 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-1">${appButton("rooms", "恢复控制", "clean", { touch: true })}</div>` : ""}
    ${state.arranging ? `<div class="absolute inset-x-0 top-4 z-20 flex justify-center px-3"><div class="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2 shadow-xl"><span class="text-[13px]">${state.arrangeSourceId ? "再点目标房间交换" : "先点要移动的房间"}</span>${appButton("close", "取消换位", "cancel-arrange", { touch: device.touch })}</div></div>` : ""}
    ${state.toast ? `<div role="status" class="absolute bottom-4 left-4 right-4 z-20 mx-auto flex w-fit max-w-[90%] items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-[12px] shadow-lg"><span>${escapeHtml(state.toast)}</span><button type="button" data-action="dismiss-toast" aria-label="关闭提示" class="flex h-11 w-11 items-center justify-center rounded hover:bg-[var(--raised)]">${icon("close", "h-4 w-4")}</button></div>` : ""}</div>${state.clean ? "" : renderControls(state, device)}`;
    drawWall(instance);
    if (state.panel && !docked) {
      for (const part of element.querySelectorAll("[data-app-toolbar], [data-status-row], [data-room-controls], [data-video-wall]")) part.inert = true;
    }
    if (instance.readOnly) return;
    if (focusAction && focusAria) {
      const replacement = [...element.querySelectorAll("[data-action]")].find((item) => item.dataset.action === focusAction && item.getAttribute("aria-label") === focusAria);
      replacement?.focus({ preventScroll: true });
    }
  };
  var dispatch = (instance, action) => {
    const oldPanel = appState.panel;
    appState = reducePrototype(appState, action);
    instance.state = appState;
    renderApp(instance);
    if (appState.panel && appState.panel !== oldPanel) instance.element.querySelector('[data-active-panel] [aria-label="关闭面板"]')?.focus({ preventScroll: true });
    if (!appState.panel && oldPanel) instance.element.querySelector(`[data-action="panel"][data-value="${oldPanel}"]`)?.focus({ preventScroll: true });
  };
  var handleAppClick = (instance, event) => {
    const control = event.target.closest("[data-action]");
    if (!control || !instance.element.contains(control) || control.disabled) return;
    const type = control.dataset.action;
    const roomId = control.dataset.room;
    const value = control.dataset.value;
    if (type === "dismiss-toast") {
      appState = { ...appState, toast: "" };
      instance.state = appState;
      renderApp(instance);
      return;
    }
    if (type === "room-select") {
      appState = { ...reducePrototype(appState, { type: "select", roomId }), panel: null };
      instance.state = appState;
      renderApp(instance);
      return;
    }
    if (type === "volume-up" || type === "volume-down") {
      dispatch(instance, { type: "volume", value: (findSelected(appState)?.volume ?? 0) + (type === "volume-up" ? 5 : -5) });
      return;
    }
    if (type === "volume-preset") {
      dispatch(instance, { type: "volume", value });
      return;
    }
    dispatch(instance, { type, roomId, value });
  };
  var attachApp = (instance) => {
    instance.element.addEventListener("click", (event) => handleAppClick(instance, event));
    instance.element.addEventListener("input", (event) => {
      if (event.target.matches("[data-room-search]")) {
        appState = reducePrototype(appState, { type: "query", value: event.target.value });
        instance.state = appState;
        instance.element.querySelector("[data-room-list]").innerHTML = renderRoomList(appState);
      }
      if (event.target.matches("[data-volume-input]")) {
        appState = reducePrototype(appState, { type: "volume", value: event.target.value });
        instance.state = appState;
        instance.element.querySelector("[data-volume-output]").textContent = `${findSelected(appState)?.volume}%`;
      }
    });
    instance.element.addEventListener("change", (event) => {
      if (!event.target.matches("[data-volume-input]")) return;
      renderApp(instance);
      instance.element.querySelector("[data-volume-input]")?.focus({ preventScroll: true });
    });
    instance.element.addEventListener("dblclick", (event) => {
      if (instance.device.touch) return;
      const tile = event.target.closest("[data-tile]");
      if (tile && !appState.arranging) dispatch(instance, { type: "focus", roomId: tile.dataset.tile });
    });
    instance.element.addEventListener("contextmenu", (event) => {
      if (instance.device.touch) return;
      const tile = event.target.closest("[data-tile]");
      if (!tile) return;
      event.preventDefault();
      appState = reducePrototype(appState, { type: "select", roomId: tile.dataset.tile });
      dispatch(instance, { type: "panel", value: "room-more" });
    });
    instance.element.addEventListener("keydown", (event) => {
      if (event.key !== "Tab" || !appState.panel || appState.panelPinned && instance.device.width >= 1320) return;
      const items = [...instance.element.querySelectorAll("[data-active-panel] button:not([disabled]), [data-active-panel] input")];
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    });
  };
  var reviewButton = (label, action, value, active = false, extra = "") => `<button type="button" data-review="${action}" data-value="${value}" aria-pressed="${active}" class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-[13px] transition-colors ${active ? "bg-[#253d35] text-[#f8faf5]" : "text-[#5a665f] hover:bg-[#e1e4dc]"} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#376b59] ${extra}">${label}</button>`;
  var stageMarkup = (id, theme, device, readOnly = false, custom = "") => `<div class="relative w-full overflow-hidden rounded-[12px] border border-black/10 bg-[#d6d9d0] shadow-[0_12px_30px_rgba(31,42,35,0.10)] ${custom}" data-stage="${id}" data-theme="${theme}" data-device="${device}" ${readOnly ? "data-readonly" : ""}><div class="absolute left-0 top-0 flex origin-top-left flex-col overflow-hidden ${findTheme(theme).tokens} bg-[var(--base)] text-[var(--text)]" data-app="${id}" ${readOnly ? 'aria-hidden="true" inert' : 'aria-label="监控室交互原型" role="region"'}></div></div>`;
  var renderCompare = () => `<section aria-label="三套主题对照" class="grid gap-5 xl:grid-cols-3">${THEMES.map((theme) => `<article class="overflow-hidden rounded-[18px] border ${review.chosen === theme.id ? "border-[#47735f] ring-2 ring-[#47735f]/15" : "border-[#d3d8cd]"} bg-[#f8f9f4]"><div class="flex items-start justify-between gap-2 px-5 pb-4 pt-5"><div><p class="font-mono text-[10px] tracking-[.2em] text-[#788378]">${theme.english}</p><h2 class="mt-2 font-display text-[23px] font-semibold"><span class="mr-2 font-mono text-[15px] font-normal text-[#8c968b]">${theme.letter}</span>${theme.name}</h2></div>${theme.recommended ? '<span class="rounded-full border border-[#bed1c1] bg-[#e8efe4] px-2.5 py-1 text-[11px] text-[#456448]">推荐</span>' : '<span class="mt-1 font-mono text-[11px] text-[#8d978b]">0' + (THEMES.indexOf(theme) + 1) + "</span>"}</div><div class="px-3">${stageMarkup(`theme-${theme.id}`, theme.id, "desktop", true)}</div><div class="p-5"><div class="mb-4 flex items-center gap-1.5">${theme.swatches.map((color) => `<span class="h-5 w-8 rounded-md border border-black/10 ${color}"></span>`).join("")}<span class="ml-auto font-mono text-[10px] text-[#869083]">DESKTOP / TOUCH</span></div><p class="text-[14px] font-medium">${theme.subtitle}</p><p class="mt-2 min-h-[44px] text-[12px] leading-[22px] text-[#758071]">${theme.detail}</p><div class="mt-5 flex gap-2">${reviewButton(`体验 ${theme.letter} ${icon("arrow", "h-4 w-4")}`, "try-theme", theme.id, false, "flex-1 border border-[#cbd2c5]")}${reviewButton(review.chosen === theme.id ? `已选 ${icon("check", "h-4 w-4")}` : "选择此主题", "choose", theme.id, review.chosen === theme.id, "flex-1")}</div></div></article>`).join("")}</section>
  <div class="mt-7 grid gap-4 rounded-[16px] border border-[#d4d9cf] bg-[#e8ece2] p-5 md:grid-cols-3"><div class="flex gap-3"><span class="font-mono text-[11px] text-[#8a9789]">01</span><div><h3 class="text-[13px] font-semibold">画面优先</h3><p class="mt-1.5 text-[12px] leading-5 text-[#6e7b6a]">沿用综合均衡布局，小窗等大，视频保持源比例。</p></div></div><div class="flex gap-3"><span class="font-mono text-[11px] text-[#8a9789]">02</span><div><h3 class="text-[13px] font-semibold">操作位置固定</h3><p class="mt-1.5 text-[12px] leading-5 text-[#6e7b6a]">先选房，再用底部控制。选中、放大、仅听相互独立。</p></div></div><div class="flex gap-3"><span class="font-mono text-[11px] text-[#8a9789]">03</span><div><h3 class="text-[13px] font-semibold">两种输入，一套功能</h3><p class="mt-1.5 text-[12px] leading-5 text-[#6e7b6a]">iPad 使用显式按钮与点击换位；桌面增加双击、右键捷径。</p></div></div></div>`;
  var renderPrototype = () => {
    const theme = findTheme(review.theme);
    const device = DEVICES[review.device];
    return `<section aria-label="交互原型"><div class="mb-4 flex flex-wrap items-center justify-between gap-3"><div class="flex flex-wrap gap-1 rounded-xl border border-[#d1d7ca] bg-[#f6f7f1] p-1">${Object.entries(DEVICES).map(([id, item]) => reviewButton(`${icon(item.icon, "h-4 w-4")}${item.label}`, "device", id, review.device === id)).join("")}</div><div class="flex flex-wrap items-center gap-3 text-[12px] text-[#657361]">${reviewButton(`${icon("expand", "h-4 w-4")}全窗口体验`, "live", "live")}<label class="flex items-center gap-2">房间数<select data-review-count aria-label="模拟房间数" class="h-10 rounded-lg border border-[#c9d1c2] bg-[#f8f9f3] px-3 font-mono text-[#334b3d]">${Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}" ${review.count === i + 1 ? "selected" : ""}>${String(i + 1).padStart(2, "0")}</option>`).join("")}</select></label><button type="button" data-review="reset" class="min-h-11 rounded-lg px-2 hover:bg-[#e0e5da]">重置示例</button></div></div>
    ${stageMarkup("interactive", theme.id, review.device)}<div class="mt-4 flex flex-wrap items-center justify-between gap-3"><p class="flex items-center gap-2 text-[12px] text-[#6e7b68]">${icon(device.icon, "h-4 w-4")}<span>${theme.letter} · ${theme.name} / ${device.label}<span class="ml-2 font-mono text-[10px]" data-scale-caption></span></span></p>${reviewButton(`选择 ${theme.letter} · ${theme.name}`, "choose", theme.id, review.chosen === theme.id)}</div><div class="mt-3 flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-[#d4dacf] bg-[#f6f8f0] px-5 py-4 text-[12px] text-[#6e7b68]"><span><strong class="text-[#344c3d]">选房</strong>　轻点任一画面</span><span><strong class="text-[#344c3d]">放大 / 仅听</strong>　底部控制条</span><span><strong class="text-[#344c3d]">换位</strong>　更多 → 调整位置</span><span><strong class="text-[#344c3d]">声音调节</strong>　声音 → 滑杆或 ±5%</span></div></section>`;
  };
  var renderDevices = () => `<section aria-label="桌面与 iPad 设备原型" class="grid items-start gap-5 lg:grid-cols-3">${["desktop", "ipad", "split"].map((id) => {
    const device = DEVICES[id];
    return `<article class="rounded-[18px] border border-[#d3d9cb] bg-[#f7f9f1] p-4"><div class="mb-4 flex items-center gap-2">${icon(device.icon)}<h2 class="text-[16px] font-semibold">${device.label}</h2><span class="ml-auto font-mono text-[10px] text-[#8a9683]">${device.width} × ${device.height}</span></div>${stageMarkup(`device-${id}`, review.theme, id, true)}<p class="mt-4 text-[12px] leading-6 text-[#73806b]">${device.caption}</p><p class="mt-1 text-[11px] leading-6 text-[#8b9683]">${id === "desktop" ? "一行全局入口，面板可固定在右侧。" : id === "ipad" ? "无需悬停或长按，主要操作可直接轻点。" : "五个核心操作常驻，面板从底部展开。"}</p><div class="mt-3">${reviewButton("进入此设备原型 →", "try-device", id, false, "w-full border border-[#cbd3c2]")}</div></article>`;
  }).join("")}</section>`;
  var renderReview = () => {
    instances = [];
    if (review.view === "live") {
      root.innerHTML = `<header class="flex h-11 items-center justify-between bg-[#e7ece0] px-4 text-[12px] text-[#4c654d]"><span>${findTheme(review.theme).letter} · ${findTheme(review.theme).name} / 本地模拟原型</span><button type="button" data-review="view" data-value="prototype" class="min-h-11 px-3 font-medium">← 返回主题设计页</button></header>${stageMarkup("interactive", review.theme, "fluid", false, "rounded-none border-0 shadow-none")}`;
      const stage = root.querySelector("[data-stage]");
      const device = { ...DEVICES.fluid, width: stage.clientWidth, height: Math.max(360, window.innerHeight - 44), touch: review.device !== "desktop" || matchMedia("(any-pointer:coarse)").matches };
      const element = stage.querySelector("[data-app]");
      Object.assign(element.style, { width: `${device.width}px`, height: `${device.height}px` });
      const instance = { stage, element, state: appState, device, readOnly: false, plan: null };
      instances.push(instance);
      renderApp(instance);
      attachApp(instance);
      fitPreviews();
      syncUrl();
      return;
    }
    root.innerHTML = `<header class="border-b border-[#cfd5c7] bg-[#f6f7f0]"><div class="mx-auto flex max-w-[1680px] items-center justify-between gap-3 px-5 py-4 sm:px-8"><div class="flex items-center gap-3"><div class="flex h-9 w-9 items-center justify-center rounded-lg bg-[#2e493b] text-[#f6f7ed]">${icon("rooms", "h-5 w-5")}</div><div><p class="text-[14px] font-semibold tracking-wide">监控室 <span class="mx-1.5 font-normal text-[#a6afa0]">/</span> 界面提案</p><p class="mt-0.5 font-mono text-[9px] tracking-[.17em] text-[#87927d]">DESKTOP + IPAD · DESIGN STUDY 01</p></div></div><span class="rounded-full border border-[#d0d7c8] px-3 py-1.5 text-[10px] text-[#718065]">本地交互原型 · 模拟信号</span></div></header>
    <main class="mx-auto max-w-[1680px] px-4 pb-10 pt-7 sm:px-8"><div class="mb-6 flex flex-wrap items-end justify-between gap-5"><div><p class="mb-2 font-mono text-[10px] tracking-[.22em] text-[#7b8b70]">ONE WORKSPACE. THREE ATMOSPHERES.</p><h1 class="font-display text-[27px] font-semibold tracking-tight sm:text-[32px]">${review.view === "compare" ? "同一套操作，三种观看氛围。" : review.view === "prototype" ? "在同一张画墙上，直接体验。" : "从桌面到 iPad，操作都有落点。"}</h1><p class="mt-2.5 text-[12px] leading-6 text-[#78856e]">${review.view === "compare" ? "先看主题，再体验桌面与触屏。主题切换保持相同布局和状态，方便比较。" : review.view === "prototype" ? "按钮和面板均可操作；设备画布等比缩放，选择“跟随窗口”可按实际大小体验。" : "以下展示同一主题的三种宽度。触屏核心按钮为 48 CSSpx，窄窗口保留固定控制入口。"}</p></div><nav aria-label="原型查看方式" class="flex gap-1 rounded-xl border border-[#d0d7c6] bg-[#f7f8f2] p-1">${[["compare", "主题对照"], ["prototype", "交互原型"], ["devices", "设备适配"]].map(([id, label]) => reviewButton(label, "view", id, review.view === id)).join("")}</nav></div>
    ${review.view !== "compare" ? `<div class="mb-5 flex flex-wrap items-center gap-2"><span class="mr-2 text-[12px] text-[#819075]">主题</span>${THEMES.map((theme) => reviewButton(`${theme.letter} ${theme.name}`, "theme", theme.id, review.theme === theme.id)).join("")}</div>` : ""}
    ${review.view === "compare" ? renderCompare() : review.view === "prototype" ? renderPrototype() : renderDevices()}
    <footer class="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[#cfd7c5] pt-4 text-[11px] leading-6 text-[#7f8d73]"><p data-choice-status>${review.chosen ? `当前选择：${findTheme(review.chosen).letter} · ${findTheme(review.chosen).name}（仅保存在本地原型）` : "尚未选择主题 · 可点击“选择此主题”，或直接回复 A / B / C"}</p><p class="font-mono text-[9px] tracking-wider">16:9 SOURCE · EQUAL SECONDARY · INDEPENDENT AUDIO</p></footer></main>`;
    for (const stage of root.querySelectorAll("[data-stage]")) {
      const readOnly = stage.hasAttribute("data-readonly");
      const device = { ...DEVICES[stage.dataset.device] };
      if (stage.dataset.device === "fluid") {
        device.width = stage.clientWidth;
        device.height = Math.max(620, Math.min(950, window.innerHeight - 250));
      }
      const state = readOnly ? { ...createPrototypeState(review.count), panel: review.view === "devices" && device.width < 768 ? "audio" : "rooms" } : appState;
      const element = stage.querySelector("[data-app]");
      Object.assign(element.style, { width: `${device.width}px`, height: `${device.height}px` });
      const instance = { stage, element, state, device, readOnly, plan: null };
      instances.push(instance);
      renderApp(instance);
      if (!readOnly) attachApp(instance);
    }
    fitPreviews();
    syncUrl();
  };
  var fitPreviews = () => {
    for (const instance of instances) {
      const { stage, element, device } = instance;
      const width = stage.clientWidth;
      const liveHeight = Math.max(360, window.innerHeight - 44);
      if (review.view === "live" && device.height !== liveHeight) {
        device.height = liveHeight;
        element.style.height = `${liveHeight}px`;
        renderApp(instance);
      }
      if (stage.dataset.device === "fluid" && Math.abs(device.width - width) > 1) {
        device.width = width;
        element.style.width = `${width}px`;
        renderApp(instance);
      }
      const scale = Math.min(1, width / device.width);
      element.style.transform = `scale(${scale})`;
      element.style.left = `${Math.max(0, (width - device.width * scale) / 2)}px`;
      stage.style.height = `${Math.ceil(device.height * scale)}px`;
      if (!instance.readOnly) {
        const caption = root.querySelector("[data-scale-caption]");
        if (caption) caption.textContent = `${device.width} × ${device.height} · ${Math.round(scale * 100)}%`;
      }
    }
  };
  var syncUrl = () => {
    const url = new URL(location.href);
    for (const [key, value] of Object.entries({ theme: review.theme, view: review.view, device: review.device, count: review.count })) url.searchParams.set(key, value);
    try {
      history.replaceState(null, "", url);
    } catch {
    }
  };
  var handleReviewClick = (event) => {
    const control = event.target.closest("[data-review]");
    if (!control) return;
    const action = control.dataset.review;
    const value = control.dataset.value;
    if (action === "choose") {
      review.chosen = value;
      review.theme = value;
      try {
        localStorage.setItem("monitor-ui-theme-choice", value);
      } catch {
      }
    }
    if (action === "view") review.view = value;
    if (action === "theme") review.theme = value;
    if (action === "device") review.device = value;
    if (action === "try-theme") {
      review.theme = value;
      review.view = "prototype";
    }
    if (action === "try-device") {
      review.device = value;
      review.view = "prototype";
    }
    if (action === "live") review.view = "live";
    if (action === "reset") appState = createPrototypeState(review.count);
    renderReview();
  };
  root.addEventListener("click", handleReviewClick);
  root.addEventListener("change", (event) => {
    if (!event.target.matches("[data-review-count]")) return;
    review.count = Number(event.target.value);
    appState = createPrototypeState(review.count);
    renderReview();
  });
  window.addEventListener("resize", () => {
    if (renderFrame) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0;
      fitPreviews();
    });
  });
  renderReview();
})();
