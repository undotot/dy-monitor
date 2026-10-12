// 兼容旧存档里以房号或粘贴链接代替用户名的记录。
export const normalizeRoomName = (name, rid) => {
  const value = typeof name === "string" ? name.trim().slice(0, 80) : "";
  return value === String(rid) || /^https?:\/\//i.test(value) ? "" : value;
};

export const roomDisplayName = (room) => normalizeRoomName(room.name, room.rid) || (room.nameStatus === "error" ? "主播名获取失败" : "正在获取主播名");
