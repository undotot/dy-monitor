import { MAX_TILES, safeMessage } from "../core/settings.js";
import { parseRoom } from "../core/room.js";
import { fetchProbe } from "../api/probe.js";
import { searchRooms } from "../api/search.js";
import { fetchFollowRooms } from "../api/follow.js";
import { loadHistory, recordHistory } from "../api/history.js";
import { addRowMarkup } from "../ui/tile-markup.js";

// 添加房间面板：关注 / 历史 / 搜索 / 手动四个标签页，批量勾选与状态探测。
export function initAddPanel(ctx) {
  const addState = ctx.addState;
  const els = ctx.els;
  const query = (selector) => ctx.wrapper.querySelector(selector);

  ctx.hasRoom = (rid) => [...ctx.tiles.values()].some((tile) => tile.rid === String(rid));

  ctx.roomStateFor = (room) => {
    if (ctx.hasRoom(room.rid)) return { disabled: true, badge: "已添加", badgeClass: "rbadge rbadge-add" };
    if (ctx.tiles.size >= MAX_TILES) return { disabled: true, badge: "已满", badgeClass: "rbadge rbadge-off" };
    if (!room.liveStatus) return { disabled: false, badge: "检查中", badgeClass: "rbadge rbadge-check" };
    if (room.liveStatus === "live") return { disabled: false, badge: "直播中", badgeClass: "rbadge rbadge-live" };
    if (room.liveStatus === "carousel") return { disabled: false, badge: "轮播中", badgeClass: "rbadge rbadge-loop" };
    return { disabled: false, badge: "未开播", badgeClass: "rbadge rbadge-off" };
  };

  // 页脚两枚批量按钮的数量与可用态。勾选只走这里，不整表重建——
  // 重建会在勾选瞬间换掉被点的节点，真实指针时序下会错点到别的行或“添加”按钮。
  const updateAddFooter = () => {
    const chosen = [...addState.selected].filter((rid) => !ctx.hasRoom(rid)).length;
    query("[data-add-selected]").textContent = `添加选中（${chosen}）`;
    query("[data-add-selected]").disabled = chosen === 0;
    const liveCount = addState.rooms.filter((room) => room.liveStatus === "live" && !ctx.hasRoom(room.rid)).length;
    query("[data-add-live-all]").disabled = liveCount === 0;
    query("[data-add-live-all]").textContent = liveCount ? `一键添加全部直播中（${liveCount}）` : "一键添加全部直播中";
  };

  ctx.renderAddList = () => {
    els.addList.replaceChildren();
    if (addState.mode === "manual") {
      const box = document.createElement("div");
      box.className = "manual-box";
      box.innerHTML = `<textarea data-manual-input class="p-textarea" placeholder="每行一个：房号或斗鱼直播间链接&#10;例如：223344&#10;https://www.douyu.com/223344"></textarea><div class="frow"><button data-manual-add class="btn primary">解析并添加</button><span class="fhint">支持房号与完整链接，不支持分享短链</span></div>`;
      els.addList.append(box);
      box.querySelector("[data-manual-add]").addEventListener("click", () => {
        const lines = box.querySelector("[data-manual-input]").value.split(/[\n,，\s]+/).map((line) => line.trim()).filter(Boolean);
        let added = 0, failed = 0;
        for (const line of lines) {
          let rid;
          try {
            rid = parseRoom(line);
          } catch (error) {
            els.addStatus.textContent = safeMessage(error);
            failed++;
            continue;
          }
          if (ctx.addRoomFromPanel({ rid, name: line }, true)) added++;
          else failed++;
        }
        if (added) {
          box.querySelector("[data-manual-input]").value = "";
          els.addStatus.textContent = `已添加 ${added} 个房间${failed ? `，${failed} 个跳过` : ""}`;
        } else if (!failed) {
          els.addStatus.textContent = "没有可添加的房间";
        }
      });
      updateAddFooter();
      return;
    }
    // 列表换血时剪掉已不在列表里的残留勾选，计数与批量只反映眼前这些行。
    for (const rid of [...addState.selected]) {
      if (!addState.rooms.some((entry) => String(entry.rid) === String(rid))) addState.selected.delete(rid);
    }
    for (const room of addState.rooms) {
      const wrap = document.createElement("div");
      wrap.innerHTML = addRowMarkup(room, ctx.roomStateFor(room), addState.selected.has(room.rid));
      els.addList.append(wrap.firstElementChild);
    }
    if (!addState.rooms.length) {
      const empty = document.createElement("div");
      empty.className = "fhint";
      empty.style.padding = "18px 4px";
      empty.textContent = addState.mode === "search" ? "没有找到直播间，可换房号或完整主播名" : "暂无内容";
      els.addList.append(empty);
    }
    updateAddFooter();
  };

  ctx.probeRoomsStatus = (rooms, onUpdate) => {
    const targets = rooms.slice(0, 50);
    if (!targets.length) return;
    if (addState.probeController) addState.probeController.abort();
    const controller = new AbortController();
    addState.probeController = controller;
    const signal = controller.signal;
    let index = 0, done = 0;
    const worker = async () => {
      while (index < targets.length && !signal.aborted) {
        const room = targets[index++];
        try {
          const probe = await fetchProbe(room.rid, signal);
          room.liveStatus = probe.liveStatus;
          room.name = probe.name || room.name;
          room.avatar = probe.avatar || room.avatar || "";
        } catch {
          if (!room.liveStatus) room.liveStatus = "offline";
        }
        done++;
        if (!signal.aborted && (done % 4 === 0 || done === targets.length)) onUpdate?.();
      }
    };
    Array.from({ length: Math.min(6, targets.length) }, () => void worker());
  };

  ctx.loadAddTab = async (tab) => {
    addState.tab = tab;
    // manual 是标签页语义不是 mode 语义：mode 只区分“标签页 / 搜索”。
    addState.mode = tab === "manual" ? "manual" : "tab";
    addState.selected.clear();
    const generation = ++addState.generation;
    addState.controller?.abort();
    addState.controller = null;
    if (addState.probeController) addState.probeController.abort();
    els.addSearch.value = "";
    if (tab === "manual") {
      addState.rooms = [];
      ctx.renderAddList();
      els.addStatus.textContent = "粘贴房号或链接，每行一个";
      return;
    }
    if (tab === "history") {
      addState.rooms = loadHistory().slice(0, 50).map((entry) => ({ rid: entry.rid, name: entry.name || entry.rid, avatar: entry.ava || "" }));
      ctx.renderAddList();
      els.addStatus.textContent = addState.rooms.length ? `添加历史 ${addState.rooms.length} 个，状态检查中` : "暂无添加历史";
      ctx.probeRoomsStatus(addState.rooms, () => {
        if (generation !== addState.generation) return;
        ctx.renderAddList();
      });
      return;
    }
    els.addStatus.textContent = "正在获取关注列表…";
    try {
      let rooms = addState.followRooms;
      if (!rooms) {
        // 挂到 addState.controller：切页 / 搜索会 abort 它，迟到的响应作废。
        addState.controller = new AbortController();
        rooms = await fetchFollowRooms(addState.controller.signal);
        if (generation !== addState.generation) return;
        addState.followRooms = rooms;
      }
      if (generation !== addState.generation) return;
      addState.rooms = rooms;
      ctx.renderAddList();
      els.addStatus.textContent = `关注列表共 ${addState.rooms.length} 个，状态校对中`;
      ctx.probeRoomsStatus(addState.rooms, () => {
        if (generation !== addState.generation) return;
        ctx.renderAddList();
      });
    } catch (error) {
      if (generation !== addState.generation) return;
      addState.rooms = [];
      ctx.renderAddList();
      els.addStatus.textContent = `关注列表获取失败：${safeMessage(error)}`;
    }
  };

  // 返回是否真的进了墙；失败（重复 / 已满）时错误写进状态栏并返回 false，调用方据此计数。
  ctx.addRoomFromPanel = (room, silent = false) => {
    try {
      const tile = ctx.addTile(room.rid, Number(els.defaultRate.value ?? 1), true);
      tile.name = room.name || room.rid;
      tile.liveStatus = room.liveStatus;
      ctx.updateTileChrome(tile);
      recordHistory(room.rid, room.name, room.avatar || "");
      addState.selected.delete(room.rid);
      if (!silent) {
        els.addStatus.textContent = `${room.name || room.rid} 已添加并开始播放`;
        ctx.renderAddList();
      }
      return true;
    } catch (error) {
      els.addStatus.textContent = safeMessage(error);
      return false;
    }
  };

  ctx.openAdd = () => {
    els.addPanel.hidden = false;
    void ctx.loadAddTab(query("[name=add-tab]:checked")?.value || "all");
    els.addSearch.focus();
  };

  ctx.closeAdd = () => {
    els.addPanel.hidden = true;
    addState.controller?.abort();
    if (addState.probeController) addState.probeController.abort();
    addState.selected.clear();
    clearTimeout(ctx.searchTimer);
  };

  ctx.runAddSearch = async () => {
    const text = els.addSearch.value.trim();
    addState.generation++;
    addState.controller?.abort();
    addState.controller = null;
    // 搜索期间停掉标签页的状态探测：它的回调会整体重渲染甚至换掉 rooms，把搜索结果盖掉。
    if (addState.probeController) addState.probeController.abort();
    addState.selected.clear();
    if (!text) {
      void ctx.loadAddTab(addState.tab);
      return;
    }
    const generation = addState.generation;
    addState.mode = "search";
    addState.controller = new AbortController();
    els.addStatus.textContent = "正在搜索…";
    try {
      const rooms = await searchRooms(text, addState.controller.signal, fetchProbe);
      if (generation !== addState.generation) return;
      addState.rooms = rooms;
      ctx.renderAddList();
      els.addStatus.textContent = `找到 ${rooms.length} 个直播间，勾选后批量添加，或点击“添加”`;
    } catch (error) {
      if (generation !== addState.generation) return;
      els.addStatus.textContent = `搜索失败：${safeMessage(error)}`;
    }
  };

  /* --- 事件绑定 --- */
  els.addList.addEventListener("click", (event) => {
    const row = event.target.closest("[data-rid]");
    if (!row) return;
    const room = addState.rooms.find((entry) => String(entry.rid) === row.dataset.rid);
    if (!room) return;
    if (event.target.matches("[data-chk]")) {
      if (event.target.checked) addState.selected.add(room.rid);
      else addState.selected.delete(room.rid);
      updateAddFooter();
      return;
    }
    if (event.target.closest("[data-add-one]")) ctx.addRoomFromPanel(room);
  });

  els.addSearch.addEventListener("input", () => {
    clearTimeout(ctx.searchTimer);
    if (!els.addSearch.value.trim()) {
      void ctx.loadAddTab(addState.tab);
      return;
    }
    ctx.searchTimer = setTimeout(() => void ctx.runAddSearch(), 300);
  });
  els.addSearch.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const text = els.addSearch.value.trim();
    if (/^\d+$/.test(text) || /^https?:/i.test(text)) {
      try {
        ctx.addRoomFromPanel({ rid: parseRoom(text), name: text });
        els.addSearch.value = "";
      } catch (error) {
        els.addStatus.textContent = safeMessage(error);
      }
      return;
    }
    void ctx.runAddSearch();
  });
  for (const input of ctx.wrapper.querySelectorAll("[name=add-tab]")) input.addEventListener("change", () => void ctx.loadAddTab(input.value));
  query("[data-add-open]").addEventListener("click", ctx.openAdd);
  query("[data-add-close]").addEventListener("click", ctx.closeAdd);
  els.addPanel.addEventListener("pointerdown", (event) => {
    if (event.target === els.addPanel) ctx.closeAdd();
  });
  query("[data-add-selected]").addEventListener("click", () => {
    let added = 0, failed = 0;
    for (const rid of [...addState.selected]) {
      const room = addState.rooms.find((entry) => String(entry.rid) === rid);
      if (!room || ctx.hasRoom(rid)) continue;
      if (ctx.addRoomFromPanel(room, true)) added++;
      else failed++;
    }
    addState.selected.clear();
    ctx.renderAddList();
    if (added) els.addStatus.textContent = `已添加 ${added} 个房间${failed ? `，${failed} 个跳过` : ""}`;
    else if (!failed) els.addStatus.textContent = "没有可添加的房间";
  });
  query("[data-add-live-all]").addEventListener("click", () => {
    const count = addState.rooms.filter((room) => room.liveStatus === "live" && !ctx.hasRoom(room.rid)).length;
    if (!count) return;
    // 这个动作与勾选无关、体量大，必须显式确认，避免点错就把整页直播中的房间全部加进墙。
    ctx.showToast(`将添加全部 ${count} 个直播中的房间（与勾选无关，已添加的会跳过）？`, [
      {
        label: "添加全部", primary: true, onClick: () => {
          let added = 0, failed = 0;
          for (const room of addState.rooms) {
            if (room.liveStatus !== "live" || ctx.hasRoom(room.rid) || ctx.tiles.size >= MAX_TILES) continue;
            if (ctx.addRoomFromPanel(room, true)) added++;
            else failed++;
          }
          ctx.renderAddList();
          if (added) els.addStatus.textContent = `已添加 ${added} 个直播中的房间${failed ? `，${failed} 个跳过` : ""}`;
          else if (!failed) els.addStatus.textContent = "没有可添加的直播中房间";
        }
      },
      { label: "取消" }
    ], 12e3);
  });
}
