import { SCRIPT_VERSION, DOWNLOAD_USER_URL } from "../core/settings.js";
import { iconMarkup } from "./icons.js";
import { rateOptions, capacityOptions } from "./options.js";
import { danmakuControlsMarkup } from "./danmaku-controls.js";
import { inspectorMarkup, commandBarMarkup, roomSheetMarkup } from "./room-panel.js";

// 整个监控室外壳的 HTML：入口徽标、顶栏、画墙、当前房间检查器、
// 触屏底部控制条/房间面板、设置面板、添加房间、浮层与恢复提示。
export function shellMarkup() {
  return `<button data-entry type="button" class="entry-badge" title="进入监控室" aria-label="进入监控室">${iconMarkup("grid")}进入监控室</button>
    <dialog data-dialog aria-label="监控室">
      <div class="app-shell">
        <div class="topbar-slot" data-topbar-slot>
          <div class="topbar-clip">
            <header class="topbar" id="douyu-monitor-topbar" data-topbar>
              <div class="tb-left">
                <span class="logo">斗</span><span class="brand">监控室</span>
                <div class="ver-badge-wrap" data-update-wrap>
                  <a href="${DOWNLOAD_USER_URL}" target="_blank" rel="noopener noreferrer" class="ver" data-ver-badge title="当前版本 v${SCRIPT_VERSION}">
                    <span class="ver-pulse-dot" data-ver-dot hidden></span>
                    <span class="ver-text">MONITOR / ${SCRIPT_VERSION}</span>
                    <span class="ver-new-tag" data-ver-tag hidden>NEW</span>
                  </a>
                  <div class="update-tooltip" data-update-tooltip hidden>
                    <div class="tooltip-header">
                      <span class="tooltip-title">✨ 发现新版本</span>
                      <span class="tooltip-version" data-remote-version>v...</span>
                    </div>
                    <div class="tooltip-body">
                      <p>新版本已发布至 CDN 极速镜像。</p>
                      <p>点击下方按钮即可调起油猴覆盖安装更新。</p>
                    </div>
                    <a href="${DOWNLOAD_USER_URL}" target="_blank" rel="noopener noreferrer" class="btn-upgrade">立即升级 (打开油猴安装)</a>
                  </div>
                </div>
                <span class="meta" data-count></span><span class="meta-health ok" data-health></span>
              </div>
              <div class="tb-right">
                <button data-inspector-toggle type="button" class="btn icon-btn" title="展开 / 收起当前房间面板" aria-label="展开或收起当前房间面板" aria-expanded="true">${iconMarkup("sliders")}</button>
                <div class="tb-pop-wrap">
                  <button data-pop="layout" type="button" class="btn" aria-expanded="false" title="布局方式" aria-label="布局方式">${iconMarkup("grid")}<span class="btn-label">布局</span><span class="pop-caret">${iconMarkup("chevdown")}</span></button>
                  <div class="tb-pop-panel" data-pop-panel="layout" hidden>
                    <p class="pop-title">布局方式</p>
                    <span class="segctl layout-presets" data-layout-presets>
                      <input type="radio" name="layout-preset" value="1" id="lp-1"><label for="lp-1">1 列</label>
                      <input type="radio" name="layout-preset" value="2" id="lp-2"><label for="lp-2">2 列</label>
                      <input type="radio" name="layout-preset" value="3" id="lp-3"><label for="lp-3">3 列</label>
                      <input type="radio" name="layout-preset" value="4" id="lp-4"><label for="lp-4">4 列</label>
                      <input type="radio" name="layout-preset" value="auto" id="lp-auto"><label for="lp-auto">自动</label>
                    </span>
                    <p class="pop-hint">列数固定，行数按房间数自动补充；所有房间保持同屏。</p>
                  </div>
                </div>
                <div class="tb-pop-wrap">
                  <button data-pop="sound" type="button" class="btn" aria-expanded="false" title="声音范围" aria-label="声音设置">${iconMarkup("volume")}<span class="btn-label">声音</span><span class="pop-caret">${iconMarkup("chevdown")}</span></button>
                  <div class="tb-pop-panel" data-pop-panel="sound" hidden>
                    <p class="pop-title">声音范围</p>
                    <label class="pop-field"><span>模式</span><select data-audio-mode class="sel sel-sm" aria-label="声音模式"><option value="mix">全部混音</option><option value="solo">独奏房间</option><option value="mute">全部静音</option></select></label>
                    <label class="pop-field"><span>主增益</span><input data-master-gain type="range" min="0" max="1" step="0.05" value="0.5" class="slider" aria-label="主增益（按比例作用于每路音量）"><b data-master-pct class="volpct">50%</b></label>
                    <p class="pop-hint">主增益按比例作用于每路音量；单房音量在右侧“当前房间”里调整。</p>
                  </div>
                </div>
                <button data-add-open type="button" class="btn primary add-room-btn" aria-label="添加房间">${iconMarkup("search")}<span class="btn-label">添加房间</span></button>
                <div class="tb-more-wrap">
                  <button data-more-open type="button" class="btn icon-btn" aria-label="更多全局操作" aria-expanded="false">${iconMarkup("more")}</button>
                  <div class="tb-more-menu" data-more-menu hidden>
                    <button type="button" data-start-all>${iconMarkup("play")}全部播放</button>
                    <button type="button" data-stop-all>${iconMarkup("pause")}全部停止</button>
                    <span class="tb-menu-sep"></span>
                    <button type="button" data-dm-global-open>${iconMarkup("chat")}全局弹幕设置</button>
                    <button type="button" data-reorder-open>${iconMarkup("layers")}整理位置</button>
                    <button type="button" data-settings-open>${iconMarkup("settings")}设置</button>
                    <span class="tb-menu-sep"></span>
                    <button type="button" data-exit class="danger">${iconMarkup("return")}退出监看</button>
                  </div>
                </div>
                <button data-topbar-collapse type="button" class="btn icon-btn collapse-btn" aria-label="收起顶部栏" title="收起顶部栏">${iconMarkup("chevup")}</button>
              </div>
            </header>
          </div>
        </div>
        <button data-topbar-expand type="button" class="topbar-mini" aria-label="展开顶部栏" aria-expanded="false" aria-controls="douyu-monitor-topbar" hidden><span class="logo mini">斗</span><b>监控室</b><span data-mini-count class="meta"></span><span class="mini-chev">${iconMarkup("chevdown")}</span></button>
        <div class="app-body">
          <main data-wall aria-label="多路直播画面" class="wall"></main>
          <div class="focus-banner" data-focus-banner hidden><i class="dot g"></i><span class="focus-banner-label">主画面</span><b data-focus-name></b><button type="button" data-focus-exit>恢复平铺</button></div>
          ${inspectorMarkup()}
        </div>
        ${commandBarMarkup()}
        ${roomSheetMarkup()}
        <div class="drawer-backdrop" data-drawer-backdrop hidden></div>
        <aside id="douyu-monitor-controls" data-drawer role="region" aria-label="设置" class="drawer" hidden>
          <div class="drawer-head"><h2>设置</h2><span class="drawer-head-hint">播放 · 弹幕 · 声音 · 工作区</span><button data-controls-collapse type="button" class="ibtn" title="关闭设置" aria-label="关闭设置">${iconMarkup("close")}</button></div>
          <div class="drawer-tabs" role="tablist" aria-label="设置分类">
            <button type="button" class="is-active" data-settings-tab="play" role="tab" aria-selected="true">${iconMarkup("play")}播放</button>
            <button type="button" data-settings-tab="danmaku" role="tab" aria-selected="false">${iconMarkup("chat")}弹幕</button>
            <button type="button" data-settings-tab="sound" role="tab" aria-selected="false">${iconMarkup("volume")}声音</button>
            <button type="button" data-settings-tab="workspace" role="tab" aria-selected="false">${iconMarkup("save")}工作区</button>
            <button type="button" data-settings-tab="diagnostics" role="tab" aria-selected="false">${iconMarkup("activity")}诊断</button>
          </div>
          <div class="drawer-body">
            <section class="sec" data-settings-section="play"><h3>播放</h3>
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
            <section class="sec dm-global-controls" data-dm-global data-settings-section="danmaku" tabindex="-1" aria-label="全局弹幕设置"><h3>弹幕默认</h3>
              ${danmakuControlsMarkup(true)}
            </section>
            <section class="sec" data-settings-section="sound"><h3>声音与提醒</h3>
              <label class="switchrow"><span>新房间打开时静音</span><span class="switch"><input data-automute type="checkbox" checked><i></i></span></label>
              <label class="switchrow"><span>独奏时声音跟随焦点</span><span class="switch"><input data-follow-focus type="checkbox"><i></i></span></label>
              <label class="switchrow"><span>关注房间开播提醒</span><span class="switch"><input data-live-alerts type="checkbox" checked><i></i></span></label>
              <label class="switchrow"><span>提醒声音</span><span class="switch"><input data-live-sound type="checkbox"><i></i></span></label>
              <label class="switchrow"><span>开播后自动取流</span><span class="switch"><input data-live-autoplay type="checkbox" checked><i></i></span></label>
            </section>
            <section class="sec" data-settings-section="workspace"><h3>工作区预设</h3>
              <div class="preset-row"><select data-preset-select class="sel" aria-label="选择预设"><option value="">选择预设…</option></select><button data-preset-load class="btn mini">载入</button><button data-preset-delete class="btn mini">删除</button></div>
              <div class="preset-row"><input data-preset-name maxlength="24" placeholder="预设名称，如：白天挂机"><button data-preset-save class="btn mini">${iconMarkup("save")}保存当前</button></div>
            </section>
            <section class="sec" data-settings-section="workspace"><h3>数据管理</h3>
              <div class="frow"><button data-clear-history class="btn mini">清空历史房号</button><span class="fhint">清除本地保存的历史房号缓存</span></div>
            </section>
            <section class="sec" data-settings-section="diagnostics"><h3>诊断 · <span data-log-count>0</span> 条</h3>
              <div class="frow"><button data-copy class="btn mini">复制诊断</button><button data-clear class="btn mini">清空</button></div>
              <pre data-logs class="logs"></pre>
            </section>
          </div>
        </aside>
        <button data-controls-toggle type="button" class="controls-handle" title="设置" aria-label="设置" aria-expanded="false" aria-controls="douyu-monitor-controls" hidden>${iconMarkup("settings")}</button>
        <section data-add-panel class="add-panel" hidden aria-label="添加房间">
          <div class="add-card">
            <div class="add-grab" aria-hidden="true"></div>
            <div class="add-head">
              <div class="add-head-copy"><h2 data-add-title>添加房间</h2><p>关注、历史、团播或房号，选中后一次加入。</p></div>
              <button data-add-close type="button" class="ibtn" title="关闭" aria-label="关闭添加面板">${iconMarkup("close")}</button>
            </div>
            <div class="add-search-row">
              <label class="field">${iconMarkup("search")}<input data-add-search aria-label="房号、链接或主播名" autocomplete="off" maxlength="2048" placeholder="房号 / 斗鱼链接 / 主播名"></label>
              <button data-add-search-go type="button" class="btn">搜索</button>
            </div>
            <div class="add-tabs-row">
              <div class="add-tabs">
                <span class="segctl">
                  <input type="radio" name="add-tab" value="all" id="at-all" checked><label for="at-all">关注 · 全部</label>
                  <input type="radio" name="add-tab" value="history" id="at-history"><label for="at-history">添加历史</label>
                  <input type="radio" name="add-tab" value="manual" id="at-manual"><label for="at-manual">手动房号</label>
                </span>
              </div>
              <label class="fitem add-rate" data-add-rate-wrap><span>新房间画质</span><select data-default-rate class="sel sel-sm">${rateOptions}</select></label>
            </div>
            <div data-add-list class="add-list"></div>
            <button data-add-search-more type="button" class="btn add-more" hidden>加载更多主播</button>
            <div class="add-foot">
              <span class="add-status" data-add-status role="status"></span>
              <button data-add-selected class="btn primary">添加选中</button>
              <button data-add-select-all class="btn" aria-pressed="false">全选当前列表</button>
            </div>
          </div>
        </section>
        <div data-ctx class="ctx-menu" hidden></div>
        <div data-toast class="toast" hidden><span data-toast-text class="toast-text"></span><span data-toast-actions class="toast-actions"></span></div>
        <div class="reorder-bar" data-reorder-bar hidden><span class="reorder-copy">${iconMarkup("layers")}整理位置 · 依次点两个画面交换</span><span class="reorder-actions"><button type="button" class="btn mini" data-reorder-cancel>取消</button><button type="button" class="btn mini primary" data-reorder-done>完成</button></span></div>
        <section data-resume-prompt class="overlay" hidden>
          <div class="modal">
            <p class="modal-title" data-resume-title>是否加载上次的直播间？</p>
            <p data-resume-detail class="modal-sub"></p>
            <div class="modal-actions"><button data-resume-yes class="btn primary">加载上次直播间</button><button data-resume-no class="btn">暂不加载</button></div>
            <label class="switchrow"><span>记住选择，下次不再询问</span><span class="switch"><input data-resume-remember type="checkbox"><i></i></span></label>
          </div>
        </section>
        <section data-exit-prompt class="overlay" hidden>
          <div class="modal">
            <p class="modal-title">退出监看？</p>
            <p class="modal-sub">将停止全部播放并返回“我的关注”，当前布局与房间配置会保留。</p>
            <div class="modal-actions"><button data-exit-yes class="btn primary">退出监看</button><button data-exit-no class="btn">继续观看</button></div>
          </div>
        </section>
      </div>
    </dialog>`;
}
