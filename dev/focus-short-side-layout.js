// 用户确认只统一短边。复用完整原画的 Q 几何，不引入 cover 或生产代码引用。
import { calculateDesign as calculatePrevious, validateDesign as validatePrevious } from "./focus-replan-layout.js";

export const DESIGNS = Object.freeze([
  { id: "F", title: "紧凑铺排", rule: "共同短边 / 窗口覆盖优先", note: "原画完整；保证观看尺寸后优先减少空位，主界面允许黑底。", description: "所有小窗共用短边，长边按源比例计算。主视频至少保留单窗最大面积的 45%，小窗达到观看尺寸门槛后，优先窗口覆盖，再比较实际视频占用。", policy: { id: "F", mainVideoShare: .45, objective: "covered" } },
  { id: "B", title: "均衡观看", rule: "共同短边 / 实际画面占用优先", note: "原画完整；主视频至少保留单窗最大面积的 52%，兼顾主窗与小窗。", description: "统一小窗短边，主视频至少保留单窗最大面积的 52%。小窗短边达到最佳候选的 85% 后，优先所有实际可见视频的总面积，黑底不算视频。", policy: { id: "B", mainVideoShare: .52, objective: "visible" } },
  { id: "M", title: "大主画面", rule: "共同短边 / 主视频至少保留 60%", note: "原画完整；沿用原 Q 的主窗优先策略，求最大的共同小窗短边。", description: "统一小窗短边，主视频至少保留单窗最大面积的 60%，再最大化共同短边。全部小视频完整显示，剩余背景如实统计。", policy: null }
]);

export const calculateDesign = (options) => {
  if (options.mode === "current") return calculatePrevious(options);
  const design = DESIGNS.find((item) => item.id === (options.mode ?? "B"));
  if (!design) return null;
  const policy = design.id === "F" ? { ...design.policy, minimumShort: 112.5 * Math.min(options.width / 1280, options.height / 720) } : design.policy;
  const plan = calculatePrevious({ ...options, mode: "Q", packingPolicy: policy });
  return plan ? { ...plan, mode: design.id, shortUniform: true } : null;
};

export const validateDesign = (plan, ratios) => {
  const failures = validatePrevious(plan, ratios);
  if (plan?.shortUniform && plan.placements.length) {
    const shortSide = Math.min(plan.placements[0].width, plan.placements[0].height);
    if (plan.placements.some((room) => Math.abs(Math.min(room.width, room.height) - shortSide) > 1e-7)) failures.push("小窗短边不一致");
    if (plan.placements.some((room) => room.fit !== "contain" || room.retained !== 1 || Math.abs(room.width - room.video.width) > 1e-7 || Math.abs(room.height - room.video.height) > 1e-7)) failures.push("小窗没有完整显示原画");
  }
  return failures;
};
