import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateLegacyWorkspace } from "../src/core/workspace.js";

test("migrateLegacyWorkspace v1 → v2 字段映射", () => {
  const next = migrateLegacyWorkspace({
    schemaVersion: 1,
    columns: 3,
    capacity: 8,
    hevc: true,
    pause: false,
    clock: false,
    resumeMode: "never",
    masterVolume: 0.8,
    autoMute: false,
    controlsVisible: false,
    tiles: [{ rid: "123", rate: 2 }]
  });
  assert.equal(next.schemaVersion, 2);
  assert.equal(next.layoutMode, 3);
  assert.equal(next.hevc, true);
  assert.equal(next.pauseOfficial, false);
  assert.equal(next.clock, false);
  assert.equal(next.resumeMode, "never");
  assert.equal(next.audio.master, 0.8);
  assert.equal(next.audio.autoMute, false);
  assert.equal(next.audio.mode, "mix");
  assert.equal(next.drawerVisible, false);
  assert.equal(next.tiles.length, 1);
});

test("migrateLegacyWorkspace 非法值归位默认", () => {
  const next = migrateLegacyWorkspace({ columns: 9, masterVolume: 5, resumeMode: "x" });
  assert.equal(next.layoutMode, 2);
  assert.equal(next.audio.master, 1);
  assert.equal(next.resumeMode, "ask");
  assert.equal(next.pauseOfficial, true);
  assert.equal(next.audio.autoMute, true);
  assert.deepEqual(next.tiles, []);
});
