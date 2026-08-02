/**
 * 云函数：ai_write_death
 *
 * v0.6.96（先生 2026-06-19 12:55 拍板）：死亡时单独调 AI 写死因 + 墓志铭
 * v0.6.97（先生 2026-06-19 17:33 拍板）：完整墓志铭 = 死因 + 志（小传 50-100 字）+ 铭（韵语 4-16 字）
 *   - 寿终/社会性死亡：代码判断 deathType，AI 写死因 + 志 + 铭
 *   - 意外：deathType='意外'，AI 从最近 narrative 推断并写
 *   - 最高成就由前端代码算（基于 state 属性，客观数据）
 *
 * 入参：{ state, narrativeHistory, deathType }
 * 出参：{ deathCause, epRecord, epitaph }
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const https = require('https')

const MM_API_KEY = process.env.MM_API_KEY
const MM_BASE_URL = 'https://api.minimaxi.com/v1'
const MM_MODEL = 'MiniMax-M2.7-highspeed'
const MM_FALLBACK_MODEL = 'MiniMax-M2.7-highspeed'
const MAX_TOKENS = 1500  // v0.6.97: 死因 + 志(50-100字) + 铭(4-16字)，token 多给点
const TEMPERATURE = 0.8
const LLM_TIMEOUT_MS = 90000

exports.main = async (event) => {
  if (!event || !event.state) {
    return { success: false, error: '缺少 state' }
  }

  const { state, narrativeHistory, deathType } = event
  const dt = deathType || '意外'

  // v0.6.99+ (B): 喂更长 history 让 AI 写出具体事件
  // v3.0.38: 先生 16:36 要求——全部给 AI·不截断 20 条
  const recentHistory = Array.isArray(narrativeHistory) ? narrativeHistory.slice() : []

  // 构造 system + user prompt
  const systemPrompt = buildDeathSystemPrompt(state, dt, recentHistory)
  const userPrompt = buildDeathUserPrompt(state, dt, recentHistory)

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
      console.error('[ai_write_death] 主模型失败，回退:', status, e.message)
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

  // v0.6.97: 增强 JSON 解析（修之前"AI 输出不含 JSON 对象"偶发失败）
  let parsed = tryParseJson(content)
  if (!parsed) {
    // 重试一次：用更强约束的 prompt 提示
    console.log('[ai_write_death] JSON 解析失败，重试...')
    const retryMessages = [
      ...messages,
      { role: 'assistant', content: content.slice(0, 500) },
      { role: 'user', content: '你之前的输出格式不对。请严格按 JSON 输出 { deathCause, epRecord, epitaph } 三个字段，不要任何其他文字（包括解释、markdown 标记、think 标签）。' },
    ]
    try {
      const retryResponse = await callLLM(retryMessages, MM_MODEL)
      const retryContent = retryResponse.choices?.[0]?.message?.content || ''
      parsed = tryParseJson(retryContent)
      if (parsed) content = retryContent
    } catch (e) {
      console.error('[ai_write_death] 重试失败:', e.message)
    }
  }
  if (!parsed) {
    return { success: false, error: 'AI 输出不含 JSON 对象', raw: content.slice(0, 500) }
  }

  // 后端兜底（防止 AI 漏字段）—— v3.0.35 删除 deathCause
  const epRecord = (parsed.epRecord || '').toString().trim() || getDefaultEpRecord(state, dt)
  const epitaph = (parsed.epitaph || '').toString().trim() || getDefaultEpitaph(state, dt)

  return {
    success: true,
    epRecord,
    epitaph,
    deathType: dt,
  }
}

// ─────── JSON 解析（v0.6.97 增强） ───────

function tryParseJson(content) {
  if (!content) return null
  // 多重清洗
  let cleaned = content
    .replace(/<think>[\s\S]*?<\/think>/g, '')  // 去 think 标签
    .replace(/```json\s*/gi, '')                  // 去 ```json
    .replace(/```\s*/g, '')                        // 去 ```
    .replace(/^[^{]*/, '')                         // 去前面非 JSON 字符
    .replace(/[^}]*$/, '')                         // 去后面非 JSON 字符
    .trim()

  // 尝试提取 JSON 对象
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null
  }
  const jsonStr = cleaned.substring(firstBrace, lastBrace + 1)
  try {
    return JSON.parse(jsonStr)
  } catch (e) {
    return null
  }
}

// ─────── prompt 构造 ───────

function buildDeathSystemPrompt(state, dt, history) {
  const isNobility = ['世家', '皇族', '官宦', '士族', '贵族'].indexOf(state.socialClass) >= 0
  const age = state.age || 20

  return [
    '你是一位置身事外的史官，为一个刚死去的人物写完整的"墓志铭"——含两部分：志（小传）+ 铭（韵语）。',
    '',
    '【必读】以下【最近剧情】是此人一生·你【必须】从里面提取至少 1 个具体事件写入志（不是"娶妻生子"这种空话）。',
    '',
    '【志】要求（50-100 字，散文）：',
    '- 死者小传',
    '- 包含：籍贯/出身 + 生平履历（做了什么官/什么身份/关键事迹） + 死因 + 葬处',
    '- 【按 deathType 写法】—— 三种死亡类型必须有明显不同的笔法：',
    '  - 寿终：志里要写"老死/病殁"+ 长寿痕迹（如子孙满堂、晚年平静）',
    '  - 社会性：志里要写"穷困潦倒"+ 沦落过程（如失去身份、亲友疏远）',
    '  - 意外：志里要写具体死因（从【最近剧情】提取最近事件·不能空泛"殁于乱世"）',
    '- 散文不押韵，但要简洁有历史质感',
    '- **强约束：【必须有具体事件】**—— 志里必须出现至少 1 个具体事件，例如：',
    '  - "嘉佑二年入县学，三试不第"（具体年份 + 科举经历）',
    '  - "为乡里修桥铺路，凡三十年"（具体善行 + 时长）',
    '  - "与妻张氏育二子一女，长子夭于疫"（具体家庭事件）',
    '  - "尝以医术救活濒死小儿七人"（具体救人事件）',
    '- **强约束：【禁止偷懒模板】**—— 禁止写以下空话：',
    '  - ❌ "一生未逢大变"（偷懒，不知道发生什么）',
    '  - ❌ "安稳度日"（偷懒）',
    '  - ❌ "娶妻生子"（空话，要写具体的家庭事件）',
    '  - ❌ "公姓X，Y朝Z人也。少习A，居B之列"（无事件）',
    '  - ❌ "享年X岁"（不写年龄）',
    '  - ❌ "无疾而终"（不写死因）',
    '- **强约束：【志里要写清楚怎么死的】**—— 不要单独"死因"字段，但志里必须包含死因描述',
    '- 不要"系统""穿越""游戏"等元概念',
    '- **强约束：【不要现代词】**—— 工人/学校/医院/老师/同学/公司/政府/社会 等不能用，用古代对应词（匠人/学塾/医馆/先生/同窗/东家/衙门/乡里）',
    '',
    '【铭】要求（4-16 字）：',
    '- 一句话，概括本世核心命运',
    '- 呼应此人的**最高成就 + 死因 + 一生主题**——不是按年龄模板',
    '- 押韵不强求，但读起来要有碑文感（庄重、克制、留白）',
    '- 不要"快乐地活下去""希望永存"等现代鸡汤',
    '- 不要"系统""死亡规则""游戏"等元概念',
    '',
    '【身份背景】',
    `- 姓名：${state.name || '无名'}，${state.gender || '男'}，${age}岁`,
    `- 阶层：${state.socialClass || '庶人'}`,
    `- 职业：${state.occupation || '庶民'}`,
    `- 朝代：${state.dynasty || '?'} · ${state.eraDisplay || ''}`,
    `- 死因类型：${dt}`,
    '',
    '【输出格式】',
    '严格 JSON 对象，无任何其他文字（包括解释、markdown、think 标签）：',
    '{',
    '  "epRecord": "50-100 字志（小传·含死因）",',
    '  "epitaph": "4-16 字铭（韵语）"',
    '}',
  ].join('\n')
}

function buildDeathUserPrompt(state, dt, history) {
  // v3.0.37: 先生 16:33 要求——剧情不截断·给完整内容（让 AI 看到所有细节）
  const histStr = history
    .map(h => `[${h.role}] ${h.content || ''}`)
    .join('\n')

  return [
    '【最近剧情·完整】',
    histStr || '（无）',
    '',
    '【死因类型】',
    dt,
    '',
    '请按 system prompt 格式输出 JSON。',
  ].join('\n')
}

// ─────── 后端兜底 ───────
// v3.0.35: 删掉 getDefaultDeathCause（死因在志里描述）

function getDefaultEpRecord(state, dt) {
  const name = state.name || '无名'
  const dynasty = state.dynasty || '某朝'
  const city = state.city || '某地'
  const occupation = state.occupation || '庶民'
  const socialClass = state.socialClass || '庶人'
  const age = state.age || 20

  if (dt === '社会性') {
    return `公姓${name}，${dynasty}${city}人也。少为${occupation}，以${socialClass}籍居。后遭变故，${occupation}之事尽废，沦为白身。亲友疏远，穷困潦倒，郁郁而终。享年${age}岁，葬于荒野。`
  }
  if (dt === '寿终') {
    return `公姓${name}，${dynasty}${city}人也。少习${occupation}，居${socialClass}之列。一生未逢大变，娶妻生子，安稳度日。享年${age}岁，无疾而终，葬于故里。`
  }
  // 意外
  return `公姓${name}，${dynasty}${city}人也。少为${occupation}，居${socialClass}之籍。享年${age}岁，殁于乱世，葬于他乡。`
}

function getDefaultEpitaph(state, dt) {
  const age = state.age || 20
  const isNobility = ['世家', '皇族', '官宦', '士族', '贵族'].indexOf(state.socialClass) >= 0
  if (dt === '社会性') {
    return isNobility ? '锦衣褪去，史书无载' : '来时无凭，去时无声'
  }
  if (age < 15) return '未及弱冠，便已消散于人海。'
  if (age < 30) return isNobility ? '锦衣玉食，终化南柯一梦。' : '青春未展，已无踪迹可寻。'
  if (age < 50) return isNobility ? '风云一世，史书半行。' : '碌碌半生，终归尘土。'
  return isNobility ? '功过自有后人评。' : '一生如梦，来去无痕。'
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
