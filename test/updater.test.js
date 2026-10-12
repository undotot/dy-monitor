import test from "node:test";
import assert from "node:assert/strict";
import { isNewerVersion, extractVersionFromMeta, findHighestVersion, extractVersionFromResponse } from "../src/app/updater.js";
import { getDownloadUrl } from "../src/core/settings.js";

test("isNewerVersion 基础比对", () => {
  assert.equal(isNewerVersion("1.2.21", "1.2.20"), true, "patch 递增应判定为有新版");
  assert.equal(isNewerVersion("1.3.0", "1.2.20"), true, "minor 递增应判定为有新版");
  assert.equal(isNewerVersion("2.0.0", "1.9.99"), true, "major 递增应判定为有新版");
  assert.equal(isNewerVersion("1.2.20", "1.2.20"), false, "相同版本应判定为无新版");
  assert.equal(isNewerVersion("1.2.19", "1.2.20"), false, "旧版本应判定为无新版");
});

test("findHighestVersion 多镜像多源版本挑选", () => {
  assert.equal(findHighestVersion(["1.2.20", "1.2.23", "1.2.25"]), "1.2.25", "应选出最高版本");
  assert.equal(findHighestVersion(["1.2.25", "1.2.20"]), "1.2.25", "即使滞后缓存排在后也应选最高版");
  assert.equal(findHighestVersion(["v1.2.26", "1.2.25"]), "v1.2.26", "容错 v 前缀");
  assert.equal(findHighestVersion([]), null);
  assert.equal(findHighestVersion([null, undefined, ""]), null);
});

test("isNewerVersion 带 v 前缀或空格容错", () => {
  assert.equal(isNewerVersion("v1.2.21", "1.2.20"), true);
  assert.equal(isNewerVersion(" 1.2.21 ", "v1.2.20"), true);
  assert.equal(isNewerVersion("1.2.20-beta", "1.2.20"), false);
  assert.equal(isNewerVersion("1.2.21.1", "1.2.21"), true);
  assert.equal(isNewerVersion("", "1.2.20"), false);
  assert.equal(isNewerVersion(null, "1.2.20"), false);
});

test("extractVersionFromMeta 提取 @version 标签", () => {
  const metaSample = `
// ==UserScript==
// @name         监控室 · 试用版
// @namespace    https://github.com/undotot/monitor-js
// @version      1.2.21
// @description  斗鱼我的关注页多路监看
// @updateURL    https://fastly.jsdelivr.net/gh/undotot/monitor-js@main/douyu-monitor.meta.js
// ==/UserScript==
  `;
  assert.equal(extractVersionFromMeta(metaSample), "1.2.21");

  // 单行注释容错
  assert.equal(extractVersionFromMeta("// @version 1.3.0"), "1.3.0");
  assert.equal(extractVersionFromMeta("//   @version    2.0.5   \n"), "2.0.5");
  assert.equal(extractVersionFromMeta("no version here"), null);
  assert.equal(extractVersionFromMeta(""), null);
});

test("extractVersionFromResponse 解析 jsDelivr API JSON", () => {
  const jsonSample = JSON.stringify({
    type: "gh",
    name: "undotot/monitor-js",
    tags: {},
    versions: [
      { version: "1.2.30" },
      { version: "1.2.29" },
      { version: "1.2.20" }
    ]
  });
  assert.equal(extractVersionFromResponse(jsonSample, "https://data.jsdelivr.com/v1/packages/gh/undotot/monitor-js"), "1.2.30");

  const jsonWithTags = JSON.stringify({
    tags: { latest: "1.2.31" },
    versions: [{ version: "1.2.30" }]
  });
  assert.equal(extractVersionFromResponse(jsonWithTags, "https://data.jsdelivr.com/v1/packages/gh/undotot/monitor-js"), "1.2.31");

  // 回退解析 meta.js
  const metaSample = "// @version 1.2.30\n";
  assert.equal(extractVersionFromResponse(metaSample, "https://cdn.jsdelivr.net/gh/undotot/monitor-js@main/douyu-monitor.meta.js"), "1.2.30");
});

test("getDownloadUrl 生成 jsDelivr 精确 Tag 直链", () => {
  assert.equal(
    getDownloadUrl("1.2.30"),
    "https://cdn.jsdelivr.net/gh/undotot/monitor-js@1.2.30/douyu-monitor.user.js"
  );
  assert.equal(
    getDownloadUrl("v1.2.30"),
    "https://cdn.jsdelivr.net/gh/undotot/monitor-js@1.2.30/douyu-monitor.user.js"
  );
  assert.equal(
    getDownloadUrl(),
    "https://cdn.jsdelivr.net/gh/undotot/monitor-js@main/douyu-monitor.user.js"
  );
});
