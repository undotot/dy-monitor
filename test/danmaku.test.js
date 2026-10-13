import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDanmaku, truncateSender, DanmakuRenderer } from "../src/core/danmaku-render.js";
import { PacketReader, encodePacket, parseFields } from "../src/core/danmaku-protocol.js";
import { DanmakuClient } from "../src/api/danmaku-client.js";
import {
  getFanMedalClass,
  NOBLE_MAP,
  getNobleTag,
  getUserLevelClass,
  getDanmakuColorClass,
  renderSimpleBarrageHtml,
  renderDanmakuTokensHtml
} from "../src/core/danmaku-tokens.js";

test("normalizeDanmaku 默认值", () => {
  const d = normalizeDanmaku({});
  assert.equal(d.enabled, false);
  assert.equal(d.mode, "scroll");
  assert.equal(d.scrollStyle, "simple");
  assert.equal(d.aggregate, true);
  assert.equal(d.showSender, true, "默认开启显示发送者");
  assert.equal(d.size, 20);
  assert.equal(d.speed, 1);
  assert.equal(d.area, 1);
});

test("normalizeDanmaku mode 与 scrollStyle 取值校验", () => {
  assert.equal(normalizeDanmaku({ mode: "sidebar" }).mode, "sidebar");
  assert.equal(normalizeDanmaku({ mode: "invalid" }).mode, "scroll");
  assert.equal(normalizeDanmaku({ scrollStyle: "normal" }).scrollStyle, "normal");
  assert.equal(normalizeDanmaku({ scrollStyle: "invalid" }).scrollStyle, "simple");
  assert.equal(normalizeDanmaku({ aggregate: false }).aggregate, false);
  assert.equal(normalizeDanmaku({ aggregate: true }).aggregate, true);
});

test("truncateSender 昵称智能截断", () => {
  assert.equal(truncateSender(""), "");
  assert.equal(truncateSender(null), "");
  assert.equal(truncateSender("普通昵称"), "普通昵称");
  assert.equal(truncateSender("八位刚好昵称字"), "八位刚好昵称字");
  assert.equal(truncateSender("这是一个超过八位长度的超长昵称"), "这是一个超过八位…");
  assert.equal(truncateSender("  带空白的昵称  "), "带空白的昵称");
});

test("normalizeDanmaku 越界夹取与屏蔽词清洗", () => {
  const d = normalizeDanmaku({ size: 100, speed: 9, opacity: 5, area: 3, blockedWords: [" a ", "", 7] });
  assert.equal(d.size, 36);
  assert.equal(d.speed, 1);
  assert.equal(d.opacity, 1);
  assert.equal(d.area, 1);
  assert.deepEqual(d.blockedWords, ["a"]);
});

test("parseFields 还原 @S 转义", () => {
  const fields = parseFields("type@=chatmsg/txt@=hello@Sworld/");
  assert.equal(fields.txt, "hello/world");
  assert.equal(fields.type, "chatmsg");
});

test("PacketReader 解析弹幕包", () => {
  const text = "type@=chatmsg/rid@=123/txt@=hello@Sworld/";
  const bytes = new TextEncoder().encode(text);
  const buffer = new ArrayBuffer(bytes.length + 13);
  const view = new DataView(buffer);
  view.setUint32(0, bytes.length + 9, true);
  view.setUint32(4, bytes.length + 9, true);
  view.setUint16(8, 689, true);
  new Uint8Array(buffer).set(bytes, 12);
  const messages = new PacketReader().push(buffer);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].txt, "hello/world");
  assert.equal(messages[0].rid, "123");
});

test("PacketReader 支持分包与多包连续解析且复用缓冲", () => {
  const makePacket = (txt) => {
    const text = `type@=chatmsg/txt@=${txt}/`;
    const bytes = new TextEncoder().encode(text);
    const buffer = new ArrayBuffer(bytes.length + 13);
    const view = new DataView(buffer);
    view.setUint32(0, bytes.length + 9, true);
    view.setUint32(4, bytes.length + 9, true);
    view.setUint16(8, 689, true);
    new Uint8Array(buffer).set(bytes, 12);
    return new Uint8Array(buffer);
  };
  const p1 = makePacket("first");
  const p2 = makePacket("second");
  const combined = new Uint8Array(p1.length + p2.length);
  combined.set(p1);
  combined.set(p2, p1.length);

  const reader = new PacketReader(128); // 测试小容量扩容
  // 模拟第一批：发送 p1 前半段
  const splitIndex = Math.floor(p1.length / 2);
  const chunk1 = combined.slice(0, splitIndex);
  const res1 = reader.push(chunk1.buffer);
  assert.equal(res1.length, 0);

  // 发送后半段以及整块 p2
  const chunk2 = combined.slice(splitIndex);
  const res2 = reader.push(chunk2.buffer);
  assert.equal(res2.length, 2);
  assert.equal(res2[0].txt, "first");
  assert.equal(res2[1].txt, "second");
});

test("encodePacket 生成合法 689 包头", () => {
  const buffer = encodePacket("type@=mrkl/");
  const view = new DataView(buffer);
  assert.equal(view.getUint16(8, true), 689);
  assert.equal(view.getUint32(0, true), buffer.byteLength - 4);
});

test("DanmakuRenderer 支持解析并渲染发送者昵称", () => {
  const mockCanvas = {
    clientWidth: 800,
    clientHeight: 600,
    width: 0,
    height: 0,
    getContext: () => ({
      measureText: (text) => ({ width: text.length * 10 }),
      clearRect: () => {},
      strokeText: () => {},
      fillText: () => {}
    })
  };
  const renderer = new DanmakuRenderer(mockCanvas, normalizeDanmaku({ enabled: true, showSender: true }));
  renderer.start();
  renderer.add({ nn: "用户张三", txt: "这是一条测试弹幕" });

  assert.equal(renderer.items.length, 1);
  assert.equal(renderer.items[0].sender, "用户张三: ");
  assert.equal(renderer.items[0].text, "这是一条测试弹幕");
  assert.ok(renderer.items[0].senderWidth > 0);
  assert.equal(renderer.items[0].width, renderer.items[0].senderWidth + renderer.items[0].textWidth);
  renderer.stop();

  // 关闭 showSender 时不渲染昵称
  const rendererNoSender = new DanmakuRenderer(mockCanvas, normalizeDanmaku({ enabled: true, showSender: false }));
  rendererNoSender.start();
  rendererNoSender.add({ nn: "用户张三", txt: "这是一条测试弹幕" });
  assert.equal(rendererNoSender.items.length, 1);
  assert.equal(rendererNoSender.items[0].sender, "");
  assert.equal(rendererNoSender.items[0].senderWidth, 0);
  rendererNoSender.stop();
});

/* ===== 核心令牌解析与彻底排除至尊等级测试 ===== */
test("粉丝徽章等级体系映射覆盖 1~60+ 阶梯", () => {
  assert.equal(getFanMedalClass(0), null);
  assert.equal(getFanMedalClass(1), "dy-medal-green");
  assert.equal(getFanMedalClass(5), "dy-medal-green");
  assert.equal(getFanMedalClass(6), "dy-medal-blue");
  assert.equal(getFanMedalClass(10), "dy-medal-blue");
  assert.equal(getFanMedalClass(11), "dy-medal-purple");
  assert.equal(getFanMedalClass(15), "dy-medal-purple");
  assert.equal(getFanMedalClass(16), "dy-medal-orange");
  assert.equal(getFanMedalClass(20), "dy-medal-orange");
  assert.equal(getFanMedalClass(21), "dy-medal-diamond");
  assert.equal(getFanMedalClass(30), "dy-medal-diamond");
  assert.equal(getFanMedalClass(31), "dy-medal-gold");
  assert.equal(getFanMedalClass(40), "dy-medal-gold");
  assert.equal(getFanMedalClass(41), "dy-medal-purple-gold");
  assert.equal(getFanMedalClass(49), "dy-medal-purple-gold");
  assert.equal(getFanMedalClass(50), "dy-medal-50");
  assert.equal(getFanMedalClass(51), "dy-medal-51");
  assert.equal(getFanMedalClass(55), "dy-medal-51");
  assert.equal(getFanMedalClass(56), "dy-medal-56");
  assert.equal(getFanMedalClass(60), "dy-medal-56");
  assert.equal(getFanMedalClass(99), "dy-medal-56");
});

test("贵族特权 9 大代码映射且彻底排除至尊等级", () => {
  const nobleCodes = [7, 1, 2, 3, 4, 5, 6, 8, 9];
  assert.equal(Object.keys(NOBLE_MAP).length, 9);
  for (const code of nobleCodes) {
    const noble = getNobleTag(code);
    assert.ok(noble, `贵族代码 ${code} 应存在`);
    assert.ok(!noble.name.includes("至尊"), "贵族映射中绝不含至尊等级");
  }
  assert.equal(getNobleTag(9).name, "✨ 幻神");
  assert.equal(getNobleTag(8).name, "🔥 超皇");
  assert.equal(getNobleTag(6).name, "👑 皇帝");
  assert.equal(getNobleTag(5).name, "🛡️ 国王");
  assert.equal(getNobleTag(4).name, "公爵");
  assert.equal(getNobleTag(3).name, "伯爵");
  assert.equal(getNobleTag(2).name, "子爵");
  assert.equal(getNobleTag(1).name, "骑士");
  assert.equal(getNobleTag(7).name, "游侠");
  assert.equal(getNobleTag(0), null);
});

test("精简版飘屏严格仅保留昵称与内容", () => {
  const msg = {
    nn: "测试玩家",
    txt: "主播打得太棒了666",
    col: 2,
    bnn: "英雄联盟",
    bl: 35,
    diaf: 1,
    nl: 9,
    level: 100,
    ct: 2
  };
  const html = renderSimpleBarrageHtml(msg, 1);
  // 必须包含昵称与弹幕内容
  assert.ok(html.includes("测试玩家"));
  assert.ok(html.includes("主播打得太棒了666"));
  assert.ok(html.includes("dm-col-2")); // col: 2 蓝色
  // 严格去除所有徽章、钻粉、至尊、设备图标等前缀底板
  assert.ok(!html.includes("dy-medal"));
  assert.ok(!html.includes("英雄联盟"));
  assert.ok(!html.includes("💎"));
  assert.ok(!html.includes("幻神"));
  assert.ok(!html.includes("Lv."));
  assert.ok(!html.includes("至尊"));
  assert.ok(!html.includes("svg"));

  // 聚合计数渲染
  const aggregatedHtml = renderSimpleBarrageHtml(msg, 5);
  assert.ok(aggregatedHtml.includes('class="dm-badge-aggregate">x 5</span>'));
});

test("全功能令牌流拓扑顺序符合规范", () => {
  const msg = {
    nn: "高玩老哥",
    txt: "下饭操作",
    col: 0,
    bnn: "大马猴",
    bl: 52,
    diaf: 1,
    diam: 12,
    nl: 6, // 皇帝
    level: 110,
    ct: 2 // iOS
  };
  const html = renderDanmakuTokensHtml(msg, { showSender: true, showClientIcon: true });
  // 1. 粉丝牌置首
  const medalIdx = html.indexOf("dy-medal-51");
  assert.ok(medalIdx !== -1, "包含 52 级粉丝牌样式");
  assert.ok(html.includes("大马猴"), "包含粉丝牌名称");
  assert.ok(html.includes("52"), "包含粉丝牌等级");

  // 2. 钻粉挂件紧跟其后并显示月份
  const diamondIdx = html.indexOf("dy-diamond-medal");
  assert.ok(diamondIdx > medalIdx, "钻粉挂件排在粉丝牌之后");
  assert.ok(html.includes("12月"), "显示钻粉连续月份");

  // 3. 贵族微标
  const nobleIdx = html.indexOf("dy-tag-noble-emperor");
  assert.ok(nobleIdx > diamondIdx, "贵族微标排在钻粉之后");
  assert.ok(html.includes("👑 皇帝"));

  // 4. 账号等级
  const levelIdx = html.indexOf("dy-ul-91");
  assert.ok(levelIdx > nobleIdx, "账号等级排在贵族之后");
  assert.ok(html.includes("Lv.110"));

  // 5. 昵称与内容
  const nameIdx = html.indexOf("高玩老哥");
  assert.ok(nameIdx > levelIdx, "昵称排在账号等级之后");
  assert.ok(html.includes("下饭操作"));

  // 6. 终端来源图标在最后
  const clientIdx = html.indexOf("ct-tail-icon");
  assert.ok(clientIdx > nameIdx, "终端图标排在最末");

  // 验证不含至尊等级
  assert.ok(!html.includes("至尊"));
});

test("DanmakuRenderer 模式切换与聚合器测试", () => {
  const dummySidebar = {
    hidden: false,
    classList: { toggle: () => {} }
  };
  const dummyList = {
    children: [],
    appendChild: function(node) { this.children.push(node); },
    removeChild: function(node) {
      const idx = this.children.indexOf(node);
      if (idx !== -1) this.children.splice(idx, 1);
    },
    scrollTop: 0,
    scrollHeight: 100
  };
  const mockCanvas = {
    clientWidth: 800,
    clientHeight: 600,
    width: 0,
    height: 0,
    style: {},
    getContext: () => ({
      measureText: (text) => ({ width: text.length * 10 }),
      clearRect: () => {},
      strokeText: () => {},
      fillText: () => {}
    })
  };

  const renderer = new DanmakuRenderer(mockCanvas, normalizeDanmaku({ enabled: true, mode: "scroll", aggregate: true }), {
    sidebarEl: dummySidebar,
    sidebarListEl: dummyList
  });

  // 测试画布在 scroll 模式下显示
  assert.equal(mockCanvas.style.display, "");
  assert.equal(dummySidebar.hidden, true);

  // 切换到 sidebar 模式
  renderer.update({ mode: "sidebar" });
  assert.equal(mockCanvas.style.display, "none");
  assert.equal(dummySidebar.hidden, false);

  // 切回 scroll 模式测试同质化聚合检测 (2.5 秒内)
  renderer.update({ mode: "scroll" });
  assert.equal(mockCanvas.style.display, "");
  assert.equal(dummySidebar.hidden, true);

  renderer.start();
  renderer.add({ nn: "水友A", txt: "666" });
  renderer.add({ nn: "水友B", txt: "666" });
  assert.equal(renderer.items.length, 1);
  assert.equal(renderer.items[0].count, 2);
  assert.equal(renderer.items[0].aggregateText, " x 2");
  renderer.stop();
});

test("DanmakuClient 消息派发不受 rid 类型 (数字 vs 字符串) 或靓号别名阻断", () => {
  const received = [];
  class MockSocket {
    constructor(url) {
      this.url = url;
      this.binaryType = "blob";
      setTimeout(() => {
        this.onopen?.();
        // 模拟推送 loginres
        this.onmessage?.({ data: encodePacket("type@=loginres/userid@=0/") });
        // 模拟推送 chatmsg (附带字符串 rid "9999")
        this.onmessage?.({ data: encodePacket("type@=chatmsg/rid@=9999/nn@=测试老哥/txt@=弹幕正常显示/col@=1/") });
      }, 5);
    }
    send() {}
    close() {}
  }

  // 构造时传入数字类型 rid: 9999
  const client = new DanmakuClient(9999, (msg) => {
    received.push(msg);
  }, () => {}, MockSocket);

  client.start();
  return new Promise((resolve) => {
    setTimeout(() => {
      client.stop();
      assert.equal(received.length, 1, "应成功收到并派发 1 条弹幕");
      assert.equal(received[0].nn, "测试老哥");
      assert.equal(received[0].txt, "弹幕正常显示");
      resolve();
    }, 20);
  });
});
