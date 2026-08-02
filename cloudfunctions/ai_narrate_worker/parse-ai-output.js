/**
 * parse-ai-output.js —— AI 叙事输出解析模块（独立可测）
 *
 * 2026-08-02 抽取：把 ai_narrate_worker 里 callAI 的 JSON 解析链路独立成模块，
 * 配套单测 parse-ai-output.test.js。规则：
 *   1. 每遇到一次真实解析失败，就往测试文件加一个 case（用真实 AI 输出）
 *   2. 每次改动本模块，必须保证所有历史 case 仍通过
 *
 * 解析链路（逐级降级）：
 *   ① JSON.parse 直接解析
 *   ② 去转义重试：AI 偶发把 JSON 二次转义（\"options\":[\"a\"...]），全局还原 \" → " 再试
 *   ③ fixJSONContentQuotes：修复 content 里的裸英文引号（"他说"快跑"" 破坏 JSON 结构）
 *   ④ fallbackExtractBranch：正则硬抽 content/options，构造伪分支让玩家继续玩（D059）
 *   全部失败 → 返回 { branches: null, parseError }
 */

// 修复 AI 输出 JSON 中的裸引号（content/options 对话里的英文双引号"）
// 策略：多次尝试，逐步放宽修复力度，每步都 parse 验证
//   1. 直接 parse → 通就返回
//   2. 修「明确是内容的引号」（下一个非空字符不是 JSON 结构符）→ parse
//   3. 修「, 后不是 " 的引号」（逗号但不是数组分隔符）→ parse
//   4. 返回最后修的版本（让 fallbackExtractBranch 兜底）
function fixJSONContentQuotes(text) {
  // 快速路径：已经合法
  try { JSON.parse(text); return text } catch (e) {}

  // 第一轮：只修「明确是内容的引号」
  // 下一个非空字符不是 : , } ] \n（即不是 JSON 结构符）→ 肯定是内容引号
  var fixed1 = fixQuotesByNextChar(text, function(next) {
    return ':,}]\n'.indexOf(next) === -1
  })
  try { JSON.parse(fixed1); return fixed1 } catch (e) {}

  // 第二轮：额外修「, 后不是 " 的引号」
  // 即下一个非空字符是 , 但再下一个不是 "（不是数组分隔符 "," 模式）
  var fixed2 = fixQuotesByNextChar(text, function(next, nextNext) {
    if (':,}]\n'.indexOf(next) !== -1) return false  // 结构符，不修
    if (next === ',' && nextNext === '"') return false  // 可能是数组分隔符，先不修
    return true  // 其他情况，修
  })
  try { JSON.parse(fixed2); return fixed2 } catch (e) {}

  // 第三轮：最激进——把 "," 模式中的 " 也修掉（数组分隔符变成内容引号）
  var fixed3 = fixQuotesByNextChar(text, function(next) {
    return ':,}]\n'.indexOf(next) === -1
  })
  // 如果 fixed3 比 fixed2 多修了东西，再试一次
  if (fixed3 !== fixed2) {
    try { JSON.parse(fixed3); return fixed3 } catch (e) {}
  }

  // 全部失败，返回 fixed1 让 fallbackExtractBranch 兜底
  return fixed1
}

// 辅助函数：按 shouldFix(nextChar, nextNextChar) 判断是否修引号
function fixQuotesByNextChar(text, shouldFix) {
  var result = ''
  var inStr = false
  for (var i = 0; i < text.length; i++) {
    var ch = text[i]
    if (ch === '\\') {
      result += ch
      if (i + 1 < text.length) { result += text[++i] }
      continue
    }
    if (ch === '"') {
      if (!inStr) {
        inStr = true
        result += ch
      } else {
        var j = i + 1
        while (j < text.length && text[j] === ' ') j++
        var next = text[j] || ''
        var nextNext = (j + 1 < text.length) ? text[j + 1] : ''
        if (shouldFix(next, nextNext)) {
          result += '\u300d'  // 」（内容引号，替换）
        } else {
          inStr = false
          result += ch  // 结构引号，保留
        }
      }
    } else {
      result += ch
    }
  }
  return result
}

// D059（2026-07-05 01:40 先生拍板·A 方案）：正则 fallback 提取 content/options
// 用法：JSON.parse 失败时（且 fixJSONContentQuotes 也没修好），从 raw 文本里硬抽
// 返回 { content, options } 或 null
function fallbackExtractBranch(rawText) {
  if (!rawText || typeof rawText !== 'string') return null
  // D094-month-debug：fallback 提取逻辑大幅放宽
  // 真因：AI 偶发丢字段名（如 "提前做好打算","进城后..." 这种内容直接接 options 元素）
  //       原正则要求 "options/patch/state/items" 才闭合 content，找不到就 fallback 失败
  //       → branches=null → finalize 拿不到 content/options → finalize 崩或前端显示 raw_text
  //       → 前端 state.month 不更新（finalize 没成功）
  // 修法：从 "content": " 之后找第一个 " + 结构符（,/]/}），不依赖具体字段名
  let cleaned = rawText
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')

  let content = null
  const contentStart = cleaned.indexOf('"content"')
  if (contentStart >= 0) {
    const colonPos = cleaned.indexOf(':', contentStart)
    const firstQuotePos = cleaned.indexOf('"', colonPos + 1)
    if (firstQuotePos > 0) {
      const restText = cleaned.substring(firstQuotePos + 1)
      const closeMatch = restText.match(/^([\s\S]*?)"\s*[,}\]]/)
      if (closeMatch) {
        content = closeMatch[1]
          .replace(/\\"/g, '"')
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\\\/g, '\\')
      }
    }
  }
  // D090-hotfix5 兜底：抽不到 JSON content 时把整段文本当 content
  if (!content) {
    if (cleaned.trim().length > 20) {
      content = cleaned.trim()
    }
  }
  // 抽 options：找所有 [...] 数组，挑包含 ≥2 字符串的那个
  // 2026-08-02：AI 偶发二次转义（\"a\"），先还原 \" → " 再匹配
  let options = []
  const arrayMatches = cleaned.replace(/\\"/g, '"').matchAll(/\[([^\[\]]*)\]/g)
  for (const m of arrayMatches) {
    const inner = m[1]
    const strs = inner.match(/"((?:\\.|[^"\\])*)"/g) || []
    if (strs.length >= 2) {
      options = strs.map(s => s.slice(1, -1)
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\')
      )
      break
    }
  }
  if (!content || options.length === 0) {
    if (content) {
      return { content, options: ['继续观察', '尝试离开', '寻找机会'], patch: {} }
    }
    return null
  }
  if (options.length > 4) options = options.slice(0, 4)
  return { content, options, patch: {} }
}

/**
 * 主入口：解析 AI 叙事输出
 * @param {string} content AI 原始输出（可能带 think 标签 / ```json 围栏 / 前后废话）
 * @returns {{ branches: object|null, fallbackUsed: boolean, cleaned: string, parseError: Error|null }}
 *   - branches: 解析出的分支（单对象或数组，未包装成 finalBranches）
 *   - fallbackUsed: 是否走了正则兜底
 *   - cleaned: 预处理/修复后的文本（用于存 llm_io.raw_response 原始输出）
 *   - parseError: 全部失败时的错误（branches 为 null 时有效）
 */
function parseAIOutput(content) {
  // 流式下 think 标签可能未关闭·前端展示时再剥
  let cleaned = (content || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim()
  // v3.0.13: 截取逻辑——单对象用 { }·数组用 [ ]
  // 先生 03:48 反馈 LLM 仍输出 [array] 4 分支·前端报 [RESPONSE_ERROR] 选项不渲染
  // 解：双兼容·前端 / worker 都支持 [array] 和 {object} 两种格式
  const firstBracket = cleaned.indexOf('[')
  const lastBracket = cleaned.lastIndexOf(']')
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)
      && lastBracket !== -1 && lastBracket > firstBracket) {
    cleaned = cleaned.substring(firstBracket, lastBracket + 1)
  } else if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1)
  }

  let branches = null
  let fallbackUsed = false
  let parseError = null
  let repaired = false  // 2026-08-02：第一轮 parse 失败但被修复（去转义 / fixJSON），供上层打诊断日志

  // v0.6.50: AI 常用英文双引号"写叙事对话，破坏JSON结构，试一次自动修复
  if (cleaned) {
    try {
      branches = JSON.parse(cleaned)
    } catch (e) {
      // 2026-08-02：AI 偶发把 JSON 二次转义（\"options\":[\"a\"...] 键值全带反斜杠）
      // 特征：JSON.parse 报 "Expected double-quoted property name"
      // 修法：全局还原 \" → " 再试；若 content 里有合法转义引号被误伤，继续走 fixJSONContentQuotes 兜底
      let fixed = null
      try {
        const deescaped = cleaned.replace(/\\"/g, '"')
        if (deescaped !== cleaned) {
          branches = JSON.parse(deescaped)
          if (branches) {
            cleaned = deescaped  // 去转义成功，rawContent 用修复后的
            repaired = true
          }
        }
      } catch (eDe) {
        // 去转义后仍失败（如 content 裸引号被误伤），继续走原链路
      }
      if (!branches) {
        // 第一次 parse 失败：尝试自动修复 content 中的裸引号
        fixed = fixJSONContentQuotes(cleaned)
        try {
          branches = JSON.parse(fixed)
          if (branches) {
            cleaned = fixed  // fixJSON 成功，rawContent 用修复后的
            repaired = true
          }
        } catch (e2) {
          // D059（2026-07-05 01:40 先生拍板·A 方案）：正则 fallback 提取 content/options
          // 真因：fixJSONContentQuotes 处理英文 " 但不处理其他字符（如 < > | 等）
          // 修法：用正则兜底提取 content 和 options，构造伪 branch 让玩家继续玩
          const fb = fallbackExtractBranch(cleaned)
          if (fb && fb.content) {
            branches = fb
            fallbackUsed = true
          }
        }
      }
    }
  }

  if (!branches && !fallbackUsed) {
    try {
      branches = JSON.parse(cleaned)
      if (!Array.isArray(branches)) {
        // v3.0.9: 兼容单对象（v3.0.9 之前是数组格式）· 如果是数组就取 [0]
        if (branches.items && Array.isArray(branches.items)) branches = branches.items
        else if (branches.branches && Array.isArray(branches.branches)) branches = branches.branches
        // 如果是单对象·branches 保持原样（callAI 后面会处理）
      }
    } catch (e) {
      parseError = e
    }
  }

  return { branches, fallbackUsed, cleaned, parseError, repaired }
}

module.exports = { parseAIOutput, fixJSONContentQuotes, fallbackExtractBranch }
