// 只生成新的独立设计预览，不运行正式应用 build。
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const directory = path.dirname(fileURLToPath(import.meta.url));
await build({ entryPoints: [path.join(directory, "focus-replan.preview.js")], outfile: path.join(directory, "focus-replan.bundle.js"), bundle: true, format: "iife", target: "es2022", minify: true, legalComments: "none" });
const template = await readFile(path.join(directory, "focus-replan.template.html"), "utf8");
const originalTemplate = template.replace("设计预览 · 选择后再接入", "历史设计 · 当前要求为统一短边")
  .replace("正式接入需等你在聊天中选择 P、Q 或 R。", "用户已确认统一短边与完整原画；当前有效设计见 focus-short-side.html。本页保留作历史参考。");
await writeFile(path.join(directory, "focus-replan.html"), originalTemplate);
for (const mode of ["P", "Q", "R"]) await writeFile(path.join(directory, `focus-replan-${mode}.html`), originalTemplate.replace('data-start-mode="P"', `data-start-mode="${mode}"`));
// 复用相同控件与画面绘制，确保新旧设计的对照口径一致。
const uniformTemplate = template
  .replace('data-start-mode="P"', 'data-layout-algorithm="uniform" data-start-mode="U"')
  .replace("监控室 · 放大算法重新设计", "监控室 · 同尺寸小窗设计")
  .replace("监控室 / 算法重新设计", "监控室 / 同尺寸小窗")
  .replace("设计预览 · 选择后再接入", "历史预览 · 当前要求为统一短边")
  .replace("先看主画面有多大，再选布局。", "除主画面外，小窗全部同宽同高。")
  .replace("主窗左上，小窗在右侧或底部。此次提供三种明确取舍：完整拼合、主画面优先、等比裁切铺满。所有画面不拉伸，每种方案都与当前算法直接对照。", "统一小窗尺寸，再安排右侧与底部。主画面完整显示，允许黑边；小视频等比裁切、无拉伸、无黑边。新版三个方案均与当前源码对照，选择后才接入正式代码。")
  .replace(/<div class="mt-3 grid gap-3 leading-6 lg:grid-cols-2">[\s\S]*?<\/div>\s*<\/details>/, `<div class="mt-3 grid gap-3 leading-6 lg:grid-cols-2">
        <p>U：所有小窗同宽同高，单侧条带与完整 L 形网格参选。主视频实际面积保留单窗最大画面的至少 52%；观看尺寸达到候选最高值的 85% 后，优先实际可见视频占用。</p>
        <p>V：小窗统一 16:9，主视频至少保留单窗最大画面面积的 60%。二分求统一小窗尺寸；不放大尾行。5–16 格使用右侧和底部双区，允许窗外黑底。</p>
        <p>W：使用 U 的同尺寸铺满候选，优先最差小窗的原画保留率，再比较平均值。U/W 在满足观看尺寸和主视频面积的候选中优先双区；没有合适双区时使用单侧。</p>
        <p>同宽同高是硬约束。视频源的横竖比例不同时，完整画面、同尺寸、无黑边无法兼得；本页使用 cover 等比裁切，红色标记显示裁切量。三种方案都保留主视频完整画面。</p>
        <p>窗口覆盖包含主窗黑底；实际视频占用只计可见视频。原画保留率按小窗实际可见面积统计，最低值另列。当前算法的间隔至少为 1px；自定义差异会在对照条件中标出。</p>
        <p>此页的同宽同高假设已被用户澄清取代，不作为当前接入候选。当前设计统一短边、保留完整原画，见 focus-short-side.html。历史伪代码与数据流见 docs/focus-uniform.md。</p>
      </div></details>`)
  .replace("FOCUS REPLAN / P · Q · R", "EQUAL WINDOWS / U · V · W");
await writeFile(path.join(directory, "focus-uniform.html"), uniformTemplate);
for (const mode of ["U", "V", "W"]) await writeFile(path.join(directory, `focus-uniform-${mode}.html`), uniformTemplate.replace('data-start-mode="U"', `data-start-mode="${mode}"`));
const shortSideTemplate = template
  .replace('data-start-mode="P"', 'data-layout-algorithm="short-side" data-start-mode="F"')
  .replace("监控室 · 放大算法重新设计", "监控室 · 统一短边完整原画")
  .replace("监控室 / 算法重新设计", "监控室 / 统一短边 · 完整原画")
  .replace("先看主画面有多大，再选布局。", "小窗短边相同，每一路画面完整。")
  .replace("主窗左上，小窗在右侧或底部。此次提供三种明确取舍：完整拼合、主画面优先、等比裁切铺满。所有画面不拉伸，每种方案都与当前算法直接对照。", "按你确认的要求：只统一小窗短边，长边按原比例变化。全部小视频保留完整画面，不裁切、不拉伸、无黑边。主窗在左上，允许主界面黑底；选择方案后才接入正式代码。")
  .replace("<span>红色标记 = 等比裁切量</span>", "<span>原画保留 = 100%</span>")
  .replace(/<div class="mt-3 grid gap-3 leading-6 lg:grid-cols-2">[\s\S]*?<\/div>\s*<\/details>/, `<div class="mt-3 grid gap-3 leading-6 lg:grid-cols-2">
        <p>共同短边 s：横屏 w=s×源比例、h=s；竖屏 w=s、h=s÷源比例。所有房间完整显示、原画保留 100%，尾行也不能单独放大。</p>
        <p>F 紧凑铺排：主视频至少保留整墙单窗最大视频面积的 45%，保证小窗观看尺寸后优先窗口覆盖率，再比较实际视频占用。观看门槛随墙面缩放，不通过极小小窗假报铺满。</p>
        <p>B 均衡观看：主视频至少保留单窗最大视频面积的 52%，小窗短边至少达到最佳候选的 85%。优先实际可见视频总面积。</p>
        <p>M 大主画面：沿用原 Q 的策略，主视频至少保留单窗最大视频面积的 60%，优先最大小窗共同短边。以上百分比在窄屏时不等于墙面占比。</p>
        <p>三种方案均要求主视频实际面积至少为最大小视频的 2.5 倍。3–4 格可使用单侧或双侧，5–16 格右侧与底部都有小窗。窗外背景与主窗黑底分别统计，不把黑底算成视频占用。</p>
        <p>U/V/W 的同宽同高裁切设计已被本页取代。此次仅修改开发预览，正式接入等待你选择 F、B 或 M。伪代码与数据流见 docs/focus-short-side.md；无 HTTP 接口、后端或数据库变更。</p>
      </div></details>`)
  .replace("FOCUS REPLAN / P · Q · R", "SHARED SHORT SIDE / F · B · M");
await writeFile(path.join(directory, "focus-short-side.html"), shortSideTemplate);
for (const mode of ["F", "B", "M"]) await writeFile(path.join(directory, `focus-short-side-${mode}.html`), shortSideTemplate.replace('data-start-mode="F"', `data-start-mode="${mode}"`));
const strictTemplate = uniformTemplate
  .replace('data-layout-algorithm="uniform" data-start-mode="U"', 'data-layout-algorithm="strict-fill" data-start-mode="W"')
  .replace("监控室 · 同尺寸小窗设计", "监控室 · 严格铺满布局")
  .replace("监控室 / 同尺寸小窗", "监控室 / 严格铺满 · 同尺寸小窗")
  .replace("历史预览 · 当前要求为统一短边", "当前设计 · 选择后再接入")
  .replace("除主画面外，小窗全部同宽同高。", "严格铺满，同尺寸小窗，主窗左上。")
  .replace("统一小窗尺寸，再安排右侧与底部。主画面完整显示，允许黑边；小视频等比裁切、无拉伸、无黑边。新版三个方案均与当前源码对照，选择后才接入正式代码。", "默认零间隔，所有窗口覆盖整墙，不留窗外空位。小窗宽高统一、视频等比裁切；主窗固定左上，完整显示，允许窗内黑边。只保留严格铺满的两套方案，选择后才接入正式代码。")
  .replace('id="designs" class="grid gap-3 sm:grid-cols-3"', 'id="designs" class="grid gap-3 sm:grid-cols-2"')
  .replace("三个新方案 · 点击查看与当前算法的对照", "两套严格铺满方案 · 与当前算法对照")
  .replace(/<div class="mt-3 grid gap-3 leading-6 lg:grid-cols-2">[\s\S]*?<\/div>\s*<\/details>/, `<div class="mt-3 grid gap-3 leading-6 lg:grid-cols-2">
        <p>W 减少裁切：统一小窗宽高，完整网格覆盖整墙。主视频保留单窗最大面积的至少 52%，满足观看尺寸时优先照顾裁切最多的一路。</p>
        <p>U 大主窗铺满：使用相同的完整网格候选，优先实际视频占用，通常主画面更大，小窗更窄，裁切可能更多。</p>
        <p>严格铺满作为硬约束。默认间隔为 0px，覆盖率为 100%。设置分隔线时，窗口加指定分隔线覆盖整墙，不存在额外空位。</p>
        <p>所有小窗同宽同高，源视频采用 cover 等比裁切、不拉伸、无黑边。主窗位于左上，视频 contain 完整显示，允许主窗内部黑边；它不属于布局空位。</p>
        <p>低格没有合适的同尺寸双侧完整网格时使用单侧条带；较多房间在满足观看尺寸时优先右侧和底部双区。尾行不会单独放大。</p>
        <p>用户已选择严格铺满，F/B/M 的保留完整小视频方案不再作为当前候选。本页只更新独立预览，正式代码等待选定 W 或 U。伪代码见 docs/focus-strict-fill.md，无接口或数据库变更。</p>
      </div></details>`)
  .replace("EQUAL WINDOWS / U · V · W", "STRICT FILL / W · U");
await writeFile(path.join(directory, "focus-strict-fill.html"), strictTemplate);
for (const mode of ["W", "U"]) await writeFile(path.join(directory, `focus-strict-fill-${mode}.html`), strictTemplate.replace('data-start-mode="W"', `data-start-mode="${mode}"`));
const percentTemplate = shortSideTemplate
  .replace('data-layout-algorithm="short-side" data-start-mode="F"', 'data-layout-algorithm="percent-native" data-start-mode="N"')
  .replace("监控室 · 统一短边完整原画", "监控室 · 原比例百分比布局")
  .replace("监控室 / 统一短边 · 完整原画", "监控室 / 原比例 · 百分比布局")
  .replace("设计预览 · 选择后再接入", "当前设计 · 选择后再接入")
  .replace("小窗短边相同，每一路画面完整。", "原比例小窗，主窗尽量减少黑边。")
  .replace("按你确认的要求：只统一小窗短边，长边按原比例变化。全部小视频保留完整画面，不裁切、不拉伸、无黑边。主窗在左上，允许主界面黑底；选择方案后才接入正式代码。", "按你确认的规则：小窗统一短边，保留完整原画，不裁切、不拉伸、无小窗黑边，允许布局空位。主窗固定左上，优先减少内部黑边；位置和宽高按墙面百分比表示。")
  .replace('id="designs" class="grid gap-3 sm:grid-cols-3"', 'id="designs" class="grid gap-3 sm:grid-cols-2"')
  .replace("三个新方案 · 点击查看与当前算法的对照", "两种取舍 · 原比例与当前算法对照")
  .replace(/<div class="mt-3 grid gap-3 leading-6 lg:grid-cols-2">[\s\S]*?<\/div>\s*<\/details>/, `<div class="mt-3 grid gap-3 leading-6 lg:grid-cols-2">
        <p>N 减少主窗黑边：覆盖率距当前条件下最佳候选不超过 2 个百分点，优先减少主窗内部黑边，再比较实际视频占用。</p>
        <p>C 紧凑完整画面：先选择最高窗口覆盖率，再减少主窗内部黑边。两种方案都统一小窗短边，保留完整小画面。</p>
        <p>加入主窗比例匹配的连续断点，避免固定比例模板遗漏更少黑边的布局。主视频实际面积至少保留单窗最大视频的 52%，并至少为最大小视频的 2.5 倍。</p>
        <p>默认间隔 0px。少量空位是优化目标，无法对任意比例承诺固定上限；N 的 2 个百分点是相对最佳可行覆盖率，不是整墙空位上限。</p>
        <p>宽百分比相对墙宽，高百分比相对墙高。相同宽高百分数不能保证原比例，改变墙面比例时重新计算；所有小窗短边一致。</p>
        <p>独立预览待选择 N 或 C 后接入。伪代码见 docs/focus-percent-native.md；无后端、接口或数据库变更。</p>
      </div></details>`)
  .replace('<footer class=', `<details class="mt-5 border border-[#cbd0c3] p-4 text-xs"><summary class="cursor-pointer">百分比坐标 · 相对墙面宽高</summary><table class="mt-3 w-full text-left font-mono"><thead><tr><th class="p-2">窗口</th><th class="p-2">左</th><th class="p-2">上</th><th class="p-2">宽</th><th class="p-2">高</th></tr></thead><tbody id="percent-geometry"></tbody></table></details><footer class=`)
  .replace("SHARED SHORT SIDE / F · B · M", "NATIVE PERCENT / N · C");
await writeFile(path.join(directory, "focus-percent-native.html"), percentTemplate);
for (const mode of ["N", "C"]) await writeFile(path.join(directory, `focus-percent-native-${mode}.html`), percentTemplate.replace('data-start-mode="N"', `data-start-mode="${mode}"`));
console.log("已生成当前 N/C 原比例百分比预览及历史设计入口。");
