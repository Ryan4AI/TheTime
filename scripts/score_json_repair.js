// score_json_repair.js — AI₂ 结算 JSON 容错解析（P-194 提案，未接入 worker）
//   背景：llm_io 实测 275 条 score 里 5 条现有链路解析失败（1.8%）→ attrPatch={} 静默丢结算
//   失败根因两类：
//     A. 格式不规范（裸键 name:"x" / 字符串内误用双引号 "来自"来处"的"）→ 可修
//     B. 输出被 max_tokens 截断（reason 太长，JSON 没闭合）→ 修不了，需另一路（预算/精简 reason）
// 本模块只处理 A，返回 { ok, value, method }
'use strict'

function stripFence(raw) {
  return String(raw == null ? '' : raw)
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<aihint>[\s\S]*?<\/aihint>/g, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()
    .replace(/[“”]/g, '"')
}

// 截取最外层 {...}
function outerObject(s) {
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  return (a !== -1 && b > a) ? s.slice(a, b + 1) : s
}

// 1) 字符串内多余的双引号 → 转义
//    判据：字符串里遇到 " 时，向后找第一个非空白字符；若是 , } ] : 或结尾才算「串的结束」，否则视为内容里的引号
function escapeInnerQuotes(s) {
  let out = '', inStr = false, esc = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (esc) { out += ch; esc = false; continue }
    if (ch === '\\') { out += ch; esc = true; continue }
    if (ch === '"') {
      if (!inStr) { inStr = true; out += ch; continue }
      let j = i + 1
      while (j < s.length && /\s/.test(s[j])) j++
      const nx = s[j]
      if (nx === ',' || nx === '}' || nx === ']' || nx === ':' || nx === undefined) { inStr = false; out += ch }
      else out += '\\"'
      continue
    }
    out += ch
  }
  return out
}

// 2) 裸键加引号：{name: / ,icon:   →  {"name": / ,"icon":
//    只处理「前面是 { 或 , 」的位置，已带引号的不会命中
function quoteBareKeys(s) {
  return s.replace(/([{,]\s*)([A-Za-z_$][\w$]*|[\u4e00-\u9fa5][^:,{}\[\]"]*?)\s*:/g,
    (m, p1, k) => p1 + '"' + k.trim() + '":')
}

const tryParse = (s) => { try { return JSON.parse(s) } catch (e) { return null } }

/**
 * @param {string} raw LLM 原样输出
 * @returns {{ok:boolean, value:object|null, method:string}}
 */
function repairScoreJson(raw) {
  const base = stripFence(raw)
  // 现有 worker 的三层
  let v = tryParse(base) || tryParse(outerObject(base))
  if (v) return { ok: true, value: v, method: 'runtime' }
  if (base.includes(':')) { v = tryParse('{' + base + '}'); if (v) return { ok: true, value: v, method: 'runtime+wrap' } }
  // 增强修复
  const o = outerObject(base)
  const q = escapeInnerQuotes(o)
  v = tryParse(q) || tryParse(quoteBareKeys(q)) || tryParse(quoteBareKeys(o))
  if (v) return { ok: true, value: v, method: 'repair' }
  return { ok: false, value: null, method: 'fail' }
}

module.exports = { repairScoreJson, stripFence, outerObject, escapeInnerQuotes, quoteBareKeys }

// 自测：node scripts/score_json_repair.js
if (require.main === module) {
  const cases = [
    ['裸键(嵌套)', '{"财富":-50,"month_delta":0,"items":{"锈铁盒":{name:"锈铁盒",icon:"📦",dur:100}}}'],
    ['串内引号', '{"items":{"第五只铁匣":{name:"第五只铁匣","desc":"来自"来处"的神秘铁器"}},"month_delta":1}'],
    ['围栏+think', '<think>x</think>\n```json\n{"财富":15,"month_delta":2}\n```'],
    ['截断(应失败)', '{"财富":-150,"month_delta":1,"reason":"诊金支'],
  ]
  for (const [name, raw] of cases) {
    const r = repairScoreJson(raw)
    console.log((r.ok ? '✅' : '❌'), name.padEnd(12), r.method, r.ok ? JSON.stringify(r.value).slice(0, 70) : '')
  }
}
