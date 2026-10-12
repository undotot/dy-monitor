import { SCRIPT_VERSION } from "../core/settings.js";
import { iconMarkup } from "./icons.js";
import { rateOptions, sizeOptions, speedOptions, areaOptions, capacityOptions } from "./options.js";

// 整个监控室外壳的 HTML：入口徽标、对话框、顶栏、画格墙、设置抽屉、
// 添加面板、右键菜单、吐司与恢复提示浮层。
export function shellMarkup() {
  return `<button data-entry type="button" class="entry-badge" title="进入监控室" aria-label="进入监控室">${iconMarkup("grid")}进入监控室</button>
    <dialog data-dialog aria-label="监控室">
      <div class="app-shell">
        <div class="topbar-slot" data-topbar-slot>
          <div class="topbar-clip">
        <header class="topbar" id="douyu-monitor-topbar" data-topbar>
          <div class="tb-left">
            <span class="logo">斗</span><span class="brand">监控室</span><span class="ver">MONITOR / ${SCRIPT_VERSION}</span>
            <span class="meta" data-count></span><span class="meta-health ok" data-health></span>
          </div>
          <div class="tb-mid">
            <span class="tb-group"><span class="tb-label">声音</span><select data-audio-mode class="sel sel-sm" aria-label="声音模式"><option value="mix">全部混音</option><option value="solo">独奏选中</option><option value="mute">全部静音</option></select></span>
            <span class="tb-group"><span class="tb-label">主增益</span><input data-master-gain type="range" min="0" max="1" step="0.05" value="0.5" class="slider" aria-label="主增益（按比例作用于每路音量）"><b data-master-pct class="volpct">50%</b></span>
            <span class="tb-group"><span class="tb-label">布局</span><span class="segctl" data-layout-presets>
              <input type="radio" name="layout-preset" value="1" id="lp-1"><label for="lp-1">1×1</label>
              <input type="radio" name="layout-preset" value="2" id="lp-2"><label for="lp-2">2×2</label>
              <input type="radio" name="layout-preset" value="3" id="lp-3"><label for="lp-3">3×3</label>
              <input type="radio" name="layout-preset" value="4" id="lp-4"><label for="lp-4">4×4</label>
              <input type="radio" name="layout-preset" value="auto" id="lp-auto"><label for="lp-auto">自动</label>
            </span></span>
          </div>
          <div class="tb-right">
            <button data-start-all class="btn">全部播放</button>
            <button data-stop-all class="btn">全部停止</button>
            <button data-add-open class="btn primary">${iconMarkup("search")}添加房间</button>
            <button data-exit class="btn exit-btn">${iconMarkup("return")}退出监看</button>
          </div>
        </header>
          </div>
        </div>
        <button data-topbar-collapse type="button" class="topbar-handle" aria-label="收起顶部栏" title="收起顶部栏">${iconMarkup("chevup")}</button>
        <button data-topbar-expand type="button" class="topbar-handle" aria-label="展开顶部栏" title="展开顶部栏" aria-expanded="false" aria-controls="douyu-monitor-topbar" hidden>${iconMarkup("chevdown")}</button>
        <div class="app-body">
          <main data-wall aria-label="多路直播画面" class="wall">
          </main>
          <aside id="douyu-monitor-controls" data-drawer role="region" aria-label="设置" class="drawer" hidden>
            <div class="drawer-head"><h2>设置</h2><span style="flex:1"></span><button data-controls-collapse type="button" class="ibtn" title="收起设置" aria-label="收起设置"></button></div>
            <div class="drawer-body">
              <section class="sec"><h3>播放</h3>
                <div class="frow">
                  <label class="fitem">并发路数 <select data-capacity class="sel sel-sm" aria-label="同时播放路数">${capacityOptions}</select></label>
                  <label class="switchrow inline"><span>请求 H.265</span><span class="switch"><input data-hevc type="checkbox"><i></i></span></label>
                  <label class="switchrow inline"><span>暂停页面主视频</span><span class="switch"><input data-pause type="checkbox" checked><i></i></span></label>
                </div>
                <div class="segrow"><span>打开监控室时</span><span class="segctl">
                  <input type="radio" name="resume-mode" value="ask" id="rm-ask" checked><label for="rm-ask">每次询问</label>
                  <input type="radio" name="resume-mode" value="always" id="rm-always"><label for="rm-always">自动加载</label>
                  <input type="radio" name="resume-mode" value="never" id="rm-never"><label for="rm-never">直接面板</label>
                </span></div>
              </section>
              <section class="sec"><h3>弹幕默认值 · 新房间继承，单格可覆盖</h3>
                <div class="frow">
                  <label class="fitem">字号 <select data-dm-size class="sel sel-sm">${sizeOptions}</select></label>
                  <label class="fitem">速度 <select data-dm-speed class="sel sel-sm">${speedOptions}</select></label>
                  <label class="fitem">透明度 <input data-dm-opacity type="range" min="0.1" max="1" step="0.1" class="slider" style="width:96px"></label>
                  <label class="fitem">区域 <select data-dm-area class="sel sel-sm">${areaOptions}</select></label>
                </div>
                <textarea data-dm-blocked class="p-textarea" maxlength="2048" rows="2" placeholder="屏蔽词，每行一个，或用逗号分隔" style="margin-top:9px"></textarea>
                <div class="frow" style="margin-top:9px"><button data-dm-defaults-save class="btn mini">保存为默认</button><button data-dm-apply-all class="btn mini">应用到全部房间</button></div>
              </section>
              <section class="sec"><h3>声音与提醒</h3>
                <label class="switchrow"><span>新房间打开时静音</span><span class="switch"><input data-automute type="checkbox" checked><i></i></span></label>
                <label class="switchrow"><span>独奏时声音跟随焦点</span><span class="switch"><input data-follow-focus type="checkbox"><i></i></span></label>
                <label class="switchrow"><span>关注房间开播提醒</span><span class="switch"><input data-live-alerts type="checkbox" checked><i></i></span></label>
                <label class="switchrow"><span>提醒声音</span><span class="switch"><input data-live-sound type="checkbox"><i></i></span></label>
                <label class="switchrow"><span>开播后自动取流</span><span class="switch"><input data-live-autoplay type="checkbox" checked><i></i></span></label>
              </section>
              <section class="sec"><h3>工作区预设</h3>
                <div class="preset-row"><select data-preset-select class="sel" aria-label="选择预设"><option value="">选择预设…</option></select><button data-preset-load class="btn mini">载入</button><button data-preset-delete class="btn mini">删除</button></div>
                <div class="preset-row"><input data-preset-name maxlength="24" placeholder="预设名称，如：白天挂机"><button data-preset-save class="btn mini">${iconMarkup("save")}保存当前</button></div>
              </section>
              <section class="sec"><h3>数据管理</h3>
                <div class="frow"><button data-clear-history class="btn mini">清空历史房号</button><span class="fhint">清除本地保存的历史房号缓存</span></div>
              </section>
              <section class="sec"><h3>诊断 · <span data-log-count>0</span> 条</h3>
                <div class="frow"><button data-copy class="btn mini">复制诊断</button><button data-clear class="btn mini">清空</button></div>
                <pre data-logs class="logs"></pre>
              </section>
            </div>
          </aside>
        </div>
        <button data-controls-toggle type="button" class="controls-handle" title="展开设置" aria-label="展开设置" aria-expanded="false" aria-controls="douyu-monitor-controls">${iconMarkup("chevr")}</button>
        <section data-add-panel class="add-panel" hidden aria-label="添加房间">
          <div class="add-card">
            <div class="add-head">
              <h2>添加房间</h2>
              <label class="field">${iconMarkup("search")}<input data-add-search aria-label="房号、链接或主播名" autocomplete="off" maxlength="2048" placeholder="房号 / 斗鱼链接 / 主播名（回车搜索）"></label>
              <label class="fitem"><span class="tb-label">新房间画质</span><select data-default-rate class="sel sel-sm">${rateOptions}</select></label>
              <button data-add-close type="button" class="ibtn" title="关闭" aria-label="关闭添加面板">${iconMarkup("close")}</button>
            </div>
            <div class="add-tabs">
              <span class="segctl">
                <input type="radio" name="add-tab" value="all" id="at-all" checked><label for="at-all">关注 · 全部</label>
                <input type="radio" name="add-tab" value="history" id="at-history"><label for="at-history">添加历史</label>
                <input type="radio" name="add-tab" value="manual" id="at-manual"><label for="at-manual">手动房号</label>
              </span>
            </div>
            <div data-add-list class="add-list"></div>
            <div class="add-foot">
              <span class="add-status" data-add-status role="status"></span>
              <button data-add-selected class="btn">添加选中</button>
              <button data-add-select-all class="btn" aria-pressed="false">全选当前列表</button>
            </div>
          </div>
        </section>
        <div data-ctx class="ctx-menu" hidden></div>
        <div data-toast class="toast" hidden><span data-toast-text class="toast-text"></span><span data-toast-actions class="toast-actions"></span></div>
        <section data-resume-prompt class="overlay" hidden>
          <div class="modal">
            <p class="modal-title" data-resume-title>是否加载上次的直播间？</p>
            <p data-resume-detail class="modal-sub"></p>
            <div class="modal-actions"><button data-resume-yes class="btn primary">加载上次直播间</button><button data-resume-no class="btn">暂不加载</button></div>
            <label class="switchrow"><span>记住选择，下次不再询问</span><span class="switch"><input data-resume-remember type="checkbox"><i></i></span></label>
          </div>
        </section>
      </div>
    </dialog>`;
}
