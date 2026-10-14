export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
})[char]);

export const getFanMedalClass = (bl) => {
  const level = Number(bl) || 0;
  if (level >= 56) return "dy-medal-56";
  if (level >= 51) return "dy-medal-51";
  if (level === 50) return "dy-medal-50";
  if (level >= 41) return "dy-medal-purple-gold";
  if (level >= 31) return "dy-medal-gold";
  if (level >= 21) return "dy-medal-diamond";
  if (level >= 16) return "dy-medal-orange";
  if (level >= 11) return "dy-medal-purple";
  if (level >= 6) return "dy-medal-blue";
  if (level >= 1) return "dy-medal-green";
  return null;
};

export const NOBLE_MAP = {
  9: { name: "✨ 幻神", className: "dy-tag-noble-god", rank: 9, userClass: "sidebar-user-god" },
  8: { name: "🔥 超皇", className: "dy-tag-noble-super-emperor", rank: 8, userClass: "sidebar-user-emperor" },
  6: { name: "👑 皇帝", className: "dy-tag-noble-emperor", rank: 7, userClass: "sidebar-user-emperor" },
  5: { name: "🛡️ 国王", className: "dy-tag-noble-king", rank: 6, userClass: "sidebar-user-diamond" },
  4: { name: "公爵", className: "dy-tag-noble-duke", rank: 5, userClass: "" },
  3: { name: "伯爵", className: "dy-tag-noble-count", rank: 4, userClass: "" },
  2: { name: "子爵", className: "dy-tag-noble-viscount", rank: 3, userClass: "" },
  1: { name: "骑士", className: "dy-tag-noble-knight", rank: 2, userClass: "" },
  7: { name: "游侠", className: "dy-tag-noble-ranger", rank: 1, userClass: "" }
};

export const getNobleTag = (nl) => {
  const code = Number(nl);
  return NOBLE_MAP[code] || null;
};

export const getUserLevelClass = (level) => {
  const lv = Number(level) || 0;
  if (lv >= 121) return "dy-ul-121";
  if (lv >= 91) return "dy-ul-91";
  if (lv >= 61) return "dy-ul-61";
  if (lv >= 31) return "dy-ul-31";
  if (lv >= 16) return "dy-ul-16";
  if (lv >= 1) return "dy-ul-1";
  return null;
};

export const getClientDevice = (ct) => {
  const code = Number(ct);
  if (code === 2) {
    return {
      name: "iOS",
      className: "ct-tail-ios",
      svg: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="5" y="2" width="14" height="20" rx="3"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>'
    };
  }
  if (code === 1) {
    return {
      name: "Android",
      className: "ct-tail-android",
      svg: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>'
    };
  }
  return {
    name: "Web",
    className: "ct-tail-web",
    svg: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/></svg>'
  };
};

export const getDanmakuColorClass = (col) => {
  const code = Number(col);
  if (code >= 0 && code <= 6) return `dm-col-${code}`;
  return "dm-col-0";
};

export const parseDiamondMonths = (msg) => {
  const diaf = Number(msg.diaf) || 0;
  const dmo = Number(msg.dmo || msg.diamond_month || msg.dm || msg.diam || 0);
  if (dmo > 0) return dmo;
  if (diaf > 1) return diaf;
  return diaf > 0 ? 1 : 0;
};

export const renderDanmakuTokens = (msg, showSender = true, sidebar = false) => {
  const parts = [];

  // 1. 粉丝徽章体系 (置首)
  const bnn = String(msg.bnn || "").trim();
  const bl = Number(msg.bl) || 0;
  if (bnn && bl > 0) {
    const medalClass = getFanMedalClass(bl) || "dy-medal-green";
    parts.push(
      `<span class="dy-medal ${medalClass}" title="${escapeHtml(bnn)} ${bl}级粉丝牌"><span class="dy-medal-name">${escapeHtml(bnn)}</span><span class="dy-medal-level">${bl}</span></span>`
    );
  }

  // 2. 钻粉挂件 + 续费月份 (紧随粉丝牌 box 之后)
  const diamondMonths = parseDiamondMonths(msg);
  if (diamondMonths > 0) {
    parts.push(
      `<span class="dy-diamond-medal" title="连续钻石粉丝 ${diamondMonths} 个月"><span class="dy-diamond-icon">💎</span><span class="dy-diamond-months">${diamondMonths}月</span></span>`
    );
  }

  // 3. 贵族特权微标 (nl 1~9, 彻底去除至尊)
  const noble = getNobleTag(msg.nl);
  if (noble) {
    parts.push(
      `<span class="dy-tag ${noble.className}">${noble.name}</span>`
    );
  }

  // 4. 账号等级 (Lv.1~120+)
  const level = Number(msg.level) || 0;
  if (level > 0) {
    const ulClass = getUserLevelClass(level) || "dy-ul-1";
    parts.push(
      `<span class="dy-user-level ${ulClass}">Lv.${level}</span>`
    );
  }

  // 5. 身份昵称与弹幕内容
  const nn = String(msg.nn || "水友").trim();
  const txt = String(msg.txt || "").trim();
  let userClass = "sidebar-user";
  if (noble?.userClass) {
    userClass += ` ${noble.userClass}`;
  } else if (Number(msg.rg) === 4) {
    userClass += " sidebar-user-admin";
  } else if (Number(msg.pg) === 5) {
    userClass += " sidebar-user-anchor";
  }
  const colClass = getDanmakuColorClass(msg.col);

  if (showSender) parts.push(`<span class="${userClass}">${escapeHtml(nn)}:</span>`);
  if (sidebar) parts.push('</div><div class="sidebar-message-body">');
  parts.push(`<span class="${colClass}">${escapeHtml(txt)}</span>`);

  // 6. 客户端来源标识 (末尾)
  const client = getClientDevice(msg.ct);
  parts.push(
    `<span class="ct-tail-icon ${client.className}" title="${client.name}">${client.svg}</span>`
  );

  return sidebar ? `<div class="sidebar-identity">${parts.join(" ")}</div>` : parts.join(" ");
};

export const renderDanmakuTokensHtml = renderDanmakuTokens;

export const renderSimpleBarrageHtml = (msg, count = 1, showSender = true) => {
  const nn = String(msg.nn || "水友").trim();
  const txt = String(msg.txt || "").trim();
  const colClass = getDanmakuColorClass(msg.col);
  const noble = getNobleTag(msg.nl);
  let senderColor = "#93c5fd";
  if (noble?.rank >= 8) senderColor = "#ec4899";
  else if (noble?.rank >= 6) senderColor = "#fbbf24";
  else if (noble?.rank >= 5) senderColor = "#f97316";

  const aggHtml = count > 1 ? `<span class="dm-badge-aggregate">x ${count}</span>` : "";
  const senderHtml = showSender ? `<span class="dm-sender" style="color:${senderColor};font-weight:700;">${escapeHtml(nn)}:</span> ` : "";
  return `${senderHtml}<span class="${colClass}">${escapeHtml(txt)}</span>${aggHtml}`;
};

export const renderNormalCapsuleHtml = (msg, count = 1, showSender = true) => {
  const noble = getNobleTag(msg.nl);
  const bl = Number(msg.bl) || 0;
  const diamondMonths = parseDiamondMonths(msg);
  const tokensHtml = renderDanmakuTokens(msg, showSender);
  const aggHtml = count > 1 ? `<span class="dm-badge-aggregate">x ${count}</span>` : "";

  // 1:1 官方特效胶囊封装
  if (noble?.rank >= 9 || bl >= 56 || diamondMonths >= 12) {
    return `<div class="official-diamond-capsule"><div class="official-diamond-avatar-ring">👑</div>${tokensHtml}${aggHtml}</div>`;
  }
  if (noble?.rank >= 7 || bl >= 50) {
    return `<div class="official-emperor-capsule"><span class="official-capsule-badge">🔥</span>${tokensHtml}${aggHtml}</div>`;
  }
  return `<div class="official-capsule">${tokensHtml}${aggHtml}</div>`;
};

export const renderSidebarRowHtml = (msg, showSender = true) => {
  return `<div class="sidebar-item-row">${renderDanmakuTokens(msg, showSender, true)}</div>`;
};
