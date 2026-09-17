// P-161 死亡页墓碑碑文几何检查（PMO 2026-09-17 午班新增）
//   death.js 从未单审过。drawFarStoneText(death.js:1328) 画 碑额/副标题/志/铭 四段，
//   **志(epRecord) 用 splitText 无行数上限**（death.js:1473 splitText 只按字数切行，不截断）
//   → 志越长行数越多，而远景碑 scale 越小、pH 越小 → 可能溢出碑身/压到底座/画到草地上。
//   本探针：按 death.js 真实常量重算每排(drow 0-4)容量 vs 实际需求，纯逻辑不连 canvas。
// 屏高用 P_H 覆盖；真实 splitText 是**字符数**切行（不用 measureText），可精确复现。
const https = require('https');
const fs = require('fs');
const path = require('path');
const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync(path.join(__dirname, '../../credentials/app-secret.json'), 'utf8')
  .match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';
const H = parseInt(process.env.P_H || '812', 10);

function getToken() {
  return new Promise((res, rej) => {
    https.get(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => {
        const j = JSON.parse(d); j.access_token ? res(j.access_token) : rej(new Error('token: ' + d.slice(0, 120)));
      });
    }).on('error', rej);
  });
}
function dbQuery(token, query) {
  return new Promise((res, rej) => {
    const body = JSON.stringify({ env: ENV_ID, query });
    const req = https.request({
      hostname: 'api.weixin.qq.com', path: `/tcb/databasequery?access_token=${token}`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(new Error('parse')); } }); });
    req.on('error', rej); req.write(body); req.end();
  });
}

// ── death.js:1463 splitText 原样复刻 ──
function splitText(text, maxWidth, fontSize) {
  if (!text) return [''];
  var maxChars = Math.floor(maxWidth / fontSize) || 12;
  var lines = [], cur = '';
  var segs = text.split(/([，。；！？、])/);
  for (var i = 0; i < segs.length; i++) {
    var seg = segs[i]; if (!seg) continue;
    if ((cur + seg).length <= maxChars) cur += seg;
    else {
      if (cur) lines.push(cur);
      if (seg.length > maxChars) { for (var j = 0; j < seg.length; j += maxChars) lines.push(seg.substring(j, j + maxChars)); cur = ''; }
      else cur = seg;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

// 默认志（ai_write_death getDefaultEpRecord 三条模板）+ 真实存档字段
function defaultZhi(s, dt) {
  const n = s.name || '无名', dy = s.dynasty || '某朝', c = s.city || '某地', o = s.occupation || '庶民', sc = s.social_class || '庶人', a = s.age || 20;
  if (dt === '社会性') return `公姓${n}，${dy}${c}人也。少为${o}，以${sc}籍居。后遭变故，${o}之事尽废，沦为白身。亲友疏远，穷困潦倒，郁郁而终。享年${a}岁，葬于荒野。`;
  if (dt === '寿终') return `公姓${n}，${dy}${c}人也。少习${o}，居${sc}之列。一生未逢大变，娶妻生子，安稳度日。享年${a}岁，无疾而终，葬于故里。`;
  return `公姓${n}，${dy}${c}人也。少为${o}，居${sc}之籍。享年${a}岁，殁于乱世，葬于他乡。`;
}

async function main() {
  const token = await getToken();
  const r = await dbQuery(token, `db.collection('player_life').orderBy('created_at','desc').limit(5).get()`);
  if (r.errcode) { console.error('DB ERR', r.errcode, r.errmsg); process.exit(1); }
  const lives = (r.data || []).map(x => (typeof x === 'string' ? JSON.parse(x) : x));
  const s = lives.find(l => l.name) || {};
  console.log(`=== P-161 死亡页碑文容量检查  屏高=${H}  参考存档：${s.name || '?'}·${s.age || '?'}岁·${s.city || '?'}·${s.occupation || '?'} ===`);

  // death.js:140-152 layout
  const mainH = Math.floor(H * 0.5);
  const mainW = Math.floor(mainH * 0.55);
  const capHRef = 30, baseHRef = 36;
  console.log(`主碑 mainH=${mainH} mainW=${mainW}\n`);

  const drowCfg = [1.00, 0.55, 0.32, 0.18, 0.10];
  const cases = [
    { label: '志=默认(寿终)', zhi: defaultZhi(s, '寿终'), ming: '功过自有后人评' },
    { label: '志=默认(意外)', zhi: defaultZhi(s, '意外'), ming: '来时无凭，去时无声' },
    { label: '志=AI上限100字', zhi: '公姓李昌，后周汴京人也。少为渔夫，居庶民之籍。显德初穿越至此，救韩通于危难，得赵匡胤赏识，入军从戎。后封义军指挥使，深入芦芽山夺铁器、闭邪门，屡陷死地而全身。北伐中伏，突围南奔，终殁于乱军。'.slice(0, 100), ming: '一生如梦，来去无痕' },
    { label: '志=150字(超约束)', zhi: '公姓李昌，后周汴京人也。少为渔夫，居庶民之籍。显德初穿越至此，救韩通于危难，得赵匡胤赏识，入军从戎。后封义军指挥使，深入芦芽山夺铁器、闭邪门，屡陷死地而全身。北伐中伏，突围南奔，终殁于乱军之中，尸骨无存，唯怀中铁器不知所终，后人遂以衣冠冢葬之，享年三十九岁。'.slice(0, 150), ming: '一生如梦，来去无痕' },
  ];

  for (const c of cases) {
    console.log(`\n── ${c.label}（志 ${c.zhi.length} 字 / 铭 ${c.ming.length} 字）──`);
    for (let drow = 0; drow < drowCfg.length; drow++) {
      const scale = drowCfg[drow];
      const pW = Math.max(12, Math.floor(mainW * scale));
      const pH = Math.max(14, Math.floor(mainH * scale));
      const padX = Math.max(1, pW * 0.10);
      const tabW = pW - padX * 2;
      const bodySize = Math.max(2, Math.floor(14 * scale));
      const mingSize = Math.max(2, Math.floor(12 * scale));
      const bodyLineH = bodySize + 6;
      const bodyStartY = pH * 0.27;
      const capH = Math.max(3, Math.floor(capHRef * (scale >= 0.7 ? 1 : scale * 0.6)));  // death.js:823
      const baseH = Math.max(3, Math.floor(baseHRef * scale));
      const bodyLimit = pH - baseH;   // 底座顶边 = 文字不该越过
      const hardLimit = pH;           // 碑底 = 绝对溢出

      const zhiLines = splitText(c.zhi, tabW - 2, bodySize);
      let y = bodyStartY;
      y += zhiLines.length * bodyLineH;
      y += bodyLineH * 1.0;                      // 铭前空一行
      const mingLines = splitText(c.ming, tabW - 2, mingSize);
      y += mingLines.length * bodyLineH;
      const endY = y;                            // 相对 pY

      const overBase = endY - bodyLimit;
      const overHard = endY - hardLimit;
      const flag = overHard > 0 ? '🔴 溢出碑外' : (overBase > 0 ? '🟠 压到底座' : '✅ 安全');
      const charsPerLine = Math.floor((tabW - 2) / bodySize) || 12;
      console.log(`  drow=${drow} scale=${scale.toFixed(2)} 碑${pW}x${pH} 字${bodySize}px 每行${charsPerLine}字 | 志${zhiLines.length}行+铭${mingLines.length}行 文字底=${endY.toFixed(0)} 底座顶=${bodyLimit.toFixed(0)} 碑底=${hardLimit} ${flag}${overBase > 0 ? ` (+${overBase.toFixed(0)}px)` : ''}`);
    }
  }

  // ── 阈值扫描：主碑(drow=0) 志多少字开始撞到「左右划切换」提示 / 溢出碑外 ──
  console.log(`\n── 阈值扫描（主碑 drow=0，铭固定 9 字，屏高 ${H}）──`);
  const mkZhi = n => '公姓李昌，后周汴京人也，少为渔夫，居庶民之籍，显德初穿越至此，救韩通于危难，得赵匡胤赏识，入军从戎，后封义军指挥使，深入芦芽山夺铁器闭邪门，屡陷死地而全身，北伐中伏突围南奔，终殁于乱军之中，尸骨无存，唯怀中铁器不知所终，后人以衣冠冢葬之，享年三十有九岁'.slice(0, n);
  const scale = 1.0;
  const pW = Math.max(12, Math.floor(mainW * scale)), pH = Math.max(14, Math.floor(mainH * scale));
  const padX = Math.max(1, pW * 0.10), tabW = pW - padX * 2;
  const bodySize = Math.max(2, Math.floor(14 * scale)), mingSize = Math.max(2, Math.floor(12 * scale)), bodyLineH = bodySize + 6;
  const hintY = pH - 50;   // death.js:875 提示 y = sy + sh - 50（相对碑顶）
  for (let n = 50; n <= 160; n += 10) {
    const zl = splitText(mkZhi(n), tabW - 2, bodySize);
    const ml = splitText('一生如梦来去无痕', tabW - 2, mingSize);
    const lastLineY = pH * 0.27 + (zl.length + 1 + ml.length - 1) * bodyLineH;
    const bottom = lastLineY + bodySize * 0.5;
    const flag = bottom > pH ? '🔴 溢出碑外' : (bottom > hintY ? '🟠 压到提示' : '✅ 安全');
    console.log(`  志=${String(n).padStart(3)}字 → 志${zl.length}行+铭${ml.length}行 文字底=${bottom.toFixed(0)} (提示=${hintY.toFixed(0)} 碑底=${pH}) ${flag}`);
  }
}
main().catch(e => console.error('ERR:', e.message));
