// [插件独立模块] 团播 UI 模板（方案 A：电竞暗色横向滑轨卡片）

export function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function groupsTabMarkup() {
  return `<input type="radio" name="add-tab" value="groups" id="at-groups"><label for="at-groups" data-tab-label="groups">团播</label>`;
}

export function groupsFilterMarkup() {
  return `<div class="groups-filter-box" data-groups-box hidden>
    <div class="groups-cat-bar">
      <div class="groups-cat-pills" data-groups-cats>
        <button type="button" class="groups-cat-pill is-active" data-group-cat="all">全部 <span class="groups-cat-count" data-cat-count="all">12</span></button>
        <button type="button" class="groups-cat-pill" data-group-cat="bear">🐾 熊掌团播 <span class="groups-cat-count" data-cat-count="bear">4</span></button>
        <button type="button" class="groups-cat-pill" data-group-cat="other">其他团播 <span class="groups-cat-count" data-cat-count="other">8</span></button>
      </div>
      <div class="groups-current-badge" data-groups-current-info>选择团播</div>
    </div>
    <div class="groups-track-wrapper">
      <div class="groups-track-scroller" data-groups-capsules>
        <div class="groups-loading">正在拉取团播数据…</div>
      </div>
      <div class="groups-track-fade" aria-hidden="true"></div>
    </div>
  </div>`;
}

export function groupCardMarkup(g, isActive) {
  const activeCls = isActive ? " is-active" : "";
  const bearCls = g.isBearPaw ? " is-bear" : "";
  const seasonText = g.seasonName ? `[${escapeHtml(g.seasonName)}]` : "";
  const statusCls = g.isActive ? "is-live" : "is-ended";
  const statusText = g.isActive ? "🟢 进行中" : "⚪ 已结营";
  const kindText = g.isBearPaw ? "熊掌" : g.kind;

  // 团长小头像
  const avatarHtml = g.leaderAvatarUrl
    ? `<img src="${escapeHtml(g.leaderAvatarUrl)}" class="groups-card-avatar" alt="" referrerpolicy="no-referrer" loading="lazy">`
    : `<span class="groups-card-avatar-empty">${escapeHtml(g.name.slice(0, 1))}</span>`;

  return `<button type="button" class="groups-card${activeCls}${bearCls}" data-group-code="${escapeHtml(g.code)}" title="${escapeHtml(g.name)} (团长: ${escapeHtml(g.leaderName)})">
    <div class="groups-card-avatar-wrap">
      ${avatarHtml}
      ${g.isBearPaw ? '<span class="groups-card-bear-paw" title="熊掌公会">🐾</span>' : ""}
    </div>
    <div class="groups-card-content">
      <div class="groups-card-title-row">
        <span class="groups-card-name">${escapeHtml(g.name)}</span>
        ${seasonText ? `<span class="groups-card-season">${seasonText}</span>` : ""}
      </div>
      <div class="groups-card-sub-row">
        <span class="groups-card-status ${statusCls}">${statusText}</span>
        <span class="groups-card-kind">${kindText}</span>
      </div>
    </div>
  </button>`;
}

export function groupsSelectLiveButtonMarkup() {
  return `<button type="button" data-groups-select-live class="btn groups-live-btn" style="display:none">全选在播</button>`;
}
