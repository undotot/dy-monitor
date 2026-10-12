// [插件独立样式] 团播模块专属样式，全部限定在 groups-* 命名空间下

export const groupsCss = `
.groups-filter-box {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.groups-cat-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.groups-cat-label {
  color: var(--muted, #94a3b8);
  font-weight: 500;
  flex-shrink: 0;
}

.groups-cat-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.groups-cat-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--fg, #e2e8f0);
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.groups-cat-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.25);
}

.groups-cat-btn.is-active {
  background: var(--primary, #ff5d23);
  border-color: var(--primary, #ff5d23);
  color: #fff;
  font-weight: bold;
}

.groups-capsule-row {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: thin;
}

.groups-capsule-row::-webkit-scrollbar {
  height: 4px;
}
.groups-capsule-row::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.groups-capsule-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--fg, #e2e8f0);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.groups-capsule-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.25);
}

.groups-capsule-btn.is-active {
  background: rgba(255, 93, 35, 0.15);
  border-color: var(--primary, #ff5d23);
  color: var(--primary, #ff5d23);
  font-weight: 600;
  box-shadow: 0 0 8px rgba(255, 93, 35, 0.2);
}

.groups-capsule-badge {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--muted, #94a3b8);
}

.groups-capsule-btn.is-bear .groups-capsule-badge {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}

.groups-loading {
  font-size: 12px;
  color: var(--muted, #94a3b8);
  padding: 6px 0;
}
`;
