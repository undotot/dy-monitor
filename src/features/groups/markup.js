// [插件独立模块] 团播 UI 模板：生成团播胶囊条、分类切换与在播全选按钮。

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
    <div class="groups-cat-row">
      <span class="groups-cat-label">分类:</span>
      <div class="groups-cat-list" data-groups-cats>
        <button type="button" class="groups-cat-btn is-active" data-group-cat="all">全部</button>
        <button type="button" class="groups-cat-btn" data-group-cat="bear">熊掌团播</button>
        <button type="button" class="groups-cat-btn" data-group-cat="other">其他团播</button>
      </div>
    </div>
    <div class="groups-capsule-row" data-groups-capsules>
      <div class="groups-loading">正在拉取团播数据...</div>
    </div>
  </div>`;
}

export function groupCapsuleMarkup(g, isActive) {
  const activeCls = isActive ? " is-active" : "";
  const bearCls = g.isBearPaw ? " is-bear" : "";
  const statusCls = g.isActive ? " is-live-season" : "";
  const badgeText = g.isBearPaw ? "熊掌" : g.kind;
  return `<button type="button" class="groups-capsule-btn${activeCls}${bearCls}${statusCls}" data-group-code="${escapeHtml(g.code)}" title="${escapeHtml(g.name)} (${escapeHtml(g.leaderName)})">
    <span class="groups-capsule-name">${escapeHtml(g.name)}</span>
    <span class="groups-capsule-badge">${badgeText}</span>
  </button>`;
}

export function groupsSelectLiveButtonMarkup() {
  return `<button type="button" data-groups-select-live class="btn" style="display:none">全选在播</button>`;
}
