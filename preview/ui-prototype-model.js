// 原型只操作本地模拟数据，不创建播放器、网络连接或真实房间。
export const ROOM_LIBRARY = [
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
  ["16", "知夏", "日常记录", "room", "#c3a2aa"],
].map(([id, name, title, scene, color]) => ({ id, name, title, scene, color, ratio: 16 / 9 }));

export const createPrototypeState = (count = 6) => ({
  rooms: ROOM_LIBRARY.slice(0, Math.max(1, Math.min(16, count))).map((room, index) => ({ ...room, status: index < 8 ? "playing" : "queued", muted: false, volume: 65, danmaku: true })),
  selectedId: "01", focusedId: "01", soloId: "01", globalMuted: false, beforeSoloMuted: true,
  panel: null, panelPinned: false, arranging: false, arrangeSourceId: null, clean: false,
  roomTab: "added", query: "", pendingIds: [], followFocus: false, toast: "", themeChoice: null,
});

export const isRoomAudible = (state, room) => room.status === "playing" && !state.globalMuted
  && !room.muted && room.volume > 0 && (!state.soloId || state.soloId === room.id);

/** 三种房间身份独立：选中不影响主窗，也不改变仅听对象。 */
export const reducePrototype = (state, action) => {
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
      return notice({ ...state, rooms: state.rooms.map((room) => room.id === source.id ? target : room.id === target.id ? source : room),
        focusedId: state.focusedId === source.id ? target.id : state.focusedId === target.id ? source.id : state.focusedId,
        arranging: false, arrangeSourceId: null }, `${source.name} 与 ${target.name} 已交换位置`);
    }
    case "focus": {
      if (!target) return state;
      const focusedId = state.focusedId === roomId ? null : roomId;
      return notice({ ...state, focusedId, ...(state.followFocus && focusedId ? { soloId: focusedId, globalMuted: false } : {}) }, focusedId ? `已放大 ${target.name}` : "已恢复平铺");
    }
    case "mode": return { ...state, focusedId: action.value === "focus" ? state.selectedId : null,
      ...(action.value === "focus" && state.followFocus ? { soloId: state.selectedId, globalMuted: false } : {}) };
    case "play": return target ? updateRoom({ status: target.status === "playing" ? "paused" : "playing" }) : state;
    case "mute": return target ? updateRoom({ muted: !target.muted }) : state;
    case "volume": return target ? updateRoom({ volume: Math.max(0, Math.min(100, Number(action.value) || 0)) }) : state;
    case "danmaku": return target ? updateRoom({ danmaku: !target.danmaku }) : state;
    case "solo": {
      if (!target) return state;
      if (state.soloId === roomId) return notice({ ...state, soloId: null, globalMuted: state.beforeSoloMuted }, "已取消仅听，恢复之前的全局声音状态");
      const next = { ...updateRoom({ muted: false }), soloId: roomId, globalMuted: false,
        beforeSoloMuted: state.soloId ? state.beforeSoloMuted : state.globalMuted };
      return notice(next, target.volume === 0 ? `仅听 ${target.name}，当前音量为 0` : `仅听 ${target.name}，选中其他房间不会切换声音`);
    }
    case "global-mute": return { ...state, globalMuted: !state.globalMuted };
    case "panel": return { ...state, panel: state.panel === action.value ? null : action.value, toast: "" };
    case "close-panel": return { ...state, panel: null };
    case "pin": return { ...state, panelPinned: !state.panelPinned };
    case "arrange": return notice({ ...state, panel: null, arranging: true, arrangeSourceId: null }, "点选要移动的房间，再点目标房间");
    case "cancel-arrange": return { ...state, arranging: false, arrangeSourceId: null, toast: "" };
    case "clean": return { ...state, clean: !state.clean, panel: null };
    case "query": return { ...state, query: action.value };
    case "room-tab": return { ...state, roomTab: action.value, query: "" };
    case "pending": return { ...state, pendingIds: state.pendingIds.includes(roomId) ? state.pendingIds.filter((id) => id !== roomId) : [...state.pendingIds, roomId] };
    case "add": {
      const additions = ROOM_LIBRARY.filter((room) => state.pendingIds.includes(room.id) && !state.rooms.some((item) => item.id === room.id));
      const available = Math.max(0, 8 - state.rooms.filter((room) => room.status === "playing" || room.status === "paused").length);
      return notice({ ...state, rooms: [...state.rooms, ...additions.map((room, index) => ({ ...room, status: index < available ? "playing" : "queued", volume: 65, muted: false, danmaku: true }))].slice(0, 16), pendingIds: [], roomTab: "added", query: "" }, `已添加 ${additions.length} 个模拟房间`);
    }
    case "remove": {
      if (!target) return state;
      const rooms = state.rooms.filter((room) => room.id !== roomId);
      return notice({ ...state, rooms, selectedId: state.selectedId === roomId ? rooms[0]?.id ?? null : state.selectedId,
        focusedId: state.focusedId === roomId ? null : state.focusedId, soloId: state.soloId === roomId ? null : state.soloId,
        globalMuted: state.soloId === roomId ? true : state.globalMuted, panel: null }, state.soloId === roomId ? "已移除仅听房间，现已全部静音" : `已移除 ${target.name}`);
    }
    case "stop": return target ? notice({ ...updateRoom({ status: "stopped" }), panel: null }, `已停止 ${target.name} 的模拟连接`) : state;
    case "retry": return target ? notice(updateRoom({ status: "playing" }), "已恢复模拟播放") : state;
    case "all-start": return notice({ ...state, rooms: state.rooms.map((room, index) => ({ ...room, status: index < 8 ? "playing" : "queued" })), panel: null }, "已启动模拟房间，超过 8 路的房间等待播放额度");
    case "all-stop": return notice({ ...state, rooms: state.rooms.map((room) => ({ ...room, status: "stopped" })), panel: null }, "已停止所有模拟连接");
    case "follow": return { ...state, followFocus: !state.followFocus };
    case "count": return { ...createPrototypeState(action.value), themeChoice: state.themeChoice };
    case "reset": return createPrototypeState(state.rooms.length || 6);
    default: return state;
  }
};
