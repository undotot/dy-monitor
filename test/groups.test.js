import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { normalizeGroups, normalizeGroupMembers, BEAR_PAW_CODES } from "../src/features/groups/api.js";
import { mountGroupsFeature } from "../src/features/groups/index.js";

test("normalizeGroups 正确区分熊掌团播与其他团播", () => {
  const mockRaw = [
    { code: "Can", name: "灿团", kind: "fixed", leaderName: "苏阿灿", seasons: [{ name: "S7", status: "active" }] },
    { code: "224", name: "224团播", kind: "fixed", leaderName: "大舅哥", seasons: [{ name: "青训营", status: "completed" }] },
    { code: "320", name: "郎团", kind: "fixed", leaderName: "阿郎", seasons: [{ name: "S1", status: "active" }] },
    { code: "Gu", name: "婺源小团", kind: "small", leaderName: "姑姑", seasons: [{ name: "S1", status: "active" }] }
  ];

  const result = normalizeGroups(mockRaw);
  assert.equal(result.length, 4);

  const can = result.find((g) => g.code === "Can");
  assert.equal(can.isBearPaw, true);
  assert.equal(can.category, "bear");
  assert.equal(can.isActive, true);

  const lang = result.find((g) => g.code === "320");
  assert.equal(lang.isBearPaw, false);
  assert.equal(lang.category, "other");
  assert.equal(lang.isActive, true);
});

test("normalizeGroupMembers 正确提取成员、去重、补充团长角色", () => {
  const mockDetail = {
    code: "Can",
    name: "灿团",
    leader: { roomId: "3903192", name: "苏阿灿户外", avatarUrl: "https://avatar/can.jpg" },
    season: {
      members: [
        { roomId: "3903192", name: "苏阿灿户外", avatarUrl: "https://avatar/can.jpg", isLeader: true },
        { roomId: "3436094", name: "南枫阿i", avatarUrl: "https://avatar/nanfeng.jpg", isCaptain: true },
        { roomId: "10452140", name: "菲菲姐", avatarUrl: "https://avatar/feifei.jpg" },
        { roomId: "10452140", name: "重复菲菲姐" } // 重复项应该被去重
      ]
    }
  };

  const members = normalizeGroupMembers(mockDetail);
  assert.equal(members.length, 3);
  assert.equal(members[0].rid, "3903192");
  assert.equal(members[0].roleText, "团长");
  assert.equal(members[0].isLeader, true);

  assert.equal(members[1].rid, "3436094");
  assert.equal(members[1].roleText, "队长");
  assert.equal(members[1].isCaptain, true);

  assert.equal(members[2].rid, "10452140");
  assert.equal(members[2].roleText, "队员");
});

test("mountGroupsFeature 动态挂载、Tab切换联动与干净卸载", async () => {
  const win = new Window();
  const previousDoc = globalThis.document;
  try {
    globalThis.document = win.document;
    win.document.body.innerHTML = `
      <div class="wrapper">
        <div class="add-tabs"><span class="segctl"><input type="radio" name="add-tab" value="all" id="at-all"><label for="at-all">全部</label></span></div>
        <div class="add-list" data-add-list></div>
        <div class="add-foot">
          <span class="add-status" data-add-status></span>
          <button data-add-select-all class="btn">全选当前列表</button>
        </div>
      </div>
    `;

    const ctx = {
      wrapper: win.document.querySelector(".wrapper"),
      els: {
        addList: win.document.querySelector("[data-add-list]"),
        addStatus: win.document.querySelector("[data-add-status]"),
        addSearch: { value: "" }
      },
      addState: {
        tab: "all",
        rooms: [],
        selected: new Map(),
        generation: 0
      },
      loadAddTab: async (tab) => { ctx.addState.tab = tab; },
      renderAddList: () => {},
      roomStateFor: () => ({ disabled: false })
    };

    // 1. 挂载
    const mounted = mountGroupsFeature(ctx);
    assert.ok(mounted);

    // 验证 DOM 是否注入成功
    const tabRadio = win.document.querySelector("#at-groups");
    assert.ok(tabRadio, "应成功插入 at-groups 选项卡");
    const filterBox = win.document.querySelector("[data-groups-box]");
    assert.ok(filterBox, "应成功插入 groups-filter 容器");
    const liveBtn = win.document.querySelector("[data-groups-select-live]");
    assert.ok(liveBtn, "应成功插入全选在播按钮");

    // 2. 切换 Tab 联动
    await ctx.loadAddTab("groups");
    assert.equal(filterBox.hidden, false, "切到 groups Tab 时 filterBox 应该可见");
    assert.equal(liveBtn.style.display, "", "切到 groups Tab 时 liveBtn 应该可见");

    await ctx.loadAddTab("all");
    assert.equal(filterBox.hidden, true, "切到其他 Tab 时 filterBox 应该隐藏");
    assert.equal(liveBtn.style.display, "none", "切到其他 Tab 时 liveBtn 应该隐藏");

    // 3. 卸载功能并验证无残留
    mounted.unmount();
    assert.equal(win.document.querySelector("#at-groups"), null, "卸载后 at-groups 应被移除");
    assert.equal(win.document.querySelector("[data-groups-box]"), null, "卸载后 filterBox 应被移除");
    assert.equal(win.document.querySelector("[data-groups-select-live]"), null, "卸载后 liveBtn 应被移除");
  } finally {
    if (previousDoc === undefined) delete globalThis.document;
    else globalThis.document = previousDoc;
    win.close();
  }
});
