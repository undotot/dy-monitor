import { enumerateRecursiveLayouts, calculateRecursiveLayout, auditRecursiveLayout, getMainSizePreference } from "./recursive-layout-engine.js";

const EPSILON = 1e-9;
const unitLabel = (value) => Number.isInteger(value) ? String(value) : value.toFixed(2);
const describeCandidate = (plan, range) => {
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
  return { id: plan.layoutShape === "equal-grid" ? `grid:${plan.signature}` : plan.signature,
    title, span, regions: regions || "单房间", area,
    moderate: area === null || area <= range.max + EPSILON && (area >= range.min - EPSILON || plan.metrics.prominenceLimited),
    error: area === null ? 0 : Math.abs(Math.log(area / range.target)), frontier: false, sizePreferred: false, coveragePreferred: false };
};

/** 调研预览保留同类结构的不同跨度，不以不同尺寸的小窗增加方案数量。 */
export const calculateResearchLayouts = (options) => {
  const enumeration = enumerateRecursiveLayouts(options);
  if (!enumeration || enumeration.status !== "ready") return enumeration;
  const range = getMainSizePreference(options.mainWeight);
  const candidates = enumeration.candidates.map((plan) => ({ ...plan, research: describeCandidate(plan, range) }));
  if (candidates.length && candidates.every((plan) => plan.metrics.mainToAverageVideo > range.max + EPSILON)) {
    const grid = calculateRecursiveLayout({ ...options, family: "auto", anchor: "top-left", selection: "equal-grid", candidateKey: null });
    if (grid?.status === "ready") {
      const research = describeCandidate(grid, range);
      candidates.push({ ...grid, research: { ...research, moderate: true } });
    }
  }
  let moderate = candidates.filter((plan) => plan.research.moderate);
  // 独立主窗比例可能无法满足范围或回退条件，此时如实展示最接近目标的组合。
  if (!moderate.length) {
    const closest = Math.min(...candidates.map((plan) => plan.research.error));
    moderate = candidates.filter((plan) => plan.research.error <= closest + EPSILON);
    for (const plan of moderate) plan.research.moderate = true;
  }
  const minError = Math.min(...moderate.map((plan) => plan.research.error));
  const bestSizeCoverage = Math.max(...moderate.filter((plan) => plan.research.error <= minError + EPSILON).map((plan) => plan.metrics.videoCoverage));
  const bestCoverage = Math.max(...moderate.map((plan) => plan.metrics.videoCoverage));
  for (const plan of candidates) {
    const audit = auditRecursiveLayout(plan, options.rooms.length);
    if (!audit.valid) throw new Error(`调研候选几何检查失败：${audit.errors.join("；")}`);
    if (!plan.research.moderate) continue;
    plan.research.frontier = !moderate.some((other) => other !== plan
      && other.metrics.videoCoverage >= plan.metrics.videoCoverage - EPSILON && other.research.error <= plan.research.error + EPSILON
      && (other.metrics.videoCoverage > plan.metrics.videoCoverage + EPSILON || other.research.error < plan.research.error - EPSILON));
    plan.research.sizePreferred = plan.research.error <= minError + EPSILON && plan.metrics.videoCoverage >= bestSizeCoverage - EPSILON;
    plan.research.coveragePreferred = plan.metrics.videoCoverage >= bestCoverage - EPSILON;
  }
  candidates.sort((a, b) => Number(b.research.moderate) - Number(a.research.moderate)
    || a.research.error - b.research.error || b.metrics.videoCoverage - a.metrics.videoCoverage
    || a.units.leftColumns - b.units.leftColumns || a.research.id.localeCompare(b.research.id));
  return { ...enumeration, candidates, range, moderateCount: moderate.length,
    frontierCount: candidates.filter((plan) => plan.research.frontier).length };
};
