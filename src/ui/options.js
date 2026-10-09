import { RATES, CAPACITIES } from "../core/settings.js";

export const rateOptions = RATES.map(([rate, label]) => `<option value="${rate}">${label}</option>`).join("");
export const sizeOptions = Array.from({ length: 13 }, (_, index) => 12 + index * 2).map((size) => `<option>${size}</option>`).join("");
export const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => `<option value="${speed}">${speed}×</option>`).join("");
export const areaOptions = [[0.25, "顶部四分之一"], [0.5, "上半屏"], [0.75, "上方四分之三"], [1, "全屏"]].map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
export const capacityOptions = CAPACITIES.map((value) => `<option>${value}</option>`).join("");
