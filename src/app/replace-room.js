import { parseRoom } from "../core/room.js";
import { normalizeRoomName } from "../core/room-name.js";
import { rateOptions } from "../ui/options.js";

// 网络探测成功后再提交替换。原画格节点、位置及用户音画偏好保持不变。
export const replaceTileRoom = (ctx, tile, room) => {
  if (ctx.tiles.get(tile.id) !== tile) throw new Error("原直播间已移除，请重新选择");
  const rid = parseRoom(String(room.rid));
  if (rid === tile.rid) throw new Error("这是当前直播间，请选择其他房间");
  if ([...ctx.tiles.values()].some((other) => other !== tile && other.rid === rid)) throw new Error("该直播间已在监控室中");
  ctx.stop(tile);
  tile.nameRequest?.abort();
  tile.rid = rid;
  tile.name = normalizeRoomName(room.name, rid);
  tile.nameStatus = tile.name ? "ready" : "loading";
  tile.liveStatus = room.liveStatus;
  tile.availableRates = null;
  tile.rateSel.innerHTML = rateOptions;
  tile.rateSel.value = String(tile.rate);
  ctx.updateTileChrome(tile);
  ctx.save();
  void ctx.handleStart(tile);
  return tile;
};
