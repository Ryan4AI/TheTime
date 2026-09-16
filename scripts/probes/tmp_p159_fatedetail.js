// P-159 命格区「属性详情模式」可读性 + 雷达图标签余量检查（PMO 2026-09-16 晚班新增）
//   144-156 期审过：选项区 / 底栏命中区(命格·物品格·飘字) / 物品清单 / 死亡结算 / 榜单 /
//   属性详情弹窗 / 叙事区 / 顶栏 / 目标条 / 等待·反馈·输入三区。
//   **命格区内部（雷达图标签 + showFateDetail 九行数值列表）从未单独审过** → 本期补。
//   触发方式：点命格区切换 showFateDetail（9 属性竖向列表塞进 56px 高底栏）。
// 纯几何 + 真画布 measureText，不连 DB、不跑游戏。
const { createCanvas } = require('/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas');
const canvas = createCanvas(375, 812);
const ctx = canvas.getContext('2d');
const W = parseInt(process.env.P_W || '375', 10);

// 与 drawItemBar（game.js:2535-2540）同一套常量
const P = 14, radarR = 15, radarLabelOff = 4;
const fateW = (radarR + radarLabelOff) * 2 + 20;   // = 58
const dividerX = P + fateW;                        // = 72
const fateCX = dividerX - fateW / 2;               // = 43
const barH = 56;                                   // C 方案（D088）物品栏高
const barY = 812 - barH;                           // 粗略底栏 y（只算相对量）
const FONT = '"STKaiti", "KaiTi", "楷体", sans-serif';

// 先生真机数据（李昌，09-12 22:07 那轮 system 消息）
const REAL = { '声望': 2633, '财富': 1123, '学识': 815, '颜值': 930, '医术': 85, '战功': 710, '文采': 0, '政绩': 0, '义行': 2180 };
const KEYS = Object.keys(REAL);

console.log(`=== P-159 命格区检查  屏宽=${W}  命格区=[${P}, ${dividerX}] 宽${fateW}  底栏高=${barH} ===\n`);

// ── ① 属性详情模式：9 行 × 行距 5px × 字号 5px（game.js:2594-2600 原样）
console.log('① 属性详情模式（showFateDetail，game.js:2590 起）');
const rowGap = 5, fs = 5;
ctx.font = `${fs}px ${FONT}`;
const rowsTop = barY + 4;
const lastRowTop = rowsTop + 8 * rowGap;
const nameW = Math.max(...KEYS.map(k => ctx.measureText(k).width));
const valW = Math.max(...KEYS.map(k => ctx.measureText(String(REAL[k])).width));
const colAvail = fateW - 6 - 6; // nameColX = P+6, valColX = P+fateW-6
console.log(`  9 行占高 = ${(8 * rowGap + fs).toFixed(1)}px / 可用 ${barH - 4}px（字号${fs} 行距${rowGap}）`);
console.log(`  末行底缘 = 行顶 ${(lastRowTop - barY).toFixed(1)} + 字高 ${fs} = ${(lastRowTop - barY + fs).toFixed(1)}px（底栏内 ${barH}px）→ ${lastRowTop - barY + fs <= barH ? '不超框 ✅' : '超框 ❌'}`);
console.log(`  列宽占用 = 属性名 ${nameW.toFixed(1)} + 数值 ${valW.toFixed(1)} = ${(nameW + valW).toFixed(1)}px / 可用 ${colAvail}px → ${nameW + valW <= colAvail ? '不重叠 ✅' : '重叠 ❌'}`);

// 5px 字到底有多小：与常见可读下限对比
const refPx = 12; // 正文可读下限（经验值）
console.log(`  ⚠️ 字号 ${fs}px = 可读下限 ${refPx}px 的 ${(fs / refPx * 100).toFixed(0)}%；9 行塞进 ${barH}px → 每行均摊 ${(barH / 9).toFixed(1)}px`);
for (const target of [10, 12]) {
  const need = 9 * target + (9 - 1) * 2; // 字号 + 2px 行间距
  console.log(`     若要 ${target}px 可读：需 ${need}px 高 vs 底栏 ${barH}px → 差 ${need - barH}px ${need <= barH ? '（塞得下）' : '（塞不下，必须改浮窗）'}`);
}

// ── ② 雷达图标签 9 方向包围盒 vs 命格区边界
console.log('\n② 雷达图标签（默认模式，game.js:2617-2624）');
ctx.font = `6px ${FONT}`;
ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
let worst = { left: 1e9, right: -1e9, top: 1e9, bottom: -1e9 };
for (let i = 0; i < 9; i++) {
  const a = -Math.PI / 2 + (i + 0.5) * (Math.PI * 2) / 9;
  const labelDist = radarR + radarLabelOff;
  const lx = fateCX + (labelDist + 5) * Math.cos(a);
  const ly = (barH / 2) + (labelDist + 5) * Math.sin(a);
  const w = ctx.measureText(KEYS[i]).width, h = 6;
  worst.left = Math.min(worst.left, lx - w / 2);
  worst.right = Math.max(worst.right, lx + w / 2);
  worst.top = Math.min(worst.top, ly - h / 2);
  worst.bottom = Math.max(worst.bottom, ly + h / 2);
}
console.log(`  标签包围盒 x=[${worst.left.toFixed(1)}, ${worst.right.toFixed(1)}] y=[${worst.top.toFixed(1)}, ${worst.bottom.toFixed(1)}]（相对命格区/底栏）`);
console.log(`  命格区 x=[${P}, ${dividerX}] → 左余量 ${(worst.left - P).toFixed(1)}px  右余量 ${(dividerX - worst.right).toFixed(1)}px`);
console.log(`  底栏 y=[0, ${barH}] → 上余量 ${worst.top.toFixed(1)}px  下余量 ${(barH - worst.bottom).toFixed(1)}px`);
const bad = [worst.left - P, dividerX - worst.right, worst.top, barH - worst.bottom].filter(v => v < 0).length;
console.log(`\n=== 结论：① 详情模式 ${(lastRowTop - barY + fs <= barH && nameW + valW <= colAvail) ? '布局不溢出 ✅' : '布局溢出 ❌'}，但字号仅 ${fs}px（可读下限的 ${(fs / refPx * 100).toFixed(0)}%）= 结构性不可读 ⚠️`
  + ` / ② 雷达标签 ${bad ? bad + ' 个方向擦边 ❌' : '全在框内 ✅'} ===`);
