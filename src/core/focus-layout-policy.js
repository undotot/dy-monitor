import { calculateRecursiveLayout, auditRecursiveLayout, getMainSizePreference, getCoverageSizePreference,
  preferMainSizeRange, coverageSizeBalanceScore } from "./focus-layout-geometry.js";

// 仅改变排列结构。所有方案使用同一个等大小窗生成器及同一个严格几何审计。
export const LAYOUT_VARIANTS = [
  { id: "coverage", letter: "A", title: "右侧列排", family: "right", description: "主窗左上，小窗全部在右侧排成完整列。大小与留白按当前取舍规则选优。" },
  { id: "bottom", letter: "B", title: "底部行排", family: "bottom", description: "主窗左上，小窗全部在底部排成完整行。适合比较横向副窗带的效果。" },
  { id: "balanced", letter: "C", title: "右侧＋底部 L 型", family: "l-shape", description: "主窗左上，小窗同时排列在右侧与底部，所有区域共用同一宽高。" },
  { id: "sides", letter: "D", title: "左右对称分列", family: "sides", description: "主窗水平居中、顶部对齐，小窗等大并分配到左右两侧。" },
  { id: "surround", letter: "E", title: "左右＋底部 U 型", family: "u-shape", description: "主窗水平居中、顶部对齐，小窗等大并填满左右两侧与底部。" },
];

const EPSILON = 1e-9;
const SWITCH_SCORE_GAIN = 0.02;
const EQUAL_GRID_VARIANT = { id: "grid", letter: "F", title: "全等大网格", family: "grid", description: "当前数量没有适中放大解时，自动改为所有窗口等大；源比例与完整矩形仍保持。" };
const priorityFor = (options) => ["coverage", "balanced"].includes(options.priority) ? options.priority : "compromise";
const preferenceFor = (options) => priorityFor(options) === "compromise"
  ? getCoverageSizePreference(options.mainWeight) : getMainSizePreference(options.mainWeight);

const calculateManualVariant = (options, variant) => {
  const priority = priorityFor(options);
  const sizeRange = preferenceFor(options);
  const selection = priority === "coverage" ? "coverage" : priority === "balanced" ? "size-balanced" : "coverage-size-balanced";
  const plan = calculateRecursiveLayout({ ...options, mainWeight: sizeRange.target, family: variant.family, selection });
  return plan ? { ...plan, variant, selection: { mode: "manual", priority, sizeRange } } : null;
};

export const compareLayoutVariants = (options) => {
  const items = LAYOUT_VARIANTS.map((variant) => calculateManualVariant(options, variant));
  const feasible = items.filter((plan) => plan?.status === "ready");
  const priority = priorityFor(options);
  const sizeRange = preferenceFor(options);
  // 只有放大结构全部过大时增加网格回退；不把普通等大排列冒充放大结构。
  if (priority !== "coverage" && feasible.length && feasible.every((plan) => plan.metrics.mainToAverageVideo > sizeRange.max + EPSILON)) {
    const grid = calculateRecursiveLayout({ ...options, mainWeight: sizeRange.target, anchor: "top-left", family: "auto", selection: "equal-grid" });
    if (grid?.status === "ready") items.push({ ...grid, variant: EQUAL_GRID_VARIANT, selection: { mode: "manual", priority, sizeRange } });
  }
  return items;
};

// 仅把相同房间、主窗和源比例的旧方案用于并列决策，旧坐标始终重新生成。
const hasCompatiblePrevious = (previous, plan) => previous?.status === "ready"
  && previous.rects.length === plan.rects.length
  && plan.rects.every((rect) => previous.rects.some((old) => old.roomId === rect.roomId
    && old.role === rect.role && Math.abs(old.ratio / rect.ratio - 1) <= EPSILON));

const trackingDistance = (plan) => {
  const main = plan.rects.find((rect) => rect.role === "main");
  return plan.rects.filter((rect) => rect.role === "secondary").reduce((sum, rect) => sum
    + Math.hypot(rect.x + rect.width / 2 - main.x - main.width / 2,
      rect.y + rect.height / 2 - main.y - main.height / 2) / Math.min(plan.width, plan.height), 0);
};

/** 跨结构选优，不使用固定房间数或显示器型号作为切换断点。 */
export const calculateAutomaticLayout = (options) => {
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
  const pool = priority === "coverage" ? feasible : fallback ? [fallback]
    : preferMainSizeRange(feasible, sizeRange, (plan) => plan.metrics.mainToAverageVideo ?? weight);
  const bestCoverage = Math.max(...pool.map((plan) => plan.metrics.videoCoverage));
  const score = (plan) => priority === "compromise"
    ? coverageSizeBalanceScore(plan.metrics.videoCoverage, plan.metrics.mainToAverageVideo, weight) : plan.metrics.videoCoverage;
  const bestScore = Math.max(...pool.map(score));
  const scored = pool.filter((plan) => bestScore - score(plan) <= EPSILON);
  const scoredCoverage = Math.max(...scored.map((plan) => plan.metrics.videoCoverage));
  const best = scored.filter((plan) => scoredCoverage - plan.metrics.videoCoverage <= EPSILON);
  const weightError = (plan) => Math.abs(Math.log((plan.metrics.mainToAverageVideo ?? weight) / weight));
  const minWeightError = Math.min(...best.map(weightError));
  const preferred = best.filter((plan) => weightError(plan) - minWeightError <= EPSILON);
  const retained = preferred.find((plan) => plan.variant.id === options.previous?.variant?.id
    && hasCompatiblePrevious(options.previous, plan));
  let chosen = retained ?? preferred.reduce((current, candidate) =>
    trackingDistance(candidate) < trackingDistance(current) - EPSILON ? candidate : current);
  let stabilized = false;
  const previous = options.previous;
  // 在新尺寸重新生成旧拓扑；只对相同房间、主窗、比例和面积目标保留小收益方案。
  if (priority === "compromise" && !fallback && previous?.selection?.priority === priority
    && previous.selection.sizeRange?.target === weight && hasCompatiblePrevious(previous, chosen)) {
    const variant = LAYOUT_VARIANTS.find((item) => item.id === previous.variant?.id);
    const old = variant && calculateRecursiveLayout({ ...options, mainWeight: weight, family: variant.family,
      selection: "coverage-size-balanced", candidateKey: previous.signature });
    const area = old?.metrics?.mainToAverageVideo;
    if (old?.status === "ready" && area >= sizeRange.min - EPSILON && area <= sizeRange.max + EPSILON
      && bestScore - score(old) <= SWITCH_SCORE_GAIN + EPSILON) {
      stabilized = old.signature !== chosen.signature || variant.id !== chosen.variant.id;
      chosen = { ...old, variant };
    }
  }
  const areaRatio = chosen.metrics.mainToAverageVideo;
  const rangeLabel = `${sizeRange.min.toFixed(1)}～${sizeRange.max.toFixed(1)}×`;
  const reason = fallback ? `${options.rooms.length} 房没有面积比 ${rangeLabel} 的适中放大解，自动回退 F · 全等大网格（${chosen.grid.columns} 列 × ${chosen.grid.rows} 行），视频覆盖 ${(chosen.metrics.videoCoverage * 100).toFixed(2)}%。`
    : priority !== "coverage" ? `自动${priority === "compromise" ? "综合均衡" : "大小均匀"} ${chosen.variant.letter} · ${chosen.variant.title}：${areaRatio === null ? "单房间" : `主/副面积 ${areaRatio.toFixed(2)}×，目标 ${weight}×，优先范围 ${rangeLabel}`}；视频覆盖 ${(chosen.metrics.videoCoverage * 100).toFixed(2)}%。${priority === "compromise" ? " 同时评价覆盖率和主副窗差距，覆盖收益不足时保留较小主窗。" : ""}`
      : `自动选择 ${chosen.variant.letter} · ${chosen.variant.title}：当前画墙下比较 ${feasible.length} 种可行排列，视频覆盖 ${(chosen.metrics.videoCoverage * 100).toFixed(2)}%，外围留白 ${(chosen.metrics.outerMarginRatio * 100).toFixed(2)}%（最少）。`;
  return { ...chosen, selection: { mode: "auto", priority, feasibleCount: feasible.length, bestCoverage, score: score(chosen),
    sizeRange, fallback: Boolean(fallback), stabilized, reason } };
};

export const calculateLayoutVariant = (options, variantId = "auto") => {
  const variant = LAYOUT_VARIANTS.find((item) => item.id === variantId);
  return variant ? calculateManualVariant(options, variant) : calculateAutomaticLayout(options);
};

// 不接受跳过尺寸一致性的选项；任何不等大的副窗都必须使审计失败。
export const auditLayoutVariant = (plan, count) => auditRecursiveLayout(plan, count);
