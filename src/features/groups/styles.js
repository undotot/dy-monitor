// [插件独立样式] 团播模块方案 A：电竞暗色横向滑轨卡片与细腻玻璃拟态质感

export const groupsCss = `
/* 团播筛选区整体容器 */
.groups-filter-box {
  padding: 10px 14px 12px;
  background: rgba(18, 22, 34, 0.75);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 10px;
  backdrop-filter: blur(12px);
}

/* 顶部分类栏与当前选中信息 */
.groups-cat-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.groups-cat-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.groups-cat-pill {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.groups-cat-pill:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.groups-cat-pill.is-active {
  background: linear-gradient(135deg, #ff5d23 0%, #ea580c 100%);
  border-color: #ff5d23;
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(234, 88, 12, 0.35);
}

.groups-cat-count {
  font-size: 10px;
  opacity: 0.8;
  font-weight: normal;
}

.groups-current-badge {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
  text-align: right;
}

/* 横向滚动轨道与遮罩 */
.groups-track-wrapper {
  position: relative;
  width: 100%;
}

.groups-track-scroller {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 2px 2px 6px 2px;
  scroll-behavior: smooth;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
}

.groups-track-scroller::-webkit-scrollbar {
  height: 4px;
}

.groups-track-scroller::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 999px;
}

.groups-track-scroller::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

.groups-track-fade {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 6px;
  width: 24px;
  background: linear-gradient(to right, transparent, rgba(18, 22, 34, 0.9));
  pointer-events: none;
}

/* 团播暗色卡片 */
.groups-card {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 136px;
  max-width: 160px;
  height: 48px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
  cursor: pointer;
  flex-shrink: 0;
  text-align: left;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  user-select: none;
}

.groups-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}

.groups-card.is-active {
  background: rgba(255, 93, 35, 0.12);
  border-color: #ff5d23;
  box-shadow: 0 0 12px rgba(255, 93, 35, 0.3), inset 0 0 0 1px rgba(255, 93, 35, 0.2);
}

.groups-card.is-active .groups-card-name {
  color: #ff7a45;
  font-weight: 600;
}

/* 卡片内部元素 */
.groups-card-avatar-wrap {
  position: relative;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

.groups-card-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.1);
  display: block;
}

.groups-card-avatar-empty {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #334155;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
}

.groups-card-bear-paw {
  position: absolute;
  right: -3px;
  bottom: -3px;
  font-size: 10px;
  line-height: 1;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.8));
}

.groups-card-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  overflow: hidden;
  flex: 1;
}

.groups-card-title-row {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
}

.groups-card-name {
  font-size: 12px;
  font-weight: 500;
  color: #f1f5f9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.groups-card-season {
  font-size: 10px;
  color: #94a3b8;
  flex-shrink: 0;
}

.groups-card-sub-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  font-size: 10px;
}

.groups-card-status {
  white-space: nowrap;
}

.groups-card-status.is-live {
  color: #4ade80;
}

.groups-card-status.is-ended {
  color: #64748b;
}

.groups-card-kind {
  color: #94a3b8;
  font-size: 9px;
  padding: 0 3px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.06);
}

.groups-loading {
  font-size: 12px;
  color: #94a3b8;
  padding: 12px 6px;
}

/* 底部全选在播按钮（绿色高亮提示） */
.groups-live-btn {
  border-color: rgba(34, 197, 94, 0.4) !important;
  color: #4ade80 !important;
  background: rgba(34, 197, 94, 0.08) !important;
  transition: all 0.2s ease;
}

.groups-live-btn:hover {
  background: rgba(34, 197, 94, 0.18) !important;
  border-color: #22c55e !important;
  color: #86efac !important;
  box-shadow: 0 0 10px rgba(34, 197, 94, 0.25);
}
`;
