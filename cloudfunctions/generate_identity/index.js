/**
 * 云函数：generate_identity
 * 
 * 穿越身份生成器 v2
 * 算法：人·年·城 加权随机穿越
 * 
 * - 选年份+城市：两遍遍历 era_cities（所有记录）
 * - 生成名字：DeepSeek v4 Flash 根据时代+城市+名人群像
 * - 名人彩蛋：穿越成名人的概率 = 名人数量 / 城市人口
 * - 名人后续剧情由前端根据事迹生成
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const https = require('https')

// ─────── 年号表（硬编码，不依赖数据库新字段）───────
// key: "year|dynasty"，value: [eraName, eraStartYear]
// ─────── 年号表（Map，不依赖数据库新字段）───────
const ERA_TABLE = new Map([
  ['-2070|夏', ['禹', -2070]], ['-1978|夏', ['太康', -1978]], ['-1750|夏', ['孔甲', -1750]], ['-1600|夏', ['桀', -1600]],
  ['-1300|商', ['盘庚', -1300]], ['-1250|商', ['武丁', -1250]], ['-1075|商', ['纣', -1075]],
  ['-1045|西周', ['成王', -1045]], ['-1000|西周', ['康王', -1000]], ['-841|西周', ['共和', -841]], ['-771|西周', ['幽王', -771]],
  ['-770|春秋', ['平王', -770]], ['-650|春秋', ['齐桓公', -650]], ['-630|春秋', ['晋文公', -630]], ['-546|春秋', ['弭兵', -546]], ['-490|春秋', ['吴王', -490]],
  ['-453|战国', ['晋阳之战', -453]], ['-403|战国', ['威烈王', -403]], ['-386|战国', ['田齐', -386]], ['-356|战国', ['孝公', -356]], ['-342|战国', ['齐威王', -342]], ['-318|战国', ['五国伐秦', -318]], ['-284|战国', ['乐毅', -284]], ['-260|战国', ['长平之战', -260]], ['-230|战国', ['秦王', -230]], ['-221|战国', ['始皇', -221]],
  ['-221|秦', ['始皇', -221]], ['-214|秦', ['始皇', -221]], ['-213|秦', ['始皇', -221]], ['-210|秦', ['二世', -210]], ['-209|秦', ['二世', -210]], ['-207|秦', ['子婴', -207]],
  ['-202|西汉', ['高祖', -202]], ['-180|西汉', ['文帝', -180]], ['-141|西汉', ['建元', -140]], ['-119|西汉', ['元狩', -122]], ['-87|西汉', ['后元', -88]], ['9|西汉', ['始建国', 9]],
  ['25|东汉', ['建武', 25]], ['89|东汉', ['永元', 89]], ['184|东汉', ['中平', 184]], ['220|东汉', ['延康', 220]],
  ['220|三国', ['黄初', 220]], ['221|三国', ['章武', 221]], ['229|三国', ['黄龙', 229]], ['263|三国', ['景元', 260]], ['280|三国', ['咸宁', 275]],
  ['265|西晋', ['泰始', 265]], ['290|西晋', ['永熙', 290]], ['316|西晋', ['建兴', 313]],
  ['317|东晋', ['建武', 317]], ['383|东晋', ['太元', 376]], ['420|东晋', ['元熙', 419]],
  ['420|南北朝', ['永初', 420]], ['439|南北朝', ['太延', 435]], ['493|南北朝', ['太和', 477]], ['523|南北朝', ['正光', 520]], ['548|南北朝', ['太清', 547]], ['577|南北朝', ['建德', 572]],
  ['589|隋', ['开皇', 581]],
  ['618|唐', ['武德', 618]], ['626|唐', ['贞观', 627]], ['690|唐', ['天授', 690]], ['713|唐', ['开元', 713]], ['755|唐', ['天宝', 742]], ['875|唐', ['乾符', 874]], ['907|唐', ['天祐', 904]],
  ['907|五代十国', ['开平', 907]], ['923|五代十国', ['同光', 923]], ['936|五代十国', ['天福', 936]], ['947|五代十国', ['天福', 947]], ['951|五代十国', ['广顺', 951]],
  ['960|北宋', ['建隆', 960]], ['1005|北宋', ['景德', 1004]], ['1069|北宋', ['熙宁', 1068]], ['1127|北宋', ['靖康', 1126]],
  ['1127|南宋', ['建炎', 1127]], ['1141|南宋', ['绍兴', 1131]], ['1234|南宋', ['端平', 1234]], ['1279|南宋', ['祥兴', 1278]],
  ['1271|元', ['至元', 1264]], ['1280|元', ['至元', 1264]], ['1344|元', ['至正', 1341]], ['1368|元', ['至正', 1341]],
  ['1368|明', ['洪武', 1368]], ['1420|明', ['永乐', 1403]], ['1449|明', ['正统', 1436]], ['1572|明', ['万历', 1573]], ['1644|明', ['崇祯', 1628]],
  ['1644|清', ['顺治', 1644]], ['1689|清', ['康熙', 1662]], ['1759|清', ['乾隆', 1736]], ['1840|清', ['道光', 1821]], ['1898|清', ['光绪', 1875]], ['1912|清', ['宣统', 1909]],
  ['1912|中华民国', ['民国', 1912]], ['1928|中华民国', ['民国', 1912]], ['1937|中华民国', ['民国', 1912]], ['1949|中华民国', ['民国', 1912]],
])

function getEraInfo(year, dynasty) {
  const v = ERA_TABLE.get(String(year) + '|' + dynasty)
  if (!v) return null
  return { name: v[0], start: v[1] }
}

function toCN(n) {
  const YN = ['零','一','二','三','四','五','六','七','八','九']
  if (n < 10) return YN[n]
  if (n < 20) return '十' + (n > 10 ? YN[n-10] : '')
  if (n < 100) { const t = Math.floor(n/10), u = n%10; return (t>1 ? YN[t] : '') + '十' + (u>0 ? YN[u] : '') }
  if (n < 1000) { const h = Math.floor(n/100), r = n%100; return YN[h] + '百' + (r>0 ? toCN(r) : '') }
  return String(n)
}

// ─────── DeepSeek API ───────
const DS_API_KEY = process.env.DS_API_KEY
const DS_MODEL = 'deepseek-v4-flash'

function callDeepSeek(systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: DS_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 200,
      temperature: 0.8,
    })
    const req = https.request({
      hostname: 'api.deepseek.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + DS_API_KEY,
      },
      timeout: 30000,
    }, res => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.log('AI HTTP错误:', res.statusCode, body.substring(0, 200))
          reject(new Error(`AI服务暂不可用 (${res.statusCode})`))
          return
        }
        try {
          resolve(JSON.parse(body))
        } catch (e) {
          console.log('AI JSON解析失败:', body.substring(0, 200))
          reject(new Error('AI响应格式异常'))
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('AI响应超时')) })
    req.write(data)
    req.end()
  })
}

/**
 * 从加权数组中按权重选一项
 */
function weightedSelect(items, weightKey) {
  const total = items.reduce((s, x) => s + Math.max(0, x[weightKey]), 0)
  if (total <= 0) return null
  let r = Math.random() * total
  for (const x of items) {
    r -= Math.max(0, x[weightKey])
    if (r <= 0) return x
  }
  return items[items.length - 1]
}

/**
 * 找离 targetYear 最近的 era_meta 记录
 * 排除中华人民共和国，只到民国
 * 优先尝试精确匹配，再试过去和未来
 */
async function findNearestEraMeta(targetYear) {
  // 排除中华人民共和国
  const excludePRC = { dynasty: _.neq('中华人民共和国') }
  
  // 先试精确匹配
  const exact = await db.collection('era_meta')
    .where({ year: _.eq(targetYear), ...excludePRC })
    .get()
  if (exact.data && exact.data.length > 0) {
    return exact.data[0]
  }

  const past = await db.collection('era_meta')
    .where({ year: _.lt(targetYear), ...excludePRC })
    .orderBy('year', 'desc')
    .limit(1)
    .get()
  const future = await db.collection('era_meta')
    .where({ year: _.gt(targetYear), ...excludePRC })
    .orderBy('year', 'asc')
    .limit(1)
    .get()
  const p = past.data[0]
  const f = future.data[0]
  if (!p && !f) return null
  if (!p) return f
  if (!f) return p
  const pDelta = targetYear - p.year
  const fDelta = f.year - targetYear
  // delta 相等时选过去的（不穿越到未来）
  return pDelta <= fDelta ? p : f
}

/**
 * 用 AI 生成穿越身份名字（v0.6.6：移除名人彩蛋，避免与排行榜冲突）
 * 玩家永远不直接成为历史名人——名人只在排行榜里作为"够榜目标"存在
 */
async function generateName({ targetYear, selectedCity, figures, eraMeta, isMale, socialClass }) {
  // v0.6.6 移除名人彩蛋：直接用 AI 生成平民名字
  // 原因：玩家穿越成"华佗"会和排行榜"华佗"数据冲突，不如让名人只在榜上做参考

  // 普通穿越者，用 AI 生成名字
  const dynasty = eraMeta.dynasty || '未知'
  const emperor = eraMeta.emperor || '未知'
  const eraLabel = eraMeta.eraLabel || ''
  const surnames = eraMeta.surnames || ['无']
  const surnamePool = surnames.join('、')

  const systemPrompt = '你是一位精通中国历代取名文化和职业体系的历史学者。根据用户给出的时代、地点、阶层，生成一个符合时代特征和历史背景的平民姓名及其适合的职业。回复格式：姓名|职业。只回复格式内容，不要任何解释、标点或多余文字。'

  const userPrompt = [
    `时代：${dynasty}（${eraLabel}），在位君主：${emperor}`,
    `年份：${targetYear}年`,
    `城市：${selectedCity.city}`,
    `性别：${isMale ? '男' : '女'}`,
    socialClass ? `社会阶层：${socialClass}` : '',
    `姓氏来源：${surnamePool}`,
    // v0.6.6 移除"参考名人"行——避免 AI 借鉴名人的名字
    `要求：生成1个${isMale ? '男性' : '女性'}名字（姓+名，名可为1-2字）及1个适合该时代、该性别、该阶层的职业。职业需真实历史存在（如农夫、织工、木匠、铁匠、陶工、渔夫、猎户、脚夫、伙夫、裁缝、军户、货郎、茶役、医工、文书等），不得使用现代职业。回复格式：姓名|职业。例如：张三|农夫`,
  ].filter(Boolean).join('\n')

  try {
    const reply = await callDeepSeek(systemPrompt, userPrompt)
    const content = reply?.choices?.[0]?.message?.content?.trim() || ''
    console.log('AI原始返回:', content)
    // 解析"姓名|职业"格式（也支持中文逗号）
    const parts = content.split(/[|，,]/).map(s => s.trim().replace(/[「」""''。，！？\s]/g, ''))
    console.log('解析后parts:', JSON.stringify(parts))
    const rawName = parts[0] || ''
    const aiOccupation = parts.length > 1 && parts[1] ? parts[1] : null
    const cleanName = rawName.replace(/[「」""''。，！？\s]/g, '').trim()
    if (cleanName && cleanName.length >= 2 && cleanName.length <= 6) {
      return { name: cleanName, isCelebrity: false, figure: null, occupation: aiOccupation }
    }
  } catch (e) {
    console.log('AI名字生成异常:', e.message)
    // AI 失败时降级到本地组合
  }

  // 降级方案（AI失败时）：从姓氏池随机+性别对应常用名
  const fallbackGiven = isMale
    ? ['安','邦','昌','超','德','刚','光','国','浩','和','宏','华','辉','建','杰','金','俊','凯','康','立','亮','林','明','平','强','庆','荣','山','胜','世','顺','泰','天','伟','文','武','贤','祥','新','信','兴','旭','义','毅','永','勇','宇','云','泽','振','志','忠','仲','子','宗']
    : ['碧','春','翠','丹','芳','凤','芙','桂','红','花','华','惠','慧','佳','娟','兰','莲','琳','玲','柳','梅','美','敏','萍','琪','巧','秋','柔','如','蕊','珊','淑','素','婷','婉','霞','香','秀','燕','瑶','英','莹','玉','媛','月','云','珍','芝','珠','丽']
  const s = surnames[Math.floor(Math.random() * surnames.length)]
  const pool = fallbackGiven
  const givenLen = Math.random() < 0.4 ? 1 : 2
  let given = ''
  for (let i = 0; i < givenLen; i++) {
    given += pool[Math.floor(Math.random() * pool.length)]
  }
  return { name: s + given, isCelebrity: false, figure: null, occupation: null }
}

async function _generateIdentity(event, context) {
  try {
    // ── 池模式：只返回所有唯一朝代·城市对 ──
    // 排除中华人民共和国，只到民国
    if (event && event.mode === 'pool') {
      const [eraRes, cityRes] = await Promise.all([
        db.collection('era_meta').where({ dynasty: _.neq('中华人民共和国') }).limit(200).get(),
        db.collection('era_cities').where({ year: _.lt(1949) }).limit(1000).get(),
      ])
      const metas = eraRes.data.sort((a, b) => (b.year || 0) - (a.year || 0))
      const getDynasty = (y) => {
        for (const m of metas) {
          if (m.year != null && m.year <= y) return m.dynasty || ''
        }
        return ''
      }
      const seen = new Set()
      const all = []
      for (const r of cityRes.data) {
        const dyn = getDynasty(r.year)
        const key = dyn + '·' + (r.city || '')
        if (!key.includes('·') || seen.has(key)) continue
        seen.add(key)
        all.push(key)
      }
      return { success: true, poolMode: true, pool: all }
    }

    // ──────────── 第1遍：加载所有城市数据 ────────────
    // 只加载1949年以前的数据（排除中华人民共和国）
    const allCities = await db.collection('era_cities')
      .where({ year: _.lt(1949) })
      .field({ year: true, city: true, popMillion: true, figures: true, cityDesc: true, source: true })
      .limit(1000)
      .get()

    const records = allCities.data
    if (!records || records.length < 2) {
      return { success: false, error: '城市数据不足' }
    }

    // 按城市分组排序
    const groupMap = new Map()
    for (const r of records) {
      const { year, city, popMillion } = r
      if (!city || popMillion == null || popMillion <= 0) continue
      if (!groupMap.has(city)) groupMap.set(city, [])
      groupMap.get(city).push({ year: Number(year), popMillion: Number(popMillion), raw: r })
    }

    const groupSegments = []
    let totalWeight = 0

    for (const [city, entries] of groupMap.entries()) {
      entries.sort((a, b) => a.year - b.year)
      for (let i = 1; i < entries.length; i++) {
        const prev = entries[i - 1]
        const cur = entries[i]
        const yearSpan = cur.year - prev.year
        if (yearSpan <= 0) continue
        const segmentWeight = yearSpan * prev.popMillion
        totalWeight += segmentWeight
        groupSegments.push({
          city,
          yearFrom: prev.year,
          yearTo: cur.year,
          popMillion: prev.popMillion,
          weight: segmentWeight,
          data: prev.raw,
        })
      }
    }

    if (totalWeight <= 0) {
      return { success: false, error: '所有权重为零' }
    }

    // ──────────── 第2遍：加权随机选中一个段 ────────────
    let r = Math.random() * totalWeight
    let selected = null
    for (const seg of groupSegments) {
      r -= seg.weight
      if (r <= 0) { selected = seg; break }
    }
    if (!selected) selected = groupSegments[groupSegments.length - 1]

    // 段内均匀随机选具体年份
    const targetYear = Math.floor(selected.yearFrom + Math.random() * (selected.yearTo - selected.yearFrom))

    // ──────────── 获取时代元数据 ────────────
    const eraMeta = await findNearestEraMeta(targetYear)
    const meta = eraMeta || {
      dynasty: '未知', emperor: '未知', eraLabel: '未知',
      maleRatio: 0.5, maleLiteracy: 0, femaleLiteracy: 0,
      surnames: ['无'],
    }

    // ──────────── 生成性别 ────────────
    var isMale
    if (event.gender === '男') {
      isMale = true
    } else if (event.gender === '女') {
      isMale = false
    } else {
      isMale = Math.random() < Number(meta.maleRatio || 0.5)
    }

    // ──────────── 获取年龄分布（精确匹配 → 最近年份降级） ────────────
    let ageDistResult = await db.collection('era_age_dist')
      .where({ year: _.eq(targetYear) })
      .get()
    let ageDist = ageDistResult.data
    // 精确匹配不到时，找最接近的年份
    if (!ageDist || ageDist.length === 0) {
      const past = await db.collection('era_age_dist')
        .where({ year: _.lte(targetYear) })
        .orderBy('year', 'desc')
        .limit(1)
        .get()
      const future = await db.collection('era_age_dist')
        .where({ year: _.gte(targetYear) })
        .orderBy('year', 'asc')
        .limit(1)
        .get()
      const p = past.data[0]
      const f = future.data[0]
      let nearestYear = null
      if (p && f) {
        nearestYear = (targetYear - p.year) <= (f.year - targetYear) ? p.year : f.year
      } else if (p) {
        nearestYear = p.year
      } else if (f) {
        nearestYear = f.year
      }
      if (nearestYear !== null) {
        const all = await db.collection('era_age_dist')
          .where({ year: _.eq(nearestYear) })
          .get()
        ageDist = all.data || []
      } else {
        ageDist = []
      }
    }
    let age = -1
    if (ageDist && ageDist.length > 0) {
      const chosen = weightedSelect(ageDist, 'weight')
      age = chosen ? Number(chosen.age) : -1
    }
    // 降级（没有年龄数据时的硬编码金字塔）
    if (age < 0) {
      const a = Math.random()
      if (a < 0.4) age = Math.floor(Math.random() * 15)
      else if (a < 0.65) age = 15 + Math.floor(Math.random() * 15)
      else if (a < 0.83) age = 30 + Math.floor(Math.random() * 15)
      else if (a < 0.94) age = 45 + Math.floor(Math.random() * 15)
      else age = 60 + Math.floor(Math.random() * 40)
    }

    // ──────────── 获取社会阶层 + 职业（精确匹配 → 最近年份降级） ────────────
    let structResult = await db.collection('social_structure')
      .where({ year: _.eq(targetYear) })
      .get()
    let structs = structResult.data
    // 精确匹配不到时，找最接近的年份
    if (!structs || structs.length === 0) {
      // 先找最接近年份
      const past = await db.collection('social_structure')
        .where({ year: _.lte(targetYear), year: _.exists(true) })
        .orderBy('year', 'desc')
        .limit(1)
        .get()
      const future = await db.collection('social_structure')
        .where({ year: _.gte(targetYear), year: _.exists(true) })
        .orderBy('year', 'asc')
        .limit(1)
        .get()
      const p = past.data[0]
      const f = future.data[0]
      let nearestYear = null
      if (p && f) {
        nearestYear = (targetYear - p.year) <= (f.year - targetYear) ? p.year : f.year
      } else if (p) {
        nearestYear = p.year
      } else if (f) {
        nearestYear = f.year
      }
      if (nearestYear !== null) {
        // 用找到的年份查全部记录
        const all = await db.collection('social_structure')
          .where({ year: _.eq(nearestYear) })
          .get()
        structs = all.data || []
      }
    }
    let socialClass = null
    let occupation = null
    if (structs && structs.length > 0) {
      // 按人口比例选阶层
      const chosen = weightedSelect(structs, 'weight')
      if (chosen) {
        socialClass = chosen.class
      }
    }
    // 未成年人无职业（稍后AI生成后会覆写硬连接，这里先占位）
    if (age < 12) {
      occupation = null
    }

    // ──────────── AI 生成名字（含名人彩蛋） ────────────
    const figures = selected.data?.figures || []
    const nameResult = await generateName({
      targetYear,
      selectedCity: selected,
      figures,
      eraMeta: meta,
      isMale,
      socialClass,
    })
    // AI返回的职业覆盖之前的占位（如果AI返回了的话）
    if (nameResult.occupation) {
      occupation = nameResult.occupation
    } else if (age >= 12 && socialClass && meta.socialStructure && meta.socialStructure[socialClass]) {
      // AI未返回职业时的兜底：从数据库jobs随机选
      const jobs = meta.socialStructure[socialClass].jobs || []
      if (jobs.length > 0) {
        occupation = jobs[Math.floor(Math.random() * jobs.length)]
      }
    }
    // 最终兜底：如果还是没有职业，从通用池随机选一个
    if (age >= 12 && !occupation) {
      var genericJobs = ['农夫', '织工', '木匠', '铁匠', '陶工', '渔夫', '猎户', '脚夫', '伙夫', '裁缝', '医工', '货郎']
      occupation = genericJobs[Math.floor(Math.random() * genericJobs.length)]
    }
    // 未成年人最后再确认一次
    if (age < 12) occupation = null

    // ──────────── 计算识字率 ────────────
    const maleLit = Number(meta.maleLiteracy || 0)
    const femaleLit = Number(meta.femaleLiteracy || 0)
    const literacy = isMale ? maleLit : femaleLit
    const canRead = Math.random() < literacy

    // ──────────── 计算年号显示 ────────────
    let eraDisplay = ''
    if (meta.dynasty === '中华人民共和国') {
      eraDisplay = '公元' + targetYear + '年'
    } else {
      const era = getEraInfo(meta.year, meta.dynasty)
      if (era && targetYear >= -140) {
        const offset = targetYear - era.start + 1
        eraDisplay = offset <= 1 ? era.name + '元年' : era.name + toCN(offset) + '年'
      }
    }

    return {
      success: true,
      identity: {
        year: targetYear,
        city: selected.city,
        dynasty: meta.dynasty || '未知',
        emperor: meta.emperor || '未知',
        eraLabel: meta.eraLabel || '未知',
        eraDisplay,

        name: nameResult.name,
        gender: isMale ? '男' : '女',
        age,
        canRead,
        socialClass: socialClass || '庶人',
        occupation,

        isCelebrity: nameResult.isCelebrity,
        figure: nameResult.figure,

        popMillion: selected.popMillion,
        cityDesc: selected.data?.cityDesc || '',
        cityFigures: figures,
        source: selected.data?.source || '',
      },
      debug: {
        totalWeight,
        segmentCount: groupSegments.length,
        cityCount: groupMap.size,
        recordCount: records.length,
        randomR: r + (selected?.weight || 0), // 恢复原始随机值
      },
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// ─────── 叙事模式（模式二） ───────
function callDeepSeekStory(messages) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'deepseek-v4-flash',
      messages,
      max_tokens: 1024,
    })
    const req = https.request({
      hostname: 'api.deepseek.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.DS_API_KEY,
      },
      timeout: 30000,
    }, res => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        if (res.statusCode !== 200) { reject(new Error('AI服务暂不可用')); return }
        try { resolve(JSON.parse(body)) }
        catch (e) { reject(new Error('AI响应格式异常')) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('AI响应超时')) })
    req.write(data)
    req.end()
  })
}

function buildStoryPrompt(identity, items) {
  const itemDesc = items.map(i => i.name + '(' + i.icon + ')').join('、')
  return `你是穿越日记的游戏主持人。玩家穿越到了${identity.dynasty}的${identity.city}，身份是${identity.name}，${identity.age}岁${identity.gender}子，${identity.occupation || '无业'}。玩家从现代带来了三件物品：${itemDesc}。请根据当前场景生成一段叙事（60-120字），并在末尾给出3个选项。用 JSON 格式回复：{"narrative":"叙事文字","options":[{"label":"选项A","desc":"简短说明"},{"label":"选项B","desc":"简短说明"},{"label":"选项C","desc":"简短说明"}]}`
}

exports.main = async (rawEvent, context) => {
  // 防御性：有时 event 是字符串（云函数从网关转发）
  let event = rawEvent
  if (typeof event === 'string') {
    try { event = JSON.parse(event) } catch (e) { return { success: false, error: 'event 解析失败: ' + e.message } }
  }
  event = event || {}
  console.log('[main] event keys:', Object.keys(event), 'mode:', event.mode)

  // 叙事模式
  if (event.mode === 'story') {
    const { identity, items, history } = event
    if (!identity || !identity.name) return { success: false, error: '缺少身份信息' }

    const messages = [{ role: 'system', content: buildStoryPrompt(identity, items || []) }]
    if (history && history.length > 0) {
      for (const msg of history) messages.push({ role: msg.role, content: msg.content })
    } else {
      messages.push({ role: 'user', content: '我刚刚穿越到这里，眼前是什么景象？' })
    }

    try {
      const aiRes = await callDeepSeekStory(messages)
      const reply = aiRes.choices?.[0]?.message?.content || ''
      if (!reply) return { success: false, error: 'AI 返回为空' }

      const jsonMatch = reply.match(/\{[\s\S]*"narrative"[\s\S]*"options"[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          return { success: true, narrative: parsed.narrative, options: parsed.options }
        } catch (e) { /* fall through */ }
      }
      return { success: true, narrative: reply, options: [] }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ─────── 身份生成模式（原有逻辑） ───────
  return _generateIdentity(event, {})
}
