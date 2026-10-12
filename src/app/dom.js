import { roomDisplayName } from "../core/room-name.js";

// 基础工具：滑杆着色、诊断日志、提示条、提示音。
export function initDom(ctx) {
  const { els } = ctx;

  ctx.paintSlider = (el) => {
    if (el) el.style.setProperty("--v", `${Math.round(Number(el.value) * 100)}%`);
  };

  ctx.log = (rid, message) => {
    const tile = [...ctx.tiles.values()].find((entry) => entry.rid === String(rid));
    ctx.logs.push(`${new Date().toLocaleTimeString()} ${rid ? `[${tile ? roomDisplayName(tile) : "直播间"}] ` : ""}${message}`);
    if (ctx.logs.length > 150) ctx.logs.shift();
    els.logs.textContent = ctx.logs.join("\n");
    els.logCount.textContent = String(ctx.logs.length);
  };

  ctx.hideToast = () => {
    els.toast.hidden = true;
    clearTimeout(ctx.toastTimer);
  };

  ctx.showToast = (text, actions = [], timeout = 0) => {
    clearTimeout(ctx.toastTimer);
    els.toastText.textContent = text;
    els.toastActions.replaceChildren();
    for (const action of actions) {
      const button = document.createElement("button");
      button.className = `btn mini${action.primary ? " primary" : ""}`;
      button.textContent = action.label;
      button.addEventListener("click", () => {
        ctx.hideToast();
        action.onClick?.();
      });
      els.toastActions.append(button);
    }
    els.toast.hidden = false;
    if (timeout) ctx.toastTimer = setTimeout(ctx.hideToast, timeout);
  };

  ctx.beep = () => {
    try {
      const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
      const AudioCtor = pageWindow.AudioContext || pageWindow.webkitAudioContext;
      const audioCtx = new AudioCtor();
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.07;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.22);
      osc.onended = () => audioCtx.close();
    } catch {
    }
  };
}
