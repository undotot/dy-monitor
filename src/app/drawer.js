import { normalizeDanmaku } from "../core/danmaku-render.js";
import { PRESET_KEY, SCRIPT_VERSION } from "../core/settings.js";
import { storage } from "../platform/storage.js";
import { clearHistory } from "../api/history.js";
import { setIconButton } from "../ui/icons.js";

// 设置抽屉：开合与边缘唤起、播放/弹幕/声音/预设/诊断各区块的绑定。
export function initDrawer(ctx) {
  const els = ctx.els;
  const query = (selector) => ctx.wrapper.querySelector(selector);

  ctx.handleDrawer = (visible, { focus = true, remember = true } = {}) => {
    els.drawer.hidden = !visible;
    ctx.appShell.classList.toggle("drawer-open", visible);
    ctx.appShell.classList.remove("edge-near");
    els.controlsButton.setAttribute("aria-expanded", String(visible));
    setIconButton(els.controlsButton, visible ? "chevrr" : "chevr", visible ? "收起设置" : "展开设置");
    if (remember) {
      ctx.drawerPreference = visible;
      if (ctx.opened) ctx.save();
    }
    if (focus) {
      if (visible) els.drawer.querySelector("button, input, select")?.focus();
      else els.controlsButton.focus();
    }
  };

  ctx.appShell.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || !ctx.opened) return;
    const rect = ctx.appShell.getBoundingClientRect();
    const distance = rect.right - event.clientX;
    ctx.appShell.classList.toggle("edge-near", els.drawer.hidden && distance >= 0 && distance <= 56);
  }, { passive: true });
  ctx.appShell.addEventListener("pointerleave", () => ctx.appShell.classList.remove("edge-near"));
  els.controlsButton.addEventListener("click", () => ctx.handleDrawer(els.drawer.hidden));
  query("[data-controls-collapse]").addEventListener("click", () => ctx.handleDrawer(false));

  /* --- 弹幕默认值 --- */
  ctx.syncDrawerDanmaku = () => {
    query("[data-dm-size]").value = String(ctx.danmakuDefaults.size);
    query("[data-dm-speed]").value = String(ctx.danmakuDefaults.speed);
    query("[data-dm-opacity]").value = String(ctx.danmakuDefaults.opacity);
    ctx.paintSlider(query("[data-dm-opacity]"));
    query("[data-dm-area]").value = String(ctx.danmakuDefaults.area);
    query("[data-dm-blocked]").value = ctx.danmakuDefaults.blockedWords.join("\n");
  };
  const readDrawerDanmaku = () => normalizeDanmaku({
    enabled: true,
    size: Number(query("[data-dm-size]").value),
    speed: Number(query("[data-dm-speed]").value),
    opacity: Number(query("[data-dm-opacity]").value),
    area: Number(query("[data-dm-area]").value),
    blockedWords: query("[data-dm-blocked]").value.split(/[\n,，]/).map((word) => word.trim()).filter(Boolean)
  });
  for (const selector of ["[data-dm-size]", "[data-dm-speed]", "[data-dm-area]"]) query(selector).addEventListener("change", () => {
    ctx.danmakuDefaults = readDrawerDanmaku();
    ctx.save();
  });
  query("[data-dm-opacity]").addEventListener("input", (event) => {
    ctx.paintSlider(event.target);
    ctx.danmakuDefaults = readDrawerDanmaku();
    ctx.save();
  });
  query("[data-dm-blocked]").addEventListener("change", () => {
    ctx.danmakuDefaults = readDrawerDanmaku();
    ctx.save();
  });
  query("[data-dm-defaults-save]").addEventListener("click", () => {
    ctx.danmakuDefaults = readDrawerDanmaku();
    ctx.save();
    ctx.showToast("弹幕默认值已保存；新房间将继承", [], 4e3);
  });
  query("[data-dm-apply-all]").addEventListener("click", () => {
    ctx.danmakuDefaults = readDrawerDanmaku();
    for (const tile of ctx.tiles.values()) {
      tile.danmaku = normalizeDanmaku({ ...ctx.danmakuDefaults, enabled: tile.danmaku.enabled });
      ctx.syncDanmakuFields(tile);
      ctx.handleDanmaku(tile);
      ctx.updateTileChrome(tile);
    }
    ctx.save();
    ctx.showToast("弹幕默认值已应用到全部房间", [], 4e3);
  });

  /* --- 播放与提醒 --- */
  query("[data-capacity]").addEventListener("change", () => {
    ctx.scheduler.capacity = Number(query("[data-capacity]").value);
    const excess = [...ctx.tiles.values()].filter((tile) => ctx.scheduler.active.has(tile.id)).slice(ctx.scheduler.capacity);
    for (const tile of excess) ctx.stop(tile, "调整并发额度，等待排队");
    ctx.scheduler.drain();
    for (const tile of excess) void ctx.handleStart(tile);
    ctx.updateCount();
    ctx.save();
  });
  query("[data-hevc]").addEventListener("change", () => {
    ctx.hevc = query("[data-hevc]").checked;
    ctx.save();
    ctx.showToast("编码设置将在下一次播放 / 重试时生效。", [], 4e3);
  });
  query("[data-pause]").addEventListener("change", () => {
    ctx.pauseOfficialEnabled = query("[data-pause]").checked;
    if (ctx.opened && ctx.pauseOfficialEnabled) ctx.pauseOfficial();
    ctx.save();
  });
  for (const el of ctx.wrapper.querySelectorAll("[name=resume-mode]")) el.addEventListener("change", () => {
    ctx.resumeMode = query("[name=resume-mode]:checked")?.value || "ask";
    ctx.save();
  });
  query("[data-automute]").addEventListener("change", () => {
    ctx.audio.autoMute = query("[data-automute]").checked;
    ctx.save();
  });
  query("[data-follow-focus]").addEventListener("change", () => {
    ctx.audio.followFocus = query("[data-follow-focus]").checked;
    ctx.applyAudioAll();
    ctx.save();
  });
  query("[data-live-alerts]").addEventListener("change", () => {
    ctx.liveAlerts = query("[data-live-alerts]").checked;
    if (ctx.liveAlerts) {
      try {
        if (typeof GM_notification !== "function") {
          const pageWindow = typeof unsafeWindow !== "undefined" && unsafeWindow?.Notification
            ? unsafeWindow
            : (typeof window !== "undefined" ? window : globalThis);
          const Notif = pageWindow?.Notification;
          if (Notif && Notif.permission === "default" && typeof Notif.requestPermission === "function") {
            void Notif.requestPermission();
          }
        }
      } catch {
      }
    }
    ctx.save();
  });
  query("[data-live-sound]").addEventListener("change", () => {
    ctx.liveAlertSound = query("[data-live-sound]").checked;
    if (ctx.liveAlertSound) ctx.beep();
    ctx.save();
  });
  query("[data-live-autoplay]").addEventListener("change", () => {
    ctx.liveAutoPlay = query("[data-live-autoplay]").checked;
    ctx.save();
  });
  /* --- 工作区预设 --- */
  const loadPresets = () => {
    try {
      const value = storage.get(PRESET_KEY, []);
      return Array.isArray(value) ? value.filter((preset) => preset && typeof preset.name === "string" && preset.data) : [];
    } catch {
      return [];
    }
  };
  const refreshPresetSelect = (keepValue = "") => {
    const selectEl = query("[data-preset-select]");
    const presets = loadPresets();
    selectEl.replaceChildren(new Option("选择预设…", ""));
    for (const preset of presets) selectEl.append(new Option(preset.name, preset.name));
    if (keepValue) selectEl.value = keepValue;
  };
  ctx.refreshPresetSelect = refreshPresetSelect;
  query("[data-preset-save]").addEventListener("click", () => {
    const name = query("[data-preset-name]").value.trim().slice(0, 24);
    if (!name) {
      ctx.showToast("请先填写预设名称", [], 4e3);
      return;
    }
    try {
      const presets = loadPresets().filter((preset) => preset.name !== name);
      presets.push({ name, data: ctx.serializeWorkspace() });
      storage.set(PRESET_KEY, presets.slice(0, 20));
      refreshPresetSelect(name);
      query("[data-preset-name]").value = "";
      ctx.showToast(`预设「${name}」已保存`, [], 4e3);
    } catch {
      ctx.showToast("预设保存失败", [], 4e3);
    }
  });
  query("[data-preset-load]").addEventListener("click", () => {
    const name = query("[data-preset-select]").value;
    const preset = loadPresets().find((entry) => entry.name === name);
    if (!preset) {
      ctx.showToast("请先选择预设", [], 4e3);
      return;
    }
    ctx.showToast(`载入预设「${name}」将替换当前房间与设置。`, [
      { label: "载入", primary: true, onClick: () => ctx.applyWorkspace(preset.data, true) },
      { label: "取消" }
    ], 12e3);
  });
  query("[data-preset-delete]").addEventListener("click", () => {
    const name = query("[data-preset-select]").value;
    if (!name) return;
    storage.set(PRESET_KEY, loadPresets().filter((preset) => preset.name !== name));
    refreshPresetSelect();
    ctx.showToast(`预设「${name}」已删除`, [], 4e3);
  });

  /* --- 数据管理 --- */
  query("[data-clear-history]")?.addEventListener("click", () => {
    ctx.showToast("确定清空全部历史房号记录吗？", [
      {
        label: "确定清空",
        primary: true,
        onClick: () => {
          clearHistory();
          ctx.showToast("历史房号已清空", [], 3e3);
        }
      },
      { label: "取消" }
    ], 8e3);
  });

  /* --- 诊断 --- */
  query("[data-copy]").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(`监控室 ${SCRIPT_VERSION}\n${navigator.userAgent}\n${ctx.logs.join("\n")}`);
      ctx.showToast("诊断已复制", [], 4e3);
    } catch {
      ctx.showToast("剪贴板不可用，请手动选择诊断文本复制", [], 6e3);
    }
  });
  query("[data-clear]").addEventListener("click", () => {
    ctx.logs.length = 0;
    els.logs.textContent = "";
    els.logCount.textContent = "0";
  });
}
