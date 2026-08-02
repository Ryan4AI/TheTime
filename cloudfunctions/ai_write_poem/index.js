/**
 * 云函数：ai_write_poem
 *
 * v0.6.99（先生 2026-06-19 18:01 拍板）：抽签页 AI 写五言命签诗
 *   - 输入：state（属性 + 朝代 + 性别 + 职业 + 阶层 + 姓名 + age）+ archetype（诗体分类）
 *   - 输出：JSON { line1, line2 }（两行五言对仗）
 *   - 主路径：AI 生成（个性化和多样性）
 *   - 失败/超时：identity.js 端用诗库兜底（30 联）
 *
 * 入参：{ state, archetype }
 * 出参：{ success, line1, line2 }
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const https = require('https')

const MM_API_KEY = process.env.MM_API_KEY
const MM_BASE_URL = 'https://api.minimaxi.com/v1'
const MM_MODEL = 'MiniMax-M2.7-highspeed'
const MM_FALLBACK_MODEL = 'MiniMax-M2.7-highspeed'
const MAX_TOKENS = 400  // 诗很短，token 少给
const TEMPERATURE = 1.0  // 高温，多样性
const LLM_TIMEOUT_MS = 30000  // 抽签时诗需要快速出来

// 诗体描述（提示 AI 不同 archetype 写不同风格）
const ARCHETYPE_DESC = {
  war: '武将——铁马金戈、沙场点兵、功名沙场',
  wen: '文豪——笔墨纸砚、才冠天下、诗酒风流',
  xue: '学者——寒窗苦读、博览群书、穷经皓首',
  cai: '富商——金玉满堂、珠履锦绣、富甲一方',
  yi: '医师——悬壶济世、妙手回春、青囊秘传',
  gui: '官贵——朱衣紫绶、庙堂之高、治国安民',
  yan: '美人——桃面柳眉、花容月貌、倾城倾国',
  shan: '义士——侠肝义胆、仗剑江湖、济困扶危',
  gu: '困顿——命途多舛、风雨飘摇、零落成泥',
  ping: '平平——柴门桑麻、晨耕夜读、烟火人间',
}

exports.main = async (event) => {
  if (!event || !event.state) {
    return { success: false, error: '缺少 state' }
  }

  const { state, archetype } = event
  const arc = archetype || 'ping'
  const arcDesc = ARCHETYPE_DESC[arc] || ARCHETYPE_DESC.ping

  const systemPrompt = buildPoemSystemPrompt(state, arc, arcDesc)
  const userPrompt = buildPoemUserPrompt(state, arc, arcDesc)

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  // 调 LLM
  let content = ''
  try {
    const response = await callLLM(messages, MM_MODEL)
    content = response.choices?.[0]?.message?.content || ''
  } catch (e) {
    const status = e.statusCode || 0
    if (status === 400 || status === 429 || (status >= 500 && status < 600)) {
      console.error('[ai_write_poem] 主模型失败，回退:', status, e.message)
      try {
        const response = await callLLM(messages, MM_FALLBACK_MODEL)
        content = response.choices?.[0]?.message?.content || ''
      } catch (e2) {
        return { success: false, error: 'AI 不可用: ' + (e2.message || e.message) }
      }
    } else {
      return { success: false, error: 'AI 不可用: ' + e.message }
    }
  }

  // 解析 JSON
  let parsed = tryParseJson(content)
  if (!parsed) {
    return { success: false, error: 'AI 输出不含 JSON 对象', raw: content.slice(0, 200) }
  }

  // 兜底字段
  const line1 = (parsed.line1 || '').toString().trim()
  const line2 = (parsed.line2 || '').toString().trim()

  if (!line1 || !line2) {
    return { success: false, error: 'AI 输出字段缺失', raw: content.slice(0, 200) }
  }

  return {
    success: true,
    line1,
    line2,
    archetype: arc,
  }
}

// ─────── JSON 解析 ───────

function tryParseJson(content) {
  if (!content) return null
  let cleaned = content
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null
  }
  try {
    return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1))
  } catch (e) {
    return null
  }
}

// ─────── prompt 构造 ───────

function buildPoemSystemPrompt(state, arc, arcDesc) {
  return [
    '你是一位为穿越者写"命签诗"的史官，擅长以两行五言对仗凝练人物命格。',
    '',
    '【诗体分类】',
    `本签属于：${arc}（${arcDesc}）`,
    '',
    '【要求】',
    '- 严格两行，每行 5 字，共 10 字',
    '- 必须对仗（词性相对：名对名、动对动、形容词对形容词）',
    '- 不强求押韵，但读起来要有古诗韵味',
    '- 内容要体现"此人此生"的命格——结合朝代、阶层、职业、属性倾向',
    '- 不要现代词、不要"系统/游戏/穿越"等元概念',
    '- 不要重复用字（除非故意）',
    '- 不要"人生如寄""浮生若梦"等烂俗开头',
    '',
    '【范例】',
    '- 武将："铁马踏冰河 / 金戈映塞烟"',
    '- 文豪："笔落惊风雨 / 词成泣鬼神"',
    '- 学者："寒窗十载雪 / 青史一灯孤"',
    '- 富商："珠履三千客 / 金山百代空"',
    '- 医师："草木藏真诀 / 苍生托命悬"',
    '- 官贵："紫绶三公印 / 丹心万民忧"',
    '- 美人："桃面羞春月 / 柳眉锁晓烟"',
    '- 义士："仗剑行千里 / 舍生救一孤"',
    '- 困顿："风中一叶落 / 雨里数灯昏"',
    '- 平平："柴门闻犬吠 / 风雪夜归人"',
    '',
    '【输出格式】',
    '严格 JSON 对象，无任何其他文字：',
    '{',
    '  "line1": "第一行5字",',
    '  "line2": "第二行5字（与上联对仗）"',
    '}',
  ].join('\n')
}

function buildPoemUserPrompt(state, arc, arcDesc) {
  const attrs = state.attrs || {}
  const dynasty = state.dynasty || '某朝'
  const name = state.name || '此人'
  const gender = state.gender || '男'
  const age = state.age || 25
  const occupation = state.occupation || '庶民'
  const socialClass = state.socialClass || '庶人'
  const eraDisplay = state.eraDisplay || ''

  // 提取 top3 属性（让 AI 知道此人最擅长什么）
  const top3 = Object.entries(attrs)
    .sort((a, b) => (b[1] || 0) - (a[1] || 0))
    .slice(0, 3)
    .map(([k, v]) => `${k}(${v})`)
    .join('、')

  return [
    '【此人信息】',
    `姓名：${name}，${gender}，${age}岁`,
    `朝代：${dynasty}·${eraDisplay}`,
    `身份：${occupation}（${socialClass}）`,
    `命格倾向：${top3 || '无'}`,
    '',
    '请按 system prompt 要求写两行五言对仗诗。',
  ].join('\n')
}

// ─────── LLM 调用 ───────

function callLLM(messages, modelOverride) {
  return new Promise((resolve, reject) => {
    const useModel = modelOverride || MM_MODEL
    const data = JSON.stringify({
      model: useModel,
      messages,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      think: false,
    })
    const url = new URL(MM_BASE_URL + '/chat/completions')
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + MM_API_KEY,
      },
      timeout: LLM_TIMEOUT_MS,
    }, res => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        if (res.statusCode !== 200) {
          const err = new Error('AI 响应 ' + res.statusCode + ': ' + body.slice(0, 200))
          err.statusCode = res.statusCode
          reject(err)
          return
        }
        try {
          resolve(JSON.parse(body))
        } catch (e) {
          reject(new Error('AI 响应 JSON 解析失败: ' + e.message))
        }
      })
    })
    req.on('error', e => reject(e))
    req.on('timeout', () => {
      req.destroy(new Error('AI 调用超时'))
    })
    req.write(data)
    req.end()
  })
}
