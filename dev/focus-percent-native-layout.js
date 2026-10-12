import { calculateDesign as calculatePrevious } from "./focus-replan-layout.js";
import { validateDesign as validateShortSide } from "./focus-short-side-layout.js";

export const DESIGNS = Object.freeze([
  { id: "N", title: "减少主窗黑边", rule: "统一短边 / 覆盖接近最佳", note: "在最佳覆盖率的 2 个百分点以内，优先减少主窗内部黑边。", description: "保留完整小画面，统一短边。在满足观看尺寸的候选中，覆盖最多让步 2 个百分点，再最小化主窗黑边。位置与宽高以墙面百分比表示。", slack: .02 },
  { id: "C", title: "紧凑完整画面", rule: "统一短边 / 覆盖率优先", note: "先选择最高覆盖率，再减少主窗内部黑边；不裁切小画面。", description: "保留完整小画面，统一短边。优先最高窗口覆盖，再减少主窗黑边；允许无法消除的布局空位。位置与宽高以墙面百分比表示。", slack: 0 }
]);

const toPercent = (rectangle, width, height) => ({ x: rectangle.x / width * 100, y: rectangle.y / height * 100, width: rectangle.width / width * 100, height: rectangle.height / height * 100 });
const fromPercent = (rectangle, width, height) => ({ x: rectangle.x * width / 100, y: rectangle.y * height / 100, width: rectangle.width * width / 100, height: rectangle.height * height / 100 });

export const calculateDesign = (options) => {
  if (options.mode === "current") return calculatePrevious(options);
  const design = DESIGNS.find((item) => item.id === (options.mode ?? "N"));
  if (!design) return null;
  const plan = calculatePrevious({ ...options, gap: options.gap ?? 0, mode: "Q", packingPolicy: {
    id: design.id, mainVideoShare: .52, objective: "covered", optimizeMainBlack: true,
    coverageSlack: design.slack, minimumShort: 112.5 * Math.min(options.width / 1280, options.height / 720)
  } });
  if (!plan) return null;
  const percentages = { main: toPercent(plan.main, plan.width, plan.height), placements: plan.placements.map((room) => toPercent(room, plan.width, plan.height)) };
  // 预览实际消费百分比坐标，而非仅展示像素换算说明。
  return { ...plan, mode: design.id, shortUniform: true, percentages,
    main: fromPercent(percentages.main, plan.width, plan.height),
    placements: plan.placements.map((room, index) => ({ ...room, ...fromPercent(percentages.placements[index], plan.width, plan.height) })) };
};

export const validateDesign = (plan, ratios) => {
  const failures = validateShortSide(plan, ratios);
  if (plan?.percentages) {
    for (const rectangle of [plan.percentages.main, ...plan.percentages.placements]) {
      if (Object.values(rectangle).some((value) => !Number.isFinite(value)) || rectangle.x < -1e-7 || rectangle.y < -1e-7 || rectangle.x + rectangle.width > 100 + 1e-7 || rectangle.y + rectangle.height > 100 + 1e-7) failures.push("百分比矩形越界");
    }
  }
  return failures;
};
