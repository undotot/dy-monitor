import test from "node:test";
import assert from "node:assert/strict";
import { createPrototypeState, isRoomAudible, reducePrototype } from "../preview/ui-prototype-model.js";
import { calculateAutomaticLayout } from "../src/core/focus-layout-policy.js";
import { auditRecursiveLayout } from "../src/core/focus-layout-geometry.js";

const run = (state, ...actions) => actions.reduce(reducePrototype, state);

test("原型：选中、放大与仅听分别控制，只有开启跟随后主动放大才切声", () => {
  let state = run(createPrototypeState(), { type: "select", roomId: "02" }, { type: "focus", roomId: "02" });
  assert.equal(state.selectedId, "02");
  assert.equal(state.focusedId, "02");
  assert.equal(state.soloId, "01");
  assert.deepEqual(state.rooms.filter((room) => isRoomAudible(state, room)).map((room) => room.id), ["01"]);
  state = run(state, { type: "follow" }, { type: "select", roomId: "03" });
  assert.equal(state.soloId, "01");
  state = reducePrototype(state, { type: "focus", roomId: "03" });
  assert.equal(state.soloId, "03");
});

test("原型：取消仅听恢复原全局静音，零音量不被仅听暗中提高", () => {
  const initial = { ...createPrototypeState(), soloId: null, globalMuted: true };
  const solo = run(initial, { type: "volume", roomId: "02", value: 0 }, { type: "solo", roomId: "02" });
  assert.equal(solo.rooms[1].volume, 0);
  assert.equal(isRoomAudible(solo, solo.rooms[1]), false);
  assert.equal(solo.globalMuted, false);
  assert.equal(reducePrototype(solo, { type: "solo", roomId: "02" }).globalMuted, true);
});

test("原型：移除仅听对象后保持全部静音，避免其他房间同时出声", () => {
  const state = reducePrototype(createPrototypeState(), { type: "remove", roomId: "01" });
  assert.equal(state.selectedId, "02");
  assert.equal(state.focusedId, null);
  assert.equal(state.soloId, null);
  assert.equal(state.globalMuted, true);
  assert.equal(state.rooms.some((room) => isRoomAudible(state, room)), false);
});

test("原型：两点换位可取消，主窗交换角色但保留房间声音身份", () => {
  const initial = createPrototypeState();
  const cancel = run(initial, { type: "arrange" }, { type: "select", roomId: "01" }, { type: "cancel-arrange" });
  assert.deepEqual(cancel.rooms, initial.rooms);
  const state = run(initial, { type: "arrange" }, { type: "select", roomId: "01" }, { type: "select", roomId: "03" });
  assert.deepEqual(state.rooms.map((room) => room.id), ["03", "02", "01", "04", "05", "06"]);
  assert.equal(state.focusedId, "03");
  assert.equal(state.soloId, "01");
  assert.equal(state.selectedId, "01");
  assert.equal(state.arranging, false);
});

test("原型：跨页签保留待添加项，重复房间不重复添加，数量上限16", () => {
  const state = run(createPrototypeState(), { type: "pending", roomId: "07" }, { type: "room-tab", value: "history" }, { type: "pending", roomId: "09" });
  assert.deepEqual(state.pendingIds, ["07", "09"]);
  const added = run(state, { type: "pending", roomId: "01" }, { type: "add" });
  assert.equal(added.rooms.length, 8);
  assert.equal(new Set(added.rooms.map((room) => room.id)).size, 8);
  assert.equal(createPrototypeState(99).rooms.length, 16);
  assert.equal(createPrototypeState(16).rooms.filter((room) => room.status === "playing").length, 8);
});

test("原型：三种设备的1～16房沿用严格等大小窗算法", () => {
  for (const [width, height] of [[1440, 650], [1194, 584], [600, 650]]) {
    for (let count = 1; count <= 16; count += 1) {
      const state = createPrototypeState(count);
      const plan = calculateAutomaticLayout({ width, height, rooms: state.rooms, mainRoomId: "01", mainWeight: 6, priority: "compromise" });
      assert.equal(plan?.status, "ready", `${width}×${height} / ${count}房`);
      const audit = auditRecursiveLayout(plan, count);
      assert.equal(audit.valid, true, JSON.stringify(audit));
    }
  }
});
