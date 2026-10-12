// [插件独立模块] 团播选择器核心控制器：负责动态挂载 Tab、胶囊筛选条、拉取团播成员及全选在播。
// 设计原则：高内聚、低耦合，方便随时开启或整块拆卸。

import { fetchGroups, fetchGroupMembers } from "./api.js";
import { groupsTabMarkup, groupsFilterMarkup, groupCapsuleMarkup, groupsSelectLiveButtonMarkup, escapeHtml } from "./markup.js";
import { groupsCss } from "./styles.js";

const STYLE_ID = "groups-feature-style";

export function mountGroupsFeature(ctx) {
  if (!ctx || !ctx.wrapper) return null;

  const wrapper = ctx.wrapper;
  const els = ctx.els;
  const addState = ctx.addState;

  // 1. 动态注入专属样式（若不存在）
  if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
    const styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    styleEl.textContent = groupsCss;
    (document.head || wrapper).appendChild(styleEl);
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

  // 渲染胶囊列表
  function renderCapsules() {
    const capsuleContainer = wrapper.querySelector("[data-groups-capsules]");
    if (!capsuleContainer) return;

    const filtered = state.groups.filter((g) => {
      if (state.category === "bear") return g.isBearPaw;
      if (state.category === "other") return !g.isBearPaw;
      return true;
    });

    if (!filtered.length) {
      capsuleContainer.innerHTML = `<div class="groups-loading">该分类下暂无团播</div>`;
      return;
    }

    capsuleContainer.innerHTML = filtered
      .map((g) => groupCapsuleMarkup(g, g.code === state.selectedCode))
      .join("");
  }

  // 激活并加载某个团播的成员房间
  async function selectGroup(code) {
    const target = state.groups.find((g) => g.code === code);
    if (!target) return;
    state.selectedCode = code;
    renderCapsules();

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

      addState.rooms = members;
      ctx.renderAddList?.();
      if (els.addStatus) {
        els.addStatus.textContent = `【${target.name}】共 ${members.length} 人，直播状态探测中…`;
      }

      // 触发原有探测能力，自动打上在播绿标
      ctx.probeRoomsStatus?.(addState.rooms, () => {
        if (generation === addState.generation && !state.disposed) {
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
      renderCapsules();
      if (state.selectedCode) {
        void selectGroup(state.selectedCode);
      } else if (state.groups[0]) {
        void selectGroup(state.groups[0].code);
      }
      return;
    }

    state.loading = true;
    const capsuleContainer = wrapper.querySelector("[data-groups-capsules]");
    if (capsuleContainer) {
      capsuleContainer.innerHTML = `<div class="groups-loading">正在拉取团播数据…</div>`;
    }

    try {
      const list = await fetchGroups();
      if (state.disposed) return;
      state.groups = list;
      renderCapsules();

      // 默认选中第一个团播（若有灿团则优先选中灿团）
      const defaultGroup = list.find((g) => g.code === "Can") || list[0];
      if (defaultGroup) {
        void selectGroup(defaultGroup.code);
      }
    } catch (err) {
      if (state.disposed) return;
      if (capsuleContainer) {
        capsuleContainer.innerHTML = `<div class="groups-loading" style="color:#ef4444">团播数据拉取失败: ${escapeHtml(err.message)}</div>`;
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

  // 劫持或挂钩 ctx.loadAddTab
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
      renderCapsules();
      // 切换分类后自动选中当前分类下的首个团播
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

  // 8. 绑定各团播胶囊点击
  const capsuleRow = wrapper.querySelector("[data-groups-capsules]");
  if (capsuleRow) {
    capsuleRow.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-group-code]");
      if (!btn) return;
      const code = btn.dataset.groupCode;
      if (code === state.selectedCode) return;
      void selectGroup(code);
    });
  }

  // 9. 绑定「全选在播」按钮
  if (selectLiveBtn) {
    selectLiveBtn.addEventListener("click", () => {
      if (addState.tab !== "groups") return;
      const liveRooms = addState.rooms.filter((room) => {
        const state = ctx.roomStateFor?.(room) || {};
        return !state.disabled && room.liveStatus === "live";
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

  // 10. 绑定 Tab 单选框 change 事件（原生 segctl 监听）
  if (tabRadio) {
    tabRadio.addEventListener("change", () => {
      if (tabRadio.checked) void ctx.loadAddTab("groups");
    });
  }

  // 返回卸载函数（方便随时彻底拆卸）
  return {
    unmount() {
      state.disposed = true;
      ctx.loadAddTab = origLoadAddTab;
      tabRadio?.remove();
      wrapper.querySelector('label[for="at-groups"]')?.remove();
      groupsBox?.remove();
      selectLiveBtn?.remove();
      document.getElementById(STYLE_ID)?.remove();
    }
  };
}
