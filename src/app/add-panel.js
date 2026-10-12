import { MAX_TILES, safeMessage } from "../core/settings.js";
import { parseRoom } from "../core/room.js";
import { fetchProbe } from "../api/probe.js";
import { searchRooms } from "../api/search.js";
import { fetchFollowRooms, isExcludedFollowRoom } from "../api/follow.js";
import { loadHistory, recordHistory } from "../api/history.js";
import { addRowMarkup } from "../ui/tile-markup.js";
import { normalizeRoomName, roomDisplayName } from "../core/room-name.js";

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
    const chosen = [...addState.selected.keys()].filter((rid) => !ctx.hasRoom(rid)).length;
    query("[data-add-selected]").textContent = `添加选中（${chosen}）`;
    query("[data-add-selected]").disabled = chosen === 0;
    const available = addState.rooms.filter((room) => !ctx.roomStateFor(room).disabled);
    const allSelected = available.length > 0 && available.every((room) => addState.selected.has(room.rid));
    const selectAll = query("[data-add-select-all]");
    selectAll.disabled = available.length === 0 || addState.mode === "manual";
    selectAll.textContent = allSelected ? "取消全选当前列表" : `全选当前列表（${available.length}）`;
    selectAll.setAttribute("aria-pressed", String(allSelected));
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
          if (ctx.addRoomFromPanel({ rid, name: "" }, true)) added++;
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
    // 跨标签保存房间对象；当前页的探测结果同步给已选项，保持名称和状态最新。
    for (const room of addState.rooms) {
      if (addState.selected.has(room.rid)) addState.selected.set(room.rid, room);
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
          if (addState.tab === "all" && isExcludedFollowRoom(probe.name)) {
            addState.rooms = addState.rooms.filter((entry) => entry.rid !== room.rid);
            addState.selected.delete(room.rid);
            onUpdate?.();
            continue;
          }
          room.liveStatus = probe.liveStatus;
          room.name = probe.name || room.name;
          room.avatar = probe.avatar || room.avatar || "";
          room.nameStatus = normalizeRoomName(room.name, room.rid) ? "ready" : "error";
        } catch {
          room.nameStatus = "error";
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
    const generation = ++addState.generation;
    addState.controller?.abort();
    addState.controller = null;
    if (addState.probeController) addState.probeController.abort();
    els.addSearch.value = "";
    addState.rooms = [];
    ctx.renderAddList();
    if (tab === "manual") {
      addState.rooms = [];
      ctx.renderAddList();
      els.addStatus.textContent = "粘贴房号或链接，每行一个";
      return;
    }
    if (tab === "history") {
      addState.rooms = loadHistory().slice(0, 50).map((entry) => ({ rid: String(entry.rid), name: normalizeRoomName(entry.name, entry.rid), avatar: entry.ava || "" }));
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
        rooms = await fetchFollowRooms(addState.controller.signal, {
          onProgress: ({ page, count, isFinal }) => {
            if (generation !== addState.generation) return;
            if (page > 1 && !isFinal) {
              els.addStatus.textContent = `正在获取关注列表（已加载 ${count} 个）…`;
            }
          }
        });
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
      const tile = ctx.addTile(room.rid, Number(els.defaultRate.value ?? 1), true, null, null, room.name);
      tile.liveStatus = room.liveStatus;
      ctx.updateTileChrome(tile);
      recordHistory(room.rid, room.name, room.avatar || "");
      addState.selected.delete(room.rid);
      if (!silent) {
        els.addStatus.textContent = `${tile.name ? roomDisplayName(tile) : "直播间"} 已添加并开始播放`;
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
    addState.selected.clear();
    addState.generation++;
    addState.controller?.abort();
    if (addState.probeController) addState.probeController.abort();
  };

  ctx.runAddSearch = async () => {
    const text = els.addSearch.value.trim();
    addState.generation++;
    addState.controller?.abort();
    addState.controller = null;
    // 搜索期间停掉标签页的状态探测：它的回调会整体重渲染甚至换掉 rooms，把搜索结果盖掉。
    if (addState.probeController) addState.probeController.abort();
    if (!text) {
      void ctx.loadAddTab(addState.tab);
      return;
    }
    const generation = addState.generation;
    addState.mode = "search";
    addState.controller = new AbortController();
    addState.rooms = [];
    ctx.renderAddList();
    els.addStatus.textContent = "正在搜索…";
    try {
      const rooms = await searchRooms(text, addState.controller.signal, fetchProbe);
      if (generation !== addState.generation) return;
      addState.rooms = rooms;
      ctx.renderAddList();
      els.addStatus.textContent = `找到 ${rooms.length} 个直播间，勾选后批量添加，或点击“添加”`;
      ctx.probeRoomsStatus(rooms.filter((room) => !normalizeRoomName(room.name, room.rid)), () => {
        if (generation === addState.generation) ctx.renderAddList();
      });
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
      if (event.target.checked) addState.selected.set(room.rid, room);
      else addState.selected.delete(room.rid);
      updateAddFooter();
      return;
    }
    if (event.target.closest("[data-add-one]")) ctx.addRoomFromPanel(room);
  });

  // 回车才发起搜索，输入过程不搜；空输入回车与清空输入都回到当前标签页列表。
  // 输入法的回车键只负责把中文上屏：此前拦截上屏回车会打断输入法提交，中文永远
  // 到不了搜索框，只有未转换的拼音能搜到。上屏完成后再沿用同一次回车意图搜一次。
  let searchAfterCompose = false;
  const submitSearch = () => {
    const text = els.addSearch.value.trim();
    if (/^\d+$/.test(text) || /^https?:/i.test(text)) {
      try {
        ctx.addRoomFromPanel({ rid: parseRoom(text), name: "" });
        els.addSearch.value = "";
      } catch (error) {
        els.addStatus.textContent = safeMessage(error);
      }
      return;
    }
    void ctx.runAddSearch();
  };
  els.addSearch.addEventListener("input", () => {
    if (!els.addSearch.value.trim()) void ctx.loadAddTab(addState.tab);
  });
  els.addSearch.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (event.isComposing || event.keyCode === 229) {
      searchAfterCompose = true;
      return;
    }
    event.preventDefault();
    searchAfterCompose = false;
    submitSearch();
  });
  els.addSearch.addEventListener("compositionend", () => {
    if (!searchAfterCompose) return;
    searchAfterCompose = false;
    submitSearch();
  });
  for (const input of ctx.wrapper.querySelectorAll("[name=add-tab]")) input.addEventListener("change", () => void ctx.loadAddTab(input.value));
  query("[data-add-open]").addEventListener("click", ctx.openAdd);
  query("[data-add-close]").addEventListener("click", ctx.closeAdd);
  els.addPanel.addEventListener("pointerdown", (event) => {
    if (event.target === els.addPanel) ctx.closeAdd();
  });
  query("[data-add-selected]").addEventListener("click", () => {
    let added = 0, failed = 0;
    for (const [rid, room] of [...addState.selected]) {
      if (!room || ctx.hasRoom(rid)) continue;
      if (ctx.addRoomFromPanel(room, true)) added++;
      else failed++;
    }
    ctx.renderAddList();
    if (added) els.addStatus.textContent = `已添加 ${added} 个房间${failed ? `，${failed} 个跳过` : ""}`;
    else if (!failed) els.addStatus.textContent = "没有可添加的房间";
  });
  const handleSelectAll = () => {
    const available = addState.rooms.filter((room) => !ctx.roomStateFor(room).disabled);
    const allSelected = available.length > 0 && available.every((room) => addState.selected.has(room.rid));
    for (const room of available) {
      if (allSelected) addState.selected.delete(room.rid);
      else addState.selected.set(room.rid, room);
    }
    ctx.renderAddList();
  };
  query("[data-add-select-all]").addEventListener("click", handleSelectAll);
}
