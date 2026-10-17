// [插件独立样式] 团播模块方案 A：电竞暗色横向滑轨卡片与细腻玻璃拟态质感

export const groupsCss = `
/* 团播筛选区整体容器（方案 A：暗黑毛玻璃紧凑滑轨） */
.groups-filter-box {
  padding: 8px 14px 10px;
  background: rgba(24, 24, 27, 0.92);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 8px;
  backdrop-filter: blur(12px);
  flex-shrink: 0;
  box-sizing: border-box;
}

/* 顶部分类栏与当前选中信息 */
.groups-cat-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-shrink: 0;
}

.groups-cat-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.groups-cat-pill {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #c9c9d1;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
  outline: none;
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
  color: #a1a1aa;
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
  flex-shrink: 0;
}

.groups-track-scroller {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  gap: 8px !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  padding: 2px 2px 6px 2px;
  scroll-behavior: smooth;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
  box-sizing: border-box !important;
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
  background: linear-gradient(to right, transparent, rgba(24, 24, 27, 0.96));
  pointer-events: none;
}

/* 团播暗色卡片：强制尺寸与横向单行布局 */
.groups-card {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 8px !important;
  min-width: 142px !important;
  max-width: 165px !important;
  width: auto !important;
  height: 48px !important;
  padding: 6px 10px !important;
  border-radius: 8px !important;
  background: rgba(255, 255, 255, 0.04) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  color: #e8e8ec !important;
  cursor: pointer !important;
  flex-shrink: 0 !important;
  text-align: left !important;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  user-select: none;
  box-sizing: border-box !important;
  outline: none !important;
}

.groups-card:hover {
  background: rgba(255, 255, 255, 0.08) !important;
  border-color: rgba(255, 255, 255, 0.2) !important;
  transform: translateY(-1px);
}

.groups-card.is-active {
  background: rgba(255, 93, 35, 0.12) !important;
  border-color: #ff5d23 !important;
  box-shadow: 0 0 12px rgba(255, 93, 35, 0.3), inset 0 0 0 1px rgba(255, 93, 35, 0.2) !important;
}

.groups-card.is-active .groups-card-name {
  color: #ff7a45 !important;
  font-weight: 600 !important;
}

/* 卡片内部元素：严格锁定头像尺寸为 28x28 圆形，防止外部样式拉伸 */
.groups-card-avatar-wrap {
  position: relative !important;
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  max-width: 28px !important;
  flex-shrink: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.groups-card-avatar {
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  max-width: 28px !important;
  min-height: 28px !important;
  max-height: 28px !important;
  border-radius: 50% !important;
  object-fit: cover !important;
  background: rgba(255, 255, 255, 0.1) !important;
  display: block !important;
  border: 0 !important;
}

.groups-card-avatar-empty {
  width: 28px !important;
  height: 28px !important;
  border-radius: 50% !important;
  background: #3a3a40 !important;
  color: #a1a1aa !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-size: 12px !important;
  font-weight: bold !important;
  flex-shrink: 0 !important;
}

.groups-card-bear-paw {
  position: absolute !important;
  right: -3px !important;
  bottom: -3px !important;
  font-size: 10px !important;
  line-height: 1 !important;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.8));
  user-select: none;
}

.groups-card-content {
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  gap: 2px !important;
  overflow: hidden !important;
  flex: 1 !important;
  min-width: 0 !important;
}

.groups-card-title-row {
  display: flex !important;
  align-items: center !important;
  gap: 4px !important;
  overflow: hidden !important;
}

.groups-card-name {
  font-size: 12px !important;
  font-weight: 500 !important;
  color: #f4f4f5 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.groups-card-season {
  font-size: 10px !important;
  color: #a1a1aa !important;
  flex-shrink: 0 !important;
}

.groups-card-sub-row {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 4px !important;
  font-size: 10px !important;
}

.groups-card-status {
  white-space: nowrap !important;
}

.groups-card-status.is-live {
  color: #4ade80 !important;
}

.groups-card-status.is-ended {
  color: #7c7c86 !important;
}

.groups-card-kind {
  color: #a1a1aa !important;
  font-size: 9px !important;
  padding: 0 3px !important;
  border-radius: 3px !important;
  background: rgba(255, 255, 255, 0.06) !important;
  white-space: nowrap !important;
}

.groups-loading {
  font-size: 12px !important;
  color: #a1a1aa !important;
  padding: 12px 6px !important;
}

/* 底部全选在播按钮（绿色高亮提示） */
.groups-live-btn {
  border-color: rgba(34, 197, 94, 0.4) !important;
  color: #4ade80 !important;
  background: rgba(34, 197, 94, 0.08) !important;
  transition: all 0.2s ease !important;
}

.groups-live-btn:hover {
  background: rgba(34, 197, 94, 0.18) !important;
  border-color: #22c55e !important;
  color: #86efac !important;
  box-shadow: 0 0 10px rgba(34, 197, 94, 0.25) !important;
}
`;
