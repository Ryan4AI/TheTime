// ⚠️ CJK 字宽修正垫片（PMO 2026-09-17）
// 本机 @napi-rs/canvas **没有中文字体** → measureText 把汉字当成 .notdef，
// 实测 '汉'@13px = 7.8px = **0.6em**（真机楷体/黑体汉字 = **1.0em**）→ 所有探针宽度被低估约 40%。
// 用法：node -r ./scripts/probes/_cjk_shim.js scripts/probes/tmp_p155_topbar.js
// 影响：P-1512 / P-152 / P-153 / P-154(b) / P-155 / P-157 / P-159 / P-160 / P-162 凡用 measureText 量中文的，
//       原"✅ 全绿"结论都需按本垫片重跑复核。
const { createCanvas } = require('/home/admin/.local/share/pnpm/global/5/.pnpm/@napi-rs+canvas@0.1.97/node_modules/@napi-rs/canvas');
const _probeCtx = createCanvas(1, 1).getContext('2d');
const CtxProto = Object.getPrototypeOf(_probeCtx);
const CJK = /[\u2E80-\u9FFF\u3000-\u303F\uFF01-\uFF60\uFFE0-\uFFE6]/;
const orig = CtxProto.measureText;
CtxProto.measureText = function (t) {
  const m = /(?:^|\s)(\d+(?:\.\d+)?)px/.exec(this.font || '');
  const fs = m ? parseFloat(m[1]) : 16;
  let w = 0;
  for (const ch of String(t)) {
    if (CJK.test(ch)) w += fs;            // 汉字/全角标点 = 1.0em（真机值）
    else if (ch === ' ') w += fs * 0.30;  // 半角空格
    else w += fs * 0.55;                  // 拉丁字母/数字（保守偏大）
  }
  return { width: w, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w, actualBoundingBoxAscent: fs * 0.8, actualBoundingBoxDescent: fs * 0.2 };
};
if (process.env.CJK_SHIM_VERBOSE) console.error('[cjk-shim] 汉字按 1.0em 计（本机字体缺 CJK，原始 measureText 只有 0.6em）');
// 保留原函数备用
CtxProto.measureTextRaw = orig;
