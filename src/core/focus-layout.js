import { calculateAutomaticLayout } from "./focus-layout-policy.js";
import { auditRecursiveLayout, DEFAULT_FOCUS_MAIN_WEIGHT } from "./focus-layout-geometry.js";

export const FOCUS_LIMITS = Object.freeze({ mainMin: 640, mainMinHeight: 360, smallMin: 120 });
const DEFAULT_RATIO = 16 / 9;
const ratioOf = (value) => Number.isFinite(value) && value > 0 ? value : DEFAULT_RATIO;
const areaOf = (box) => box.width * box.height;

/**
 * 先保留指定主窗；它的副窗比例冲突时，再检查其他房间是否能作为主窗。
 * 单个主窗不可行不代表整个场景不可行。副窗索引始终绑定实际主窗对应的房间顺序。
 */
export const resolveFocusLayout = ({ rooms, mainRoomId, ...options }, calculateLayout = calculateFocusLayout) => {
  if (!Array.isArray(rooms) || !rooms.length || rooms.length > 16
    || rooms.some((room) => !room || !["string", "number"].includes(typeof room.id) || !String(room.id).trim())) return null;
  const normalized = rooms.map((room) => ({ id: String(room.id), ratio: ratioOf(room.ratio) }));
  if (new Set(normalized.map((room) => room.id)).size !== normalized.length) return null;
  const requested = normalized.find((room) => room.id === String(mainRoomId));
  if (!requested) return null;
  const calculateFor = (main, extra = {}) => {
    const secondaries = normalized.filter((room) => room !== main);
    const plan = calculateLayout({ ...options, ...extra, mainRoomId: main.id, mainRatio: main.ratio,
      secondaryRoomIds: secondaries.map((room) => room.id), secondaryRatios: secondaries.map((room) => room.ratio) });
    return { plan, mainRoomId: main.id, secondaryRoomIds: secondaries.map((room) => room.id),
      requestedMainRoomId: requested.id, mainChanged: main.id !== requested.id };
  };
  const preferred = calculateFor(requested);
  // 用户点哪一路就放大哪一路：副窗比例冲突时不再偷偷换主窗，
  // 而是保留指定主窗，让比例不同的副窗以 contain 黑边适配。
  if (preferred.plan?.status === "infeasible" && preferred.plan.code === "SECONDARY_RATIO_MISMATCH") {
    const contained = calculateFor(requested, { containSecondary: true });
    if (contained.plan?.status === "ready") return contained;
  }
  return preferred;
};

/** 将共用拼接结果转换为播放器的绝对坐标；全部视频节点保持原身份。 */
export const calculateFocusLayout = ({ width, height, mainRatio = DEFAULT_RATIO, secondaryRatios = [],
  mainRoomId = "main", secondaryRoomIds = [], mainWeight = DEFAULT_FOCUS_MAIN_WEIGHT, previous = null, containSecondary = false }) => {
  if (![width, height].every((value) => Number.isFinite(value) && value > 2)
    || !Array.isArray(secondaryRatios) || !Array.isArray(secondaryRoomIds) || secondaryRatios.length > 15) return null;
  const rooms = [{ id: String(mainRoomId), ratio: ratioOf(mainRatio) }, ...secondaryRatios.map((ratio, index) =>
    ({ id: String(secondaryRoomIds[index] ?? `secondary-${index}`), ratio: ratioOf(ratio) }))];
  const plan = calculateAutomaticLayout({ width, height, rooms, mainRoomId: String(mainRoomId), mainWeight,
    priority: "compromise", previous: previous?.layoutPlan ?? null, containSecondary: containSecondary === true });
  if (!plan || plan.status !== "ready") return plan;
  if (!auditRecursiveLayout(plan, rooms.length).valid) return { status: "infeasible", code: "LAYOUT_INVALID",
    reason: "无法生成满足源比例、小窗等大和完整矩形要求的放大布局。" };
  const main = plan.rects.find((rect) => rect.role === "main");
  const small = plan.rects.filter((rect) => rect.role === "secondary");
  const indices = new Map(rooms.slice(1).map((room, index) => [room.id, index]));
  const boxOf = ({ x, y, width, height }) => ({ x, y, width, height });
  const placements = small.map((rect) => ({ ...boxOf(rect), index: indices.get(rect.roomId), region: rect.region,
    ratio: rect.ratio, video: { width: rect.width, height: rect.height }, visible: 1 }));
  const quality = Math.min(1, main.width / FOCUS_LIMITS.mainMin, main.height / FOCUS_LIMITS.mainMinHeight);
  return { status: "ready", absolute: true, family: "uniform", signature: plan.signature, layoutPlan: plan,
    containSecondary: Boolean(plan.containSecondary), secondaryRatio: plan.secondaryRatio,
    layoutShape: plan.layoutShape, selection: plan.selection, fallback: plan.selection.fallback,
    main: boxOf(main), mainVideo: { width: main.width, height: main.height }, mainArea: areaOf(main), placements,
    cell: plan.metrics.secondarySize, cellRatio: small[0]?.ratio ?? main.ratio,
    leftCount: small.filter((rect) => rect.region === "left").length,
    rightCount: small.filter((rect) => rect.region === "right").length,
    bottomCount: small.filter((rect) => rect.region === "bottom").length,
    containerW: plan.bounds.width, containerH: plan.bounds.height, offsetX: plan.bounds.x, offsetY: plan.bounds.y,
    viewportFillRatio: plan.metrics.videoCoverage, videoViewportFillRatio: plan.metrics.videoCoverage,
    layoutFillRatio: 1, mainVisible: 1, meanVisible: 1, dominant: main.width * main.height >= 2 * (small[0] ? areaOf(small[0]) : 0),
    quality, constrained: quality < 0.98, overflow: false, gap: 0, gapX: 0, gapY: 0 };
};
