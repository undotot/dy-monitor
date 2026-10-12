// [插件独立模块] 团播选择器核心控制器（方案 A：电竞暗色横向滑轨卡片）
// 设计原则：高内聚、低耦合，方便随时开启或整块拆卸。

import { fetchGroups, fetchGroupMembers, sortRoomsByLiveStatus } from "./api.js";
import { groupsTabMarkup, groupsFilterMarkup, groupCardMarkup, groupsSelectLiveButtonMarkup, escapeHtml } from "./markup.js";
import { groupsCss } from "./styles.js";

const STYLE_ID = "groups-feature-style";

export function mountGroupsFeature(ctx) {
  if (!ctx || !ctx.wrapper) return null;

  const wrapper = ctx.wrapper;
  const els = ctx.els;
  const addState = ctx.addState;

  // 1. 动态注入专属样式（严格支持 Shadow DOM 隔离与标准文档环境）
  const getRoot = () => {
    if (wrapper && typeof wrapper.getRootNode === "function") {
      const root = wrapper.getRootNode();
      if (root) return root;
    }
    return typeof document !== "undefined" ? document : null;
  };

  const rootNode = getRoot();
  const findStyle = () => {
    return (rootNode?.querySelector ? rootNode.querySelector(`#${STYLE_ID}`) : null)
      || (wrapper?.querySelector ? wrapper.querySelector(`#${STYLE_ID}`) : null)
      || (typeof document !== "undefined" ? document.getElementById(STYLE_ID) : null);
  };

  if (!findStyle()) {
    const styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    styleEl.textContent = groupsCss;
    if (rootNode && (rootNode.nodeType === 11 || (typeof ShadowRoot !== "undefined" && rootNode instanceof ShadowRoot))) {
      // 在 ShadowRoot 环境中，直接挂载至 ShadowRoot 顶层
      rootNode.appendChild(styleEl);
    } else if (wrapper) {
      // 挂载至 wrapper 顶层，确保作用域完全穿透
      wrapper.prepend(styleEl);
    } else if (typeof document !== "undefined" && document.head) {
      document.head.appendChild(styleEl);
    }
  }

  // 2. 动态在 segctl 追加「团播」选项卡
  const segctl = wrapper.querySelector(".add-tabs .segctl");
  let tabRadio = wrapper.querySelector("#at-groups");
  if (segctl && !tabRadio) {
    const temp = document.createElement("div");
    temp.innerHTML = groupsTabMarkup();
    while (temp.firstChild) {
      segctl.appendChild(temp.firstChild);
    }
    tabRadio = wrapper.querySelector("#at-groups");
  }

  // 3. 动态在 addList 前插入团播筛选条
  let groupsBox = wrapper.querySelector("[data-groups-box]");
  if (els.addList && !groupsBox) {
    const temp = document.createElement("div");
    temp.innerHTML = groupsFilterMarkup();
    groupsBox = temp.firstElementChild;
    els.addList.parentNode.insertBefore(groupsBox, els.addList);
  }

  // 4. 动态在 addFoot 中插入「全选在播」按钮
  let selectLiveBtn = wrapper.querySelector("[data-groups-select-live]");
  const addFoot = wrapper.querySelector(".add-foot");
  const selectAllBtn = wrapper.querySelector("[data-add-select-all]");
  if (addFoot && !selectLiveBtn) {
    const temp = document.createElement("div");
    temp.innerHTML = groupsSelectLiveButtonMarkup();
    selectLiveBtn = temp.firstElementChild;
    if (selectAllBtn) {
      addFoot.insertBefore(selectLiveBtn, selectAllBtn);
    } else {
      addFoot.appendChild(selectLiveBtn);
    }
  }

  // 5. 内部状态管理
  const state = {
    category: "all", // "all" | "bear" | "other"
    groups: [],
    selectedCode: null,
    loading: false,
    disposed: false
  };

  // 更新顶部分类数字与当前选中的团播摘要
  function updateHeaderSummary(membersCount) {
    const allCount = state.groups.length;
    const bearCount = state.groups.filter((g) => g.isBearPaw).length;
    const otherCount = allCount - bearCount;

    const countAllEl = wrapper.querySelector('[data-cat-count="all"]');
    const countBearEl = wrapper.querySelector('[data-cat-count="bear"]');
    const countOtherEl = wrapper.querySelector('[data-cat-count="other"]');
    if (countAllEl) countAllEl.textContent = allCount || "0";
    if (countBearEl) countBearEl.textContent = bearCount || "0";
    if (countOtherEl) countOtherEl.textContent = otherCount || "0";

    const infoEl = wrapper.querySelector("[data-groups-current-info]");
    if (infoEl) {
      const current = state.groups.find((g) => g.code === state.selectedCode);
      if (current) {
        const seasonPart = current.seasonName ? ` · ${current.seasonName}` : "";
        const countPart = membersCount !== undefined ? ` · ${membersCount}人` : "";
        infoEl.textContent = `${current.name}${seasonPart}${countPart}`;
      } else {
        infoEl.textContent = "选择团播";
      }
    }
  }

  // 渲染横向卡片列表
  function renderCards() {
    const scroller = wrapper.querySelector("[data-groups-capsules]");
    if (!scroller) return;

    const filtered = state.groups.filter((g) => {
      if (state.category === "bear") return g.isBearPaw;
      if (state.category === "other") return !g.isBearPaw;
      return true;
    });

    if (!filtered.length) {
      scroller.innerHTML = `<div class="groups-loading">该分类下暂无团播</div>`;
      return;
    }

    scroller.innerHTML = filtered
      .map((g) => groupCardMarkup(g, g.code === state.selectedCode))
      .join("");

    updateHeaderSummary();
  }

  // 激活并加载某个团播的成员房间
  async function selectGroup(code) {
    const target = state.groups.find((g) => g.code === code);
    if (!target) return;
    state.selectedCode = code;
    renderCards();

    // 顺滑滚动激活卡片到可视区域
    const activeCard = wrapper.querySelector(`[data-group-code="${CSS.escape ? CSS.escape(code) : code}"]`);
    activeCard?.scrollIntoView?.({ behavior: "smooth", inline: "nearest", block: "nearest" });

    addState.rooms = [];
    ctx.renderAddList?.();
    if (els.addStatus) els.addStatus.textContent = `正在拉取【${target.name}】成员列表…`;

    const generation = ++addState.generation;
    addState.controller?.abort();
    if (addState.probeController) addState.probeController.abort();

    const controller = new AbortController();
    addState.controller = controller;

    try {
      const members = await fetchGroupMembers(code, { signal: controller.signal });
      if (generation !== addState.generation || state.disposed) return;

      addState.rooms = sortRoomsByLiveStatus([...members]);
      updateHeaderSummary(members.length);
      ctx.renderAddList?.();
      if (els.addStatus) {
        els.addStatus.textContent = `【${target.name}】共 ${members.length} 人，直播状态探测中…`;
      }

      // 触发原有探测能力，自动打上在播绿标，并保持【已开播 - 轮播中 - 未开播】动态排序
      ctx.probeRoomsStatus?.(addState.rooms, () => {
        if (generation === addState.generation && !state.disposed) {
          sortRoomsByLiveStatus(addState.rooms);
          ctx.renderAddList?.();
        }
      });
    } catch (err) {
      if (generation !== addState.generation || state.disposed) return;
      addState.rooms = [];
      ctx.renderAddList?.();
      if (els.addStatus) els.addStatus.textContent = `获取【${target.name}】成员失败：${err.message}`;
    }
  }

  // 加载团播列表
  async function loadGroupsData() {
    if (state.groups.length) {
      renderCards();
      if (state.selectedCode) {
        void selectGroup(state.selectedCode);
      } else if (state.groups[0]) {
        void selectGroup(state.groups[0].code);
      }
      return;
    }

    state.loading = true;
    const scroller = wrapper.querySelector("[data-groups-capsules]");
    if (scroller) {
      scroller.innerHTML = `<div class="groups-loading">正在拉取团播数据…</div>`;
    }

    try {
      const list = await fetchGroups();
      if (state.disposed) return;
      state.groups = list;
      renderCards();

      // 默认选中第一个团播（若有灿团则优先选中灿团）
      const defaultGroup = list.find((g) => g.code === "Can") || list[0];
      if (defaultGroup) {
        void selectGroup(defaultGroup.code);
      }
    } catch (err) {
      if (state.disposed) return;
      if (scroller) {
        scroller.innerHTML = `<div class="groups-loading" style="color:#ef4444">团播数据拉取失败: ${escapeHtml(err.message)}</div>`;
      }
    } finally {
      state.loading = false;
    }
  }

  // 6. 监听 Tab 切换
  function onTabChange(tab) {
    if (tab === "groups") {
      if (groupsBox) groupsBox.hidden = false;
      if (selectLiveBtn) selectLiveBtn.style.display = "";
      void loadGroupsData();
    } else {
      if (groupsBox) groupsBox.hidden = true;
      if (selectLiveBtn) selectLiveBtn.style.display = "none";
    }
  }

  // 挂钩 ctx.loadAddTab
  const origLoadAddTab = ctx.loadAddTab;
  ctx.loadAddTab = async (tab) => {
    onTabChange(tab);
    if (tab === "groups") {
      addState.tab = "groups";
      addState.mode = "tab";
      addState.controller?.abort();
      if (addState.probeController) addState.probeController.abort();
      if (els.addSearch) els.addSearch.value = "";
      return;
    }
    return origLoadAddTab?.(tab);
  };

  // 7. 绑定团播分类点击
  const catsBox = wrapper.querySelector("[data-groups-cats]");
  if (catsBox) {
    catsBox.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-group-cat]");
      if (!btn) return;
      const cat = btn.dataset.groupCat;
      if (cat === state.category) return;
      state.category = cat;
      for (const b of catsBox.querySelectorAll("[data-group-cat]")) {
        b.classList.toggle("is-active", b === btn);
      }
      renderCards();
      const visible = state.groups.filter((g) => {
        if (cat === "bear") return g.isBearPaw;
        if (cat === "other") return !g.isBearPaw;
        return true;
      });
      if (visible.length && (!state.selectedCode || !visible.some((g) => g.code === state.selectedCode))) {
        void selectGroup(visible[0].code);
      }
    });
  }

  // 8. 绑定横向卡片点击与鼠标滚轮横向滑动
  const scroller = wrapper.querySelector("[data-groups-capsules]");
  if (scroller) {
    scroller.addEventListener("click", (e) => {
      const card = e.target.closest("[data-group-code]");
      if (!card) return;
      const code = card.dataset.groupCode;
      if (code === state.selectedCode) return;
      void selectGroup(code);
    });

    // 鼠标滚轮转为横向平移，提升 PC 端操作舒适度
    scroller.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        scroller.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }

  // 9. 绑定「全选在播」按钮
  if (selectLiveBtn) {
    selectLiveBtn.addEventListener("click", () => {
      if (addState.tab !== "groups") return;
      const liveRooms = addState.rooms.filter((room) => {
        const roomState = ctx.roomStateFor?.(room) || {};
        return !roomState.disabled && room.liveStatus === "live";
      });

      if (!liveRooms.length) {
        if (els.addStatus) els.addStatus.textContent = "当前团播暂无在播成员可添加";
        return;
      }

      const allLiveSelected = liveRooms.every((r) => addState.selected.has(r.rid));
      for (const r of liveRooms) {
        if (allLiveSelected) addState.selected.delete(r.rid);
        else addState.selected.set(r.rid, r);
      }
      ctx.renderAddList?.();
    });
  }

  // 10. 绑定 Tab 单选框 change 事件
  if (tabRadio) {
    tabRadio.addEventListener("change", () => {
      if (tabRadio.checked) void ctx.loadAddTab("groups");
    });
  }

  // 返回卸载函数
  return {
    unmount() {
      state.disposed = true;
      ctx.loadAddTab = origLoadAddTab;
      tabRadio?.remove();
      wrapper.querySelector('label[for="at-groups"]')?.remove();
      groupsBox?.remove();
      selectLiveBtn?.remove();
      findStyle()?.remove();
      rootNode?.querySelector?.(`#${STYLE_ID}`)?.remove();
      wrapper?.querySelector?.(`#${STYLE_ID}`)?.remove();
      document?.getElementById?.(STYLE_ID)?.remove();
    }
  };
}
