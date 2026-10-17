// 快捷键与 Esc 分层后退已按需求暂时移除（原先分层：右键菜单 → 添加面板 → 恢复提示 →
// 吐司 → 画格设置 → 取消选择 → 收抽屉 → 退出确认）。恢复时在此重建 keymap 与 handleEscape，
// 并把 shell.js 里 dialog 的 cancel 拦截接回分层逻辑。
// 本模块仅剩退出确认（挂给顶栏“退出监看”按钮），保留 init 顺序避免 topbar 取不到句柄。
export function initKeyboard(ctx) {
  const prompt = ctx.wrapper.querySelector("[data-exit-prompt]");
  const close = () => {
    if (prompt) prompt.hidden = true;
    ctx.wrapper.querySelector("[data-more-open]")?.focus?.({ preventScroll: true });
  };
  ctx.showExitConfirm = () => {
    if (!prompt) {
      ctx.showToast("退出监控室：将停止全部播放并返回我的关注，布局与配置保留。", [
        { label: "退出监看", primary: true, onClick: ctx.handleClose },
        { label: "取消" }
      ], 12e3);
      return;
    }
    prompt.hidden = false;
    prompt.querySelector("[data-exit-no]")?.focus?.({ preventScroll: true });
  };
  prompt?.querySelector("[data-exit-yes]")?.addEventListener("click", () => {
    prompt.hidden = true;
    ctx.handleClose();
  });
  prompt?.querySelector("[data-exit-no]")?.addEventListener("click", close);
}
