import { normalizeDanmaku } from "../core/danmaku-render.js";

export function syncDanmakuFields(ctx, tile) {
  const find = (selector) => tile.root.querySelector(selector);
  if (find("[data-dm-mode]")) {
    find("[data-dm-mode]").value = tile.danmaku.mode || "scroll";
  }
  if (find("[data-dm-style]")) {
    find("[data-dm-style]").value = tile.danmaku.scrollStyle || "simple";
  }
  if (find("[data-dm-style-wrap]")) {
    find("[data-dm-style-wrap]").hidden = tile.danmaku.mode === "sidebar";
  }
  if (find("[data-dm-aggregate]")) {
    find("[data-dm-aggregate]").checked = tile.danmaku.aggregate !== false;
  }
  find("[data-dm-size]").value = String(tile.danmaku.size);
  find("[data-dm-speed]").value = String(tile.danmaku.speed);
  find("[data-dm-opacity]").value = String(tile.danmaku.opacity);
  ctx.paintSlider(find("[data-dm-opacity]"));
  find("[data-dm-area]").value = String(tile.danmaku.area);
  if (find("[data-dm-sender]")) {
    find("[data-dm-sender]").checked = tile.danmaku.showSender !== false;
  }
  find("[data-dm-blocked]").value = tile.danmaku.blockedWords.join("\n");
}

export function readDanmakuFields(tile) {
  const find = (selector) => tile.root.querySelector(selector);
  const blockedWords = find("[data-dm-blocked]").value.split(/[\n,，]/).map((word) => word.trim()).filter(Boolean);
  if (blockedWords.length > 50 || blockedWords.some((word) => word.length > 40)) {
    tile.dmStatus.textContent = "最多 50 个屏蔽词，每个不超过 40 字；本次修改未保存";
    return null;
  }
  tile.dmStatus.textContent = "";
  return normalizeDanmaku({
    enabled: tile.danmaku.enabled,
    mode: find("[data-dm-mode]") ? find("[data-dm-mode]").value : "scroll",
    scrollStyle: find("[data-dm-style]") ? find("[data-dm-style]").value : "simple",
    aggregate: find("[data-dm-aggregate]") ? find("[data-dm-aggregate]").checked : true,
    showSender: find("[data-dm-sender]") ? find("[data-dm-sender]").checked : true,
    size: Number(find("[data-dm-size]").value),
    speed: Number(find("[data-dm-speed]").value),
    opacity: Number(find("[data-dm-opacity]").value),
    area: Number(find("[data-dm-area]").value),
    blockedWords
  });
}

export function bindTileDanmaku(ctx, tile) {
  const find = (selector) => tile.root.querySelector(selector);

  const handleDanmakuOptions = () => {
    const next = readDanmakuFields(tile);
    if (!next) return;
    tile.danmaku = next;
    if (find("[data-dm-style-wrap]")) {
      find("[data-dm-style-wrap]").hidden = tile.danmaku.mode === "sidebar";
    }
    ctx.updateTileChrome(tile);
    tile.renderer.update(tile.danmaku, { sidebarEl: tile.dmSidebar, sidebarListEl: tile.dmSidebarList });
    ctx.save();
  };

  find("[data-t-danmaku]").addEventListener("click", () => {
    tile.danmaku = normalizeDanmaku({ ...tile.danmaku, enabled: !tile.danmaku.enabled });
    ctx.updateTileChrome(tile);
    ctx.handleDanmaku(tile);
    ctx.save();
  });

  for (const selector of ["[data-dm-mode]", "[data-dm-style]", "[data-dm-size]", "[data-dm-speed]", "[data-dm-area]"]) {
    find(selector)?.addEventListener("change", handleDanmakuOptions);
  }
  find("[data-dm-sender]")?.addEventListener("change", handleDanmakuOptions);
  find("[data-dm-aggregate]")?.addEventListener("change", handleDanmakuOptions);
  find("[data-dm-opacity]").addEventListener("input", handleDanmakuOptions);
  find("[data-dm-blocked]").addEventListener("change", handleDanmakuOptions);

  find("[data-dm-reset]").addEventListener("click", () => {
    tile.danmaku = normalizeDanmaku({ ...ctx.danmakuDefaults, enabled: tile.danmaku.enabled });
    syncDanmakuFields(ctx, tile);
    ctx.handleDanmaku(tile);
    ctx.save();
  });

  find("[data-dm-apply-all]").addEventListener("click", () => {
    const next = readDanmakuFields(tile);
    if (!next) return;
    tile.danmaku = next;
    ctx.danmakuDefaults = normalizeDanmaku(next);
    ctx.syncDrawerDanmaku();
    for (const other of ctx.tiles.values()) {
      other.danmaku = normalizeDanmaku({ ...ctx.danmakuDefaults, enabled: other.danmaku.enabled });
      syncDanmakuFields(ctx, other);
      ctx.handleDanmaku(other);
      ctx.updateTileChrome(other);
    }
    ctx.handleDanmaku(tile);
    ctx.save();
    ctx.showToast("弹幕设置已应用到全部房间并保存为默认", [], 4e3);
  });
}
