// 仅暴露满足严格铺满的完整网格方案，拒绝有空位的候选。
import { DESIGNS as uniformDesigns, calculateDesign as calculateUniform, validateDesign as validateUniform } from "./focus-uniform-layout.js";
import { summarizeDesign } from "./focus-replan-layout.js";

export const DESIGNS = Object.freeze(["W", "U"].map((id) => uniformDesigns.find((design) => design.id === id)));
export const calculateDesign = (options) => {
  const mode = options.mode ?? "W";
  if (mode !== "current" && !DESIGNS.some((design) => design.id === mode)) return null;
  return calculateUniform({ ...options, mode, gap: options.gap ?? 0 });
};
export const validateDesign = (plan, ratios) => {
  const failures = validateUniform(plan, ratios);
  if (plan && plan.mode !== "current") {
    if (!plan.complete) failures.push("未严格铺满");
    if (plan.gap === 0 && Math.abs(summarizeDesign(plan).coveredRatio - 1) > 1e-7) failures.push("存在布局空位");
  }
  return failures;
};
