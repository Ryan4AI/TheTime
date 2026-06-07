// Game scene — 穿越后的主游戏场景
// AI 驱动叙事：调用 ai_narrate 云函数 → 显示叙事 + 选项 → 玩家选择 → 循环
// 模式：init() / render(ctx) / onTouch(x,y,type) — 与项目其他场景保持一致

const ui = require('../engine/ui')
const { COLORS, getSystemInfo, drawBackground, drawText, drawCenteredText, drawTextInRect, hitTest, roundRect } = ui

// ─────── 状态 ───────
var state = null
var layout = null
var currentItems = []
var narrative = ''           // 当前显示的叙事文本
var displayedChars = 0        // 打字机效果：已显示字符数
var displayStartTime = 0     // 打字开始时间
var options = []             // 当前选项
var optionsAppearTime = 0    // 选项出现时间
var freeInputActive = false  // 自由输入模式
var freeInputText = ''       // 自由输入文本
var loading = false          // AI 调用中
var loadingStart = 0
var errorMsg = ''
var narrativeHistory = []    // {role, content}
var alive = true             // 死亡标记
var fadeOut = null           // 淡出动画
var monthChanged = false     // 月份变化（用于显示特殊提示）
var newEvent = null          // 新事件
var itemDetail = null        // 物品详情浮窗（点击物品后弹出）
var bgImage = null           // 当前背景图（云函数返回 URL）
var bgImageLoading = false   // 是否在加载

// ─────── AI 调试浮窗（v0.1.61）────
var debugLog = []            // 最近 N 轮完整 input/result
var debugOpen = false        // 浮窗展开/折叠
var debugScroll = 0          // 浮窗内滚动偏移
const DEBUG_MAX_ROUNDS = 3   // 保留最近 3 轮
// v0.1.63: 小游戏没有 move 事件，改用 ▲▼ 箭头按钮滚动
var bgImgEl = null           // <image> 元素缓存

// ─── 朝代风格表（先生拍板：每朝代不同风格）───
const STYLE_BY_DYNASTY = {
  '夏':  { style: '商周青铜器纹样',   palette: '青铜绿朱砂',  elements: '祭祀甲骨' },
  '商':  { style: '商周青铜器纹样',   palette: '青铜绿朱砂',  elements: '祭祀甲骨' },
  '周':  { style: '春秋战国帛画',     palette: '墨黑朱砂',    elements: '车马礼器' },
  '春秋':{ style: '春秋战国帛画',     palette: '墨黑朱砂',    elements: '战车礼器' },
  '战国':{ style: '春秋战国帛画',     palette: '墨黑朱砂',    elements: '战车礼器' },
  '秦':  { style: '秦汉画像石',       palette: '黑朱砂',      elements: '兵马俑长城' },
  '汉':  { style: '汉代画像石',       palette: '黑朱砂',      elements: '车马宴乐' },
  '三国':{ style: '工笔重彩',         palette: '绛红金',      elements: '战旗兵器' },
  '晋':  { style: '魏晋山水',         palette: '青绿',        elements: '竹林隐士' },
  '南北朝':{ style: '敦煌壁画',       palette: '石青赭石',    elements: '飞天佛像' },
  '隋':  { style: '初唐工笔',         palette: '金朱砂青绿',  elements: '宫阙仕女' },
  '唐':  { style: '唐代工笔重彩',     palette: '金朱砂青绿',  elements: '仕女宫阙' },
  '五代':{ style: '五代山水',         palette: '水墨青绿',    elements: '山林隐士' },
  '宋':  { style: '宋代山水',         palette: '水墨青绿',    elements: '市井勾栏' },
  '元':  { style: '元代水墨',         palette: '水墨留白',    elements: '草原马' },
  '明':  { style: '明代写意',         palette: '水墨',        elements: '市井园林' },
  '清':  { style: '清代工笔',         palette: '淡彩',        elements: '宫廷市井' },
  '民国':{ style: '老上海水彩',       palette: '灰暖黄',      elements: '洋楼旗袍' },
}

function getStyleForDynasty(dynasty) {
  if (!dynasty) return STYLE_BY_DYNASTY['宋']  // 兜底
  for (const [k, v] of Object.entries(STYLE_BY_DYNASTY)) {
    if (dynasty.includes(k)) return v
  }
  return STYLE_BY_DYNASTY['宋']
}

const TYPEWRITE_SPEED = 25   // 每字符毫秒
const MAX_NARRATIVE_CHARS = 600  // 单次叙事最大字符数

// ─────── 入口 ───────
module.exports = {
  init(items, identity) {
    const id = identity || {}
    items = items || []

    state = {
      life_number: id.life_number || 1,
      name: id.name || '无名',
      gender: id.gender || '男',
      age: id.age || 20,
      occupation: id.occupation || '庶民',
      // P1.4 字段名对齐 generate_identity 实际返回（camelCase）
      socialClass: id.socialClass || id.social_class || '庶人',
      dynasty: id.dynasty || '',
      eraDisplay: id.eraDisplay || id.eraLabel || '',
      city: id.city || id.residence || id.city_name || '某地',  // v0.1.70 多兜底 residence
      year: typeof id.year === 'number' ? id.year : parseInt(id.year) || 0,  // v0.1.70 强制转数字
      month: 1,
      round: 0,
      health: 100,
      coin: 1000,
      items: items.map(i => ({ ...i })),
      legacy: '',
      alive: true,
    }

    currentItems = items
    narrative = ''
    displayedChars = 0
    displayStartTime = 0
    options = []
    optionsAppearTime = 0
    freeInputActive = false
    freeInputText = ''
    loading = false
    errorMsg = ''
    narrativeHistory = []
    alive = true
    fadeOut = null
    monthChanged = false
    newEvent = null
    itemDetail = null

    initLayout()

    // 首次调用 AI
    callAI('初始回合')

    module.exports.autoNext = null
  },

  render,

  onTouch(x, y, type) {
    return handleTouch(x, y, type)
  },

  autoNext: null,
}

// ─────── 初始化布局 ───────
function initLayout() {
  const sys = getSystemInfo()
  const windowWidth = sys.windowWidth
  const windowHeight = sys.windowHeight

  // iOS 灵动岛/刘海安全区
  const safeTop = (sys.safeArea && sys.safeArea.top) || 0
  const topOffset = Math.max(safeTop, 0)

  // v0.1.71 重做：画区按"是否加载完成"动态伸缩
  // 顶栏(52) → 文字面板(自适应 narrative 行数) → 选项(3×40+gap 4+输入 32 = 160) → 物品栏(64)
  const topBarH = 52
  const itemBarH = 64
  const optH = 40
  const optGap = 4
  const freeInputH = 32
  const optBlockH = 3 * optH + 2 * optGap + freeInputH + 12  // 3 选项 + 自由输入 + 间隔

  // 画区：只在图片加载完成时占 130 高（按宽 3:2）；否则让位给文字
  const sceneW = windowWidth - 14 * 2
  const sceneH = Math.min(130, Math.max(80, Math.floor(sceneW * 2 / 3)))

  // 文字区：根据 narrative 实际行数计算（不再封顶）
  const availableH = windowHeight - topOffset - topBarH - itemBarH
  const lineHeight = 22
  const fontSize = 15
  const maxW = windowWidth - 14 * 2 - 24  // 文字面板内边距
  const narrativeLines = narrative ? Math.ceil(narrative.length * fontSize / maxW) : 4  // 估算行数
  const lines = narrative ? narrative.split('\n') : []
  const realLines = lines.length || narrativeLines
  // 文字面板 = 实际行数 × 行高 + 内边距
  let textH = realLines * lineHeight + 24
  // v0.1.71: 画区是否占位 = 当前是否加载完成且有图
  const sceneVisible = !!bgImgEl && bgImgEl.complete && !loading
  if (sceneVisible) {
    textH = availableH - sceneH - optBlockH - 12
  } else {
    // 文字占满剩余空间
    textH = availableH - optBlockH - 12
  }
  const finalTextH = Math.max(100, textH)

  layout = {
    windowW: windowWidth,
    windowH: windowHeight,
    safeTop: topOffset,
    padding: 14,
    topBarH: topBarH,
    itemBarH: itemBarH,
    sceneY: topOffset + topBarH + 4,
    sceneH: sceneVisible ? sceneH : 0,
    sceneVisible: sceneVisible,
    textY: topOffset + topBarH + 4 + (sceneVisible ? sceneH : 0) + 8,
    textH: finalTextH,
    optionY: topOffset + topBarH + 4 + (sceneVisible ? sceneH : 0) + 8 + finalTextH + 6,
    optionH: optH,
    optionGap: optGap,
    freeInputH: freeInputH,
    itemBarY: windowHeight - itemBarH,
  }
}

// ─────── 调用 ai_narrate 云函数 ───────
// v0.1.66: 不再传 action（init/continue 区分由云函数看 history 长度判断）
function callAI(userInput) {
  loading = true
  loadingStart = Date.now()
  errorMsg = ''

  // v0.1.62: 动作类型（init 初始 / continue 继续 / retry 重试）
  // 之前 216 行直接用 `action` 变量导致 ReferenceError，callAI 整段崩
  // 改成从 narrativeHistory 长度推断
  const action = (narrativeHistory && narrativeHistory.length > 0) ? 'continue' : 'init'

  // v0.1.63 (D005): 重试是前端兜底，__retry__ 是内部信号
  // 不入对话流，不当 userPrompt，云函数端会识别并丢弃
  const isRetry = userInput === '__retry__'
  const realInput = isRetry ? '' : userInput

  const stateData = {
    life_number: state.life_number,
    name: state.name,
    gender: state.gender,
    age: state.age,
    occupation: state.occupation,
    // P1.4 字段名对齐
    socialClass: state.socialClass,
    dynasty: state.dynasty,
    eraDisplay: state.eraDisplay,
    city: state.city,
    year: state.year,
    month: state.month,
    round: state.round,
    health: state.health,
    coin: state.coin,
    items: state.items.map(i => ({ id: i.id, name: i.name, desc: i.desc })),
    legacy: state.legacy,
    alive: state.alive,
  }

  const data = {
    state: stateData,
    input: realInput,
    is_retry: isRetry,  // v0.1.63 (D005): 重试标记，云函数据此丢弃
    history: narrativeHistory.slice(-12),
  }

  // ── 调试：记录完整 input ──
  debugLog.push({
    round: state.round,
    action: action,
    input: userInput,
    data: JSON.parse(JSON.stringify(data)),  // 深拷贝
    result: null,
    resultError: null,
    ts: Date.now(),
  })
  if (debugLog.length > DEBUG_MAX_ROUNDS) debugLog.shift()

  if (typeof wx !== 'undefined' && wx.cloud && wx.cloud.callFunction) {
    wx.cloud.callFunction({
      name: 'ai_narrate',
      data,
      success: (res) => {
        const result = (res && res.result) || {}
        // ── 调试：记录完整 result + AI 接口完整入参（v0.1.62）──
        if (debugLog.length > 0) {
          const last = debugLog[debugLog.length - 1]
          last.result = result
          if (result.debug) {
            last.system_prompt = result.debug.system_prompt
            last.user_prompt = result.debug.user_prompt
            last.messages_to_ai = result.debug.messages || null  // v0.1.64: 完整 messages 数组
            last.raw_response = result.debug.raw_response
            last.all_branches = result.branches || null
          }
        }
        handleAIResponse(result, action, userInput)
      },
      fail: (err) => {
        // ── 调试：记录失败信息 ──
        if (debugLog.length > 0) {
          debugLog[debugLog.length - 1].resultError = (err && (err.errMsg || err.message)) || String(err)
        }
        loading = false
        errorMsg = '史官落笔卡壳了——网络断了，点此重试。'
        options = [{ label: '重试', key: '__retry__' }]
        optionsAppearTime = Date.now() + 300
      },
    })
  } else {
    // ❌ 不再提供 mock fallback — 之前这里会硬塞"打量四周/起身查看/躺一会儿"
    // 造成真机小游戏云开发不可用时，玩家看到永远不变的伪选项。
    // 改为明确报错，让玩家知道是环境问题而不是游戏内容。
    loading = false
    errorMsg = '史官落笔卡壳了——云开发不可用，点此重试。'
    options = [{ label: '重试', key: '__retry__' }]
    optionsAppearTime = Date.now() + 300
  }
}

// ─────── 处理 AI 返回 ───────
function handleAIResponse(result, action, userInput) {
  loading = false

  if (!result || result.error) {
    // 显式错误：玩家看得懂的史官风格
    errorMsg = `史官落笔卡壳了——${(result && result.error) || 'AI服务暂不可用'}。点此重试。`
    options = [{ label: '重试', key: '__retry__' }]
    optionsAppearTime = Date.now() + 300
    return
  }

  const { branch, state: newState, month_changed, event } = result
  if (!branch || !branch.content) {
    errorMsg = '史官落笔卡壳了——这一页是空白。点此重试。'
    options = [{ label: '重试', key: '__retry__' }]
    optionsAppearTime = Date.now() + 300
    return
  }

  // 分支 options 缺失或为空：明确报错，不补默认
  if (!Array.isArray(branch.options) || branch.options.length === 0) {
    errorMsg = '史官落笔卡壳了——这一段选项没写出来。点此重试。'
    options = [{ label: '重试', key: '__retry__' }]
    optionsAppearTime = Date.now() + 300
    return
  }

  // 1. 应用 AI 返回的 state 更新
  if (newState) {
    if (newState.age) state.age = newState.age
    if (newState.health !== undefined) state.health = newState.health
    if (newState.coin !== undefined) state.coin = newState.coin
    if (newState.month) state.month = newState.month
    if (newState.year) state.year = newState.year
    if (newState.round !== undefined) state.round = newState.round
  }

  // 2. 应用 patch — 用 !== undefined 不用真值判断（修 0 falsy bug）
  const patch = branch.patch || {}
  if (patch.coin !== undefined) state.coin = Math.max(0, state.coin + (patch.coin || 0))
  if (patch.health !== undefined) state.health = Math.max(0, Math.min(100, state.health + (patch.health || 0)))

  // 物品状态变化 — v10（D-1 改造）
  // 改：AI 用物品中文名（"茶包"）当 key，不再用 id
  // 改：数字 = 减 durability（0 时自动删物品）
  // 改：字符串 = 拼接到 desc 后缀
  if (patch.items) {
    for (const [itemKey, change] of Object.entries(patch.items)) {
      // 按中文 name 匹配（兼容旧的"lost"和字符串 desc 模式）
      const it = state.items.find(i => i.name === itemKey || i.id === itemKey)
      if (it) {
        if (typeof change === 'number') {
          // 数字 = 减 durability
          it.durability = (it.durability == null ? 100 : it.durability) + change
          if (it.durability <= 0) {
            // durability 减到 0 → 物品消失
            state.items = state.items.filter(x => x.id !== it.id)
            currentItems = currentItems.filter(x => x.id !== it.id)
          } else {
            // 更新 desc 显示当前 durability
            it.desc = it.name + '（耐久 ' + it.durability + '）'
            const ci = currentItems.find(x => x.id === it.id)
            if (ci) ci.desc = it.desc
          }
        } else if (change === 'lost') {
          // 兼容旧的"lost"字符串
          state.items = state.items.filter(x => x.id !== it.id)
          currentItems = currentItems.filter(x => x.id !== it.id)
        } else {
          // 字符串 = 拼接到 desc 后缀（兼容旧 desc 模式）
          it.desc = it.name + '（' + change + '）'
          const ci = currentItems.find(x => x.id === it.id)
          if (ci) ci.desc = it.desc
        }
      }
    }
  }

  // 3. 死亡判定
  if (state.health <= 0 || newState && newState.alive === false) {
    state.alive = false
    alive = false
  }

  // 4. 记录历史
  // v0.1.63 (D005): 重试是前端兜底，不是玩家真实意图
  // 不入 narrativeHistory，避免污染对话流
  narrativeHistory.push({ role: 'ai', content: branch.content })
  if (action === 'continue' && userInput && userInput !== '重试' && userInput !== '__retry__') {
    narrativeHistory.push({ role: 'user', content: userInput })
  }

  // 5. round 计数 +1（P1.6: AI 响应后递增）
  state.round = (state.round || 0) + 1

  // 5.5 异步加载背景图（不阻塞叙事显示）
  fetchBgImage(branch.content || '')

  // 6. 准备显示
  narrative = (branch.content || '').slice(0, MAX_NARRATIVE_CHARS)
  displayedChars = 0
  displayStartTime = Date.now()
  options = (branch.options || []).slice(0, 3).map(label => ({ label, key: label }))
  optionsAppearTime = displayStartTime + narrative.length * TYPEWRITE_SPEED + 300
  monthChanged = month_changed
  newEvent = event || null
}

// ─────── 渲染 ───────
function render(ctx) {
  if (!ctx || !layout) return

  // v0.1.66 流式布局：根据当前 narrative 长度动态算画区 + 文字面板高度
  adjustFluidLayout()

  // 淡出处理（死亡时）
  if (fadeOut) {
    const elapsed = Date.now() - fadeOut.start
    const p = Math.min(1, elapsed / fadeOut.duration)
    ctx.fillStyle = 'rgba(0,0,0,' + p + ')'
    ctx.fillRect(0, 0, layout.windowW, layout.windowH)
    if (p >= 1) {
      module.exports.autoNext = { scene: 'death', state: state }
      return
    }
  }

  // 1. 暗色古风背景
  drawBackground(ctx, layout.windowW, layout.windowH)

  // 1.5 生图背景（v0.1.63 拼贴·题跋版：画占 55% 上半屏，1.0 透明度 + 卷轴边框）
  drawBgImage(ctx)

  // 2. 顶部朱砂印（古卷风顶栏）
  drawSealTopBar(ctx)

  // 3. 月份变化提示（如有）
  if (monthChanged) {
    drawMonthNotice(ctx)
  }

  // 4. 叙事文字（题跋·下半屏，v0.1.63 改版）
  drawNarrative(ctx)

  // 5. 叙事滚动指示器
  if (narrative && Date.now() >= displayStartTime + 500) {
    drawScrollIndicator(ctx)
  }

  // 6. 选项按钮（竹简风格）
  if (Date.now() >= optionsAppearTime && options.length > 0) {
    drawOptions(ctx)
  }

  // 7. 自由输入按钮
  if (Date.now() >= optionsAppearTime && options.length > 0) {
    drawFreeInputButton(ctx)
  }

  // 8. 底部物品栏（极简）
  drawItemBar(ctx)

  // 9. 加载中
  if (loading) {
    drawLoading(ctx)
  }

  // 10. 错误提示
  if (errorMsg) {
    drawError(ctx)
  }

  // 11. 长按状态：玉牒浮窗
  if (!statusHidden || isLongPressing) {
    drawJadeTablet(ctx)
  }

  // 12. 物品详情浮窗（点击物品后弹出，点任何位置关闭）
  if (itemDetail) {
    drawItemDetail(ctx)
  }

  // 13. AI 调试浮窗（v0.1.61）—— 最高层级，最右上的小图标或全屏覆盖
  drawDebugPanel(ctx)
}

// ─────── 流式布局 v0.1.68 ───────
// 先生拍板的 3 层语义：
// 1. 文字面板按 displayedChars 实时延伸（打字中跟着字走）
// 2. 选项 + 自由输入打字完成后才淡入出现（不打扰阅读）
// 3. 物品栏钉在底部 64px（不参与流式布局）
function adjustFluidLayout() {
  if (!layout) return

  const topBarH = layout.topBarH
  const itemBarH = layout.itemBarH       // 钉死底部 64px
  // v0.1.67: 进一步缩小（按钮 38→36、间距 4→3、自由输入 28→24）
  // 从 152 减到 145，节省 7px 给叙事区
  const optBlockH = 145
  const safeTop = layout.safeTop || 0
  const availableH = layout.windowH - safeTop - topBarH - itemBarH

  const typingDone = narrative && displayedChars >= narrative.length
  const optReserveH = typingDone ? optBlockH : 0
  const optionGap = 3
  const lineHeight = 22
  const fontSize = 15
  const innerW = layout.windowW - layout.padding * 2 - 24
  const charPerLine = Math.max(8, Math.floor(innerW / fontSize))

  // 文字行数按 narrative 完整字符数算
  let lineCount = 2
  if (narrative) {
    const paras = narrative.split('\n')
    let total = 0
    for (const p of paras) total += Math.max(1, Math.ceil(p.length / charPerLine))
    lineCount = Math.max(total, Math.ceil(displayedChars / charPerLine), 2)
  }
  const textPadding = 16
  const neededTextH = lineCount * lineHeight + textPadding

  // v0.1.67 修复：画区总是显示（不依赖 typingDone）
  // 先生要"画板随文字展开"——所以图片加载好就显示
  const sceneImgReady = !!bgImgEl && bgImgEl.complete && bgImgEl.width > 0
  const showScene = sceneImgReady
  const sceneH = showScene ? 130 : 0  // 固定 130 高

  // 文字区高度 = 剩余 - 画区 - 选项块 - 间距
  let finalTextH = availableH - sceneH - optReserveH - optionGap - 12
  finalTextH = Math.max(100, finalTextH)  // 不限上限

  layout.sceneH = sceneH
  layout.sceneVisible = showScene
  layout.textY = safeTop + topBarH + 4 + sceneH + 8
  layout.textH = finalTextH
  // v0.1.67: 文字面板底部 + 6px 缓冲后再放选项（解决按钮紧贴文字面板的"下溢"感）
  layout.optionY = layout.textY + finalTextH + 6
  layout.optionFadeIn = typingDone ? 1 : 0
  layout.optionH = 36                       // v0.1.67: 38 → 36 缩 2px
  layout.optionGap = optionGap
  layout.itemBarY = layout.windowH - itemBarH
}

// ─────── 生图背景（v0.1.69：前端直连 Pollinations.ai，跳过云函数） ───────
// 朝代风格表（v0.1.62 起，p1: 简洁英文 prompt；p2: 水墨质感参数）
const PROMPT_BY_DYNASTY = {
  '宋':   { style: 'Song dynasty Chinese ink wash painting',      elements: 'markets, scholars, teahouses, riverside' },
  '元':   { style: 'Yuan dynasty Chinese ink landscape',          elements: 'grassland, horsemen, vast sky' },
  '明':   { style: 'Ming dynasty Chinese literati ink painting',  elements: 'gardens, scholars, calligraphy' },
  '清':   { style: 'Qing dynasty Chinese court painting',         elements: 'palace, scholars, calligraphy' },
  '唐':   { style: 'Tang dynasty Chinese gongbi heavy color',     elements: 'palace ladies, court, horses' },
  '汉':   { style: 'Han dynasty Chinese stone relief painting',   elements: 'carriage, banquet, warriors' },
  '秦':   { style: 'Qin dynasty Chinese painting',                elements: 'terracotta warriors, Great Wall' },
  '晋':   { style: 'Wei-Jin Chinese landscape',                   elements: 'bamboo forest, hermits' },
  '南北朝':{ style: 'Dunhuang mural painting',                    elements: 'flying apsaras, Buddha' },
  '隋':   { style: 'Early Tang gongbi',                           elements: 'palace, court ladies' },
  '五代': { style: 'Five dynasties Chinese landscape',            elements: 'mountains, hermits' },
  '商':   { style: 'Bronze age Chinese oracle bone art',         elements: 'ritual, sacrifice' },
  '周':   { style: 'Spring Autumn period Chinese painting',       elements: 'warriors, ritual vessels' },
  '春秋': { style: 'Spring Autumn period Chinese painting',       elements: 'warriors, ritual vessels' },
  '战国': { style: 'Warring States Chinese silk painting',       elements: 'warriors, ritual vessels' },
  '三国': { style: 'Three Kingdoms Chinese gongbi',               elements: 'battle flags, weapons' },
  'default':{ style: 'Ancient Chinese ink wash painting',          elements: 'historical scene' },
}

function buildPollinationsPrompt(narrativeText) {
  const era = state.dynasty || '宋'
  const cfg = PROMPT_BY_DYNASTY[era] || PROMPT_BY_DYNASTY['default']
  // 抓叙事前 80 字作为场景描述
  const hint = (narrativeText || '').slice(0, 80).replace(/\s+/g, ' ')
  // p1 风格词 + p2 元素词 + p3 场景
  const p1 = cfg.style
  const p2 = cfg.elements
  const p3 = hint
  // 固定水墨质感参数
  const suffix = 'ink wash, monochrome, rice paper texture, no text, no watermark, masterpiece, --ar 3:2'
  return [p1, p2, p3, suffix].filter(Boolean).join(', ')
}

function fetchBgImage(narrativeText) {
  if (typeof wx === 'undefined') return
  if (bgImageLoading) return  // 防重入

  // 从叙事/城市/事件抽 1-2 个关键词作为 scene 描述
  const era = state.dynasty || '宋'
  const city = state.city || ''
  let sceneHint = ''
  if (city) sceneHint += city
  // 抓叙事前 60 字
  const hint = (narrativeText || '').slice(0, 60)

  const prompt = buildPollinationsPrompt(narrativeText)
  // Pollinations.ai 公开 API，URL 拼装即图
  const seed = Math.floor(Math.random() * 1000000)
  const encoded = encodeURIComponent(prompt)
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=768&height=512&seed=${seed}&nologo=true&model=flux`

  bgImageLoading = true
  if (bgImgEl) { try { bgImgEl.src = '' } catch(e) {} }
  bgImgEl = typeof wx.createImage === 'function' ? wx.createImage() : new Image()
  bgImgEl.onload = () => {
    bgImageLoading = false
    bgImage = url
  }
  bgImgEl.onerror = () => {
    bgImageLoading = false
    console.warn('Pollinations 加载失败:', url.slice(0, 80))
  }
  bgImgEl.src = url
}

function drawBgImage(ctx) {
  const sx = layout.padding
  const sy = layout.sceneY
  const sw = layout.windowW - layout.padding * 2
  const sh = layout.sceneH

  // 1. 卷轴底框（深木色，模拟画轴卷起感）
  ctx.save()
  ctx.fillStyle = 'rgba(20,16,10,0.85)'
  ctx.fillRect(sx - 4, sy - 4, sw + 8, sh + 8)
  ctx.restore()

  if (!bgImgEl || !bgImgEl.complete || bgImgEl.width === 0) {
    // 占位：纯暗色 + 中心"画在生成中..."小字
    ctx.save()
    ctx.fillStyle = 'rgba(15,12,8,0.9)'
    ctx.fillRect(sx, sy, sw, sh)
    ctx.fillStyle = 'rgba(200,168,124,0.4)'
    ctx.font = '11px ' + ui.fontFamily
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('画在生成中...', sx + sw / 2, sy + sh / 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.restore()
  } else {
    // 2. 画主体（cover 模式，1.0 透明度 = 主体）
    ctx.save()
    ctx.beginPath()
    ctx.rect(sx, sy, sw, sh)
    ctx.clip()  // 限制在卷轴框内
    const imgW = bgImgEl.width
    const imgH = bgImgEl.height
    const scale = Math.max(sw / imgW, sh / imgH)
    const drawW = imgW * scale
    const drawH = imgH * scale
    const drawX = sx + (sw - drawW) / 2
    const drawY = sy + (sh - drawH) / 2
    ctx.drawImage(bgImgEl, drawX, drawY, drawW, drawH)
    ctx.restore()
  }

  // 3. 卷轴边框（暗金）
  ctx.save()
  ctx.strokeStyle = 'rgba(200,168,124,0.45)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(sx, sy, sw, sh)
  ctx.restore()

  // 4. 卷轴上下暗金细线（强调"画"）
  ctx.save()
  ctx.strokeStyle = 'rgba(200,168,124,0.6)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(sx + 6, sy + 6)
  ctx.lineTo(sx + sw - 6, sy + 6)
  ctx.moveTo(sx + 6, sy + sh - 6)
  ctx.lineTo(sx + sw - 6, sy + sh - 6)
  ctx.stroke()
  ctx.restore()

  // 5. 左上"画"字朱砂小印（强调"这是画"）
  ctx.save()
  ctx.fillStyle = 'rgba(200,58,46,0.5)'
  ctx.font = '10px ' + ui.fontFamily
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('画 · ' + (state.dynasty || ''), sx + 10, sy + 10)
  ctx.restore()
}

// ─────── 顶部朱砂印 + 纪代（古卷风 v0.1.61） ───────
function drawSealTopBar(ctx) {
  const padding = layout.padding
  const topH = layout.topBarH
  const safeTop = layout.safeTop || 0

  // 1. 朱砂印（用 ui.drawSealStamp：宣纸色字 + 朱砂红底，size=20 字号 11px）
  const sealChar = state.dynasty ? state.dynasty.charAt(0) : '時'
  const sealCenterX = padding + 14
  const sealCenterY = safeTop + topH / 2
  ui.drawSealStamp(ctx, sealCenterX, sealCenterY, 20, sealChar)

  // 2. 纪年 + 姓名（朱砂印右侧，单行排版）
  const eraStr = state.eraDisplay || (state.dynasty + ' ' + state.year + '年')
  const infoStr = eraStr + '  ·  ' + state.name + state.age + '岁'
  ctx.save()
  // 暗金点装饰（纪年名前）
  ctx.fillStyle = 'rgba(200,168,124,0.6)'
  ctx.beginPath()
  ctx.arc(sealCenterX + 26, sealCenterY, 2, 0, Math.PI * 2)
  ctx.fill()
  // 文字
  ctx.fillStyle = 'rgba(232,221,208,0.85)'
  ctx.font = '14px ' + ui.fontFamily
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(infoStr, sealCenterX + 36, sealCenterY)
  ctx.restore()

  // 2.5 v0.1.61 版本号水印（右下角小字，方便先生验证新版本）
  ctx.save()
  ctx.fillStyle = 'rgba(200,168,124,0.45)'
  ctx.font = '9px monospace'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText('v0.1.62', layout.windowW - padding - 4, sealCenterY)
  ctx.restore()

  // 3. 暗金细线分隔（顶栏底部）
  ui.drawClassicalDivider(ctx, padding, safeTop + topH - 1, layout.windowW - padding * 2, 0.6)

  // 4. 触摸区域（整个顶栏 = 长按呼出玉牒）
  layout._sealArea = { x: 0, y: 0, w: layout.windowW, h: safeTop + topH }
}

// ─────── 月份变化提示 ───────
function drawMonthNotice(ctx) {
  if (Date.now() - displayStartTime > 3000) return // 只显示3秒

  const notice = '· 时光流转 ·'
  const y = layout.topBarH + 8
  const alpha = Math.min(1, (Date.now() - optionsAppearTime + 200) / 600) * 0.7
  ctx.fillStyle = 'rgba(212,168,83,' + alpha + ')'
  ctx.font = '11px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.fillText(notice, layout.windowW / 2, y)
  ctx.textAlign = 'left'

  if (newEvent && newEvent.title) {
    ctx.fillStyle = 'rgba(255,200,100,' + alpha + ')'
    ctx.font = '10px ' + ui.fontFamily
    ctx.fillText('📜 ' + newEvent.title, layout.windowW / 2, y + 14)
  }
}

// ─────── 叙事文字（打字机效果 + 滚动） ───────
var scrollOffset = 0
var scrollTouchStartY = 0

// ─── 古卷风状态 ───
var statusHidden = true          // 状态栏默认隐藏
var longPressStart = 0           // 长按计时
var isLongPressing = false       // 是否在长按中
var sealAnimProgress = 0         // 印章动画进度（0-1）
const SEAL_SIZE = 30             // 朱砂印尺寸

function drawNarrative(ctx) {
  if (!narrative) return

  const elapsed = Date.now() - displayStartTime
  const totalChars = narrative.length
  const targetChars = Math.min(totalChars, Math.floor(elapsed / TYPEWRITE_SPEED))
  displayedChars = targetChars

  const text = narrative.slice(0, displayedChars)

  // v0.1.63 拼贴·题跋版：文字在下半屏独立面板（绝对不透明）
  const tx = layout.padding
  const ty = layout.textY
  const tw = layout.windowW - layout.padding * 2
  const th = layout.textH
  const lineHeight = 24
  const fontSize = 15
  const maxW = tw - 24  // 文字面板内边距

  // 1. 文字面板底（深墨色不透明 + 顶部暗金细线，强调"这是题字"）
  ctx.save()
  ctx.fillStyle = 'rgba(15,12,8,0.92)'
  roundRect(ctx, tx, ty, tw, th, 6)
  ctx.fill()
  // 顶部暗金细线
  ctx.strokeStyle = 'rgba(200,168,124,0.5)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(tx + 8, ty + 0.5)
  ctx.lineTo(tx + tw - 8, ty + 0.5)
  ctx.stroke()
  // 左侧朱砂红指示条（强调题跋位置）
  ctx.fillStyle = 'rgba(200,58,46,0.6)'
  ctx.fillRect(tx + 1, ty + 6, 2, th - 12)
  ctx.restore()

  // 2. 文字内容（v0.1.74：加 clip 裁剪，文字超出面板不外溢）
  ctx.save()
  ctx.beginPath()
  ctx.rect(tx, ty, tw, th)
  ctx.clip()
  const contentEndY = drawTextInRect(ctx, text, tx + 14, ty + 8 + scrollOffset, maxW, lineHeight, fontSize)
  ctx.restore()

  // 3. 限制滚动
  const contentH = contentEndY ? (contentEndY - ty - 8) : (text.split('\n').length * lineHeight)
  const maxScroll = Math.max(0, contentH - (th - 16))
  if (scrollOffset > 0) scrollOffset = 0
  if (scrollOffset < -maxScroll) scrollOffset = -maxScroll

  // 4. 打字光标
  if (displayedChars < totalChars) {
    const blink = (Date.now() % 800) < 400
    if (blink) {
      const lines = text.split('\n')
      const lastLine = lines[lines.length - 1] || ''
      const cursorX = tx + 14 + ctx.measureText(lastLine).width + 2
      const cursorY = ty + 8 + (lines.length - 1) * lineHeight + scrollOffset
      layout._cursorBounds = { x: cursorX, y: cursorY, w: 2, h: fontSize }
      ctx.fillStyle = 'rgba(200,168,124,0.7)'
      ctx.fillRect(cursorX, cursorY + 4, 2, fontSize)
    }
  }

  // 5. 滚动区域（文字面板内）
  layout._scrollArea = { x: tx, y: ty, w: tw, h: th }
}

// ─────── 滚动指示器 ───────
function drawScrollIndicator(ctx) {
  const yes = layout._scrollArea || {}
  const contentH = narrative ? narrative.split('\n').length * 26 : 0
  const viewH = yes.h || 200
  if (contentH <= viewH + 20) return

  const barX = layout.windowW - 6
  const barY = layout.topBarH + 8
  const barH = viewH - 16
  const thumbH = Math.max(14, barH * (viewH / contentH))
  const maxOff = Math.max(1, contentH - viewH)
  const thumbY = barY + (barH - thumbH) * (Math.abs(scrollOffset) / maxOff)

  ctx.save()
  ctx.fillStyle = 'rgba(200,168,124,0.12)'
  roundRect(ctx, barX - 1, barY, 2, barH, 1)
  ctx.fill()
  ctx.fillStyle = 'rgba(200,168,124,0.3)'
  roundRect(ctx, barX - 1, thumbY, 2, thumbH, 1)
  ctx.fill()
  ctx.restore()
}

// ─────── 选项按钮（竹简风格 v0.1.61：左侧朱砂红指示条） ───────
function drawOptions(ctx) {
  if (!options || options.length === 0) return

  // v0.1.68: 打字中不画选项（optionFadeIn=0），打字完成后淡入（1）
  const fadeIn = layout.optionFadeIn || 0
  if (fadeIn <= 0) return

  const optX = layout.padding + 4
  const optW = layout.windowW - (layout.padding + 4) * 2
  const optH = layout.optionH
  const optGap = layout.optionGap
  const baseY = layout.optionY

  options.forEach((opt, i) => {
    const oy = baseY + i * (optH + optGap)
    const appearElapsed = Date.now() - optionsAppearTime - i * 100
    if (appearElapsed < 0) return
    const alpha = Math.min(1, appearElapsed / 300)

    // 1. 竹简底（深木色 + 暗金描边，alpha 0.9 → 0.92 增强存在感）
    ctx.save()
    ctx.fillStyle = 'rgba(30,26,20,' + (alpha * fadeIn * 0.92) + ')'
    roundRect(ctx, optX, oy, optW, optH, 6)
    ctx.fill()
    ctx.strokeStyle = 'rgba(200,168,124,' + (alpha * fadeIn * 0.55) + ')'
    ctx.lineWidth = 1
    roundRect(ctx, optX, oy, optW, optH, 6)
    ctx.stroke()
    ctx.restore()

    // 2. 左侧朱砂红指示条（4px 宽，48px 高，v0.1.61 新增）
    ctx.save()
    ctx.fillStyle = 'rgba(200,58,46,' + (alpha * fadeIn * 0.85) + ')'
    ctx.fillRect(optX + 1, oy + 4, 3, optH - 8)
    ctx.restore()

    // 3. 竹简纹理竖线（5 条装饰）
    ctx.save()
    ctx.strokeStyle = 'rgba(160,130,90,' + (alpha * fadeIn * 0.06) + ')'
    ctx.lineWidth = 1
    const lineSpacing = optW / 6
    for (let li = 1; li < 6; li++) {
      ctx.beginPath()
      ctx.moveTo(optX + li * lineSpacing, oy + 4)
      ctx.lineTo(optX + li * lineSpacing, oy + optH - 4)
      ctx.stroke()
    }
    ctx.restore()

    // 4. 序号小点
    ctx.fillStyle = 'rgba(200,168,124,' + (alpha * fadeIn * 0.6) + ')'
    ctx.font = '10px ' + ui.fontFamily
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText('·' + (i + 1) + '·', optX + 20, oy + optH / 2)

    // 选项文字
    ctx.fillStyle = 'rgba(245,239,224,' + alpha + ')'
    ctx.font = '14px ' + ui.fontFamily
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(opt.label, optX + 30, oy + optH / 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    // 竹简右侧装饰小点
    ctx.fillStyle = 'rgba(200,168,124,' + (alpha * fadeIn * 0.3) + ')'
    ctx.beginPath()
    ctx.arc(optX + optW - 10, oy + optH / 2, 3, 0, Math.PI * 2)
    ctx.fill()

    // 记录热区（扩大命中范围）
    opt.bounds = { x: optX - 4, y: oy - 4, w: optW + 8, h: optH + 8 }
  })
}

// ─────── 自由输入按钮 ───────
function drawFreeInputButton(ctx) {
  // v0.1.68: 打字中不画（fadeIn 拦截）
  const fadeIn = layout.optionFadeIn || 0
  if (fadeIn <= 0) return
  const freeY = layout.optionY + options.length * (layout.optionH + layout.optionGap) + 8
  const freeH = 24  // v0.1.67: 28 → 24 缩 4px
  const freeX = layout.padding + 4
  const freeW = layout.windowW - (layout.padding + 4) * 2

  const appearElapsed = Date.now() - optionsAppearTime - options.length * 100
  if (appearElapsed < 0) return
  const alpha = Math.min(1, appearElapsed / 300)

  // 竹简虚线框
  ctx.save()
  ctx.fillStyle = 'rgba(40,36,30,' + (alpha * 0.6) + ')'
  roundRect(ctx, freeX, freeY, freeW, freeH, 6)
  ctx.fill()
  ctx.strokeStyle = 'rgba(160,130,90,' + (alpha * 0.2) + ')'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 3])
  roundRect(ctx, freeX, freeY, freeW, freeH, 6)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()

  ctx.fillStyle = 'rgba(200,168,124,' + (alpha * 0.4) + ')'
  ctx.font = '11px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('✎ 键入自己所想...', freeX + freeW / 2, freeY + freeH / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  layout.freeInputBounds = { x: freeX, y: freeY, w: freeW, h: freeH }
}

// ─────── 底部物品栏（v0.1.62：行李标签 + 可点击物品） ───────
function drawItemBar(ctx) {
  const barY = layout.itemBarY
  const items = currentItems || []
  const barH = layout.itemBarH

  // 1. 底板（深墨色半透明 + 顶部暗金边）
  ctx.save()
  ctx.fillStyle = 'rgba(15,12,8,0.65)'
  ctx.fillRect(0, barY, layout.windowW, barH)
  ctx.strokeStyle = 'rgba(200,168,124,0.22)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(layout.padding, barY)
  ctx.lineTo(layout.windowW - layout.padding, barY)
  ctx.stroke()
  // 左下/右下 朱砂红小点（古卷风收尾装饰）
  ctx.fillStyle = 'rgba(200,58,46,0.6)'
  ctx.beginPath()
  ctx.arc(layout.padding + 4, barY + barH - 4, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(layout.windowW - layout.padding - 4, barY + barH - 4, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // 2. 行李标签（左侧小字 + 箭头，提示可点击）
  ctx.save()
  ctx.fillStyle = 'rgba(200,168,124,0.5)'
  ctx.font = '10px ' + ui.fontFamily
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('⇧ 行李', layout.padding, barY + 8)
  ctx.restore()

  if (items.length === 0) {
    // 空状态提示
    ctx.save()
    ctx.fillStyle = 'rgba(232,221,208,0.35)'
    ctx.font = '11px ' + ui.fontFamily
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('空囊而来', layout.windowW / 2, barY + barH / 2)
    ctx.restore()
    return
  }

  // 3. 物品图标 + 文字标签
  const iconSize = 28
  const totalW = items.length * (iconSize + 18) - 18
  const startX = (layout.windowW - totalW) / 2

  items.forEach((item, i) => {
    const ix = startX + i * (iconSize + 18)
    const iy = barY + 18  // 下移让位 "⇧ 行李" 标签

    // 小圆底
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.beginPath()
    ctx.arc(ix + iconSize / 2, iy + iconSize / 2, iconSize / 2, 0, Math.PI * 2)
    ctx.fill()
    // 暗金描边（0.3 → 0.45 增强可点击感）
    ctx.strokeStyle = 'rgba(200,168,124,0.45)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(ix + iconSize / 2, iy + iconSize / 2, iconSize / 2, 0, Math.PI * 2)
    ctx.stroke()

    // emoji 图标
    ctx.fillStyle = COLORS.gold
    ctx.font = '15px ' + ui.fontFamily
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(item.icon || '📦', ix + iconSize / 2, iy + iconSize / 2)

    // 文字标签（物品名）
    ctx.fillStyle = 'rgba(232,221,208,0.7)'
    ctx.font = '10px ' + ui.fontFamily
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(item.name || '', ix + iconSize / 2, iy + iconSize + 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    // 记录触摸热区
    item._bounds = { x: ix, y: iy, w: iconSize, h: iconSize + 14 }
  })
}

// ─────── 玉牒浮窗（长按状态） ───────
function drawJadeTablet(ctx) {
  const w = layout.windowW
  const h = layout.windowH

  // 半透明遮罩
  ctx.fillStyle = 'rgba(0,0,0,0.65)'
  ctx.fillRect(0, 0, w, h)

  // 玉牒面板（居中矩形，仿玉色）
  const pw = Math.min(280, w - 40)
  const ph = 260
  const px = (w - pw) / 2
  const py = (h - ph) / 2

  ctx.save()
  ctx.fillStyle = 'rgba(26,36,30,0.95)'
  roundRect(ctx, px, py, pw, ph, 12)
  ctx.fill()
  ctx.strokeStyle = 'rgba(90,138,112,0.5)'
  ctx.lineWidth = 1
  roundRect(ctx, px, py, pw, ph, 12)
  ctx.stroke()
  ctx.restore()

  // 玉牒标题
  ctx.fillStyle = COLORS.jade
  ctx.font = '16px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('玉  牒', px + pw / 2, py + 30)

  // 分隔线
  ctx.strokeStyle = 'rgba(90,138,112,0.2)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(px + 24, py + 52)
  ctx.lineTo(px + pw - 24, py + 52)
  ctx.stroke()

  // 内容行
  const fields = [
    { label: '姓  名', value: state.name },
    { label: '年  岁', value: state.age + '岁' },
    { label: '身  份', value: state.occupation || '庶民' },
    { label: '金银', value: state.coin + '文' },
  ]

  ctx.textAlign = 'left'
  fields.forEach((f, i) => {
    const fy = py + 72 + i * 30
    ctx.fillStyle = 'rgba(200,200,200,0.5)'
    ctx.font = '13px ' + ui.fontFamily
    ctx.fillText(f.label, px + 28, fy)
    ctx.fillStyle = 'rgba(245,239,224,0.85)'
    ctx.fillText(f.value, px + 86, fy)
  })

  // 健康条（题：气血）
  const healthY = py + 72 + fields.length * 30 + 8
  ctx.fillStyle = 'rgba(200,200,200,0.5)'
  ctx.font = '13px ' + ui.fontFamily
  ctx.fillText('气  血', px + 28, healthY)

  const hpBarX = px + 86
  const hpBarY = healthY - 6
  const hpBarW = pw - 86 - 28
  const hpBarH = 12
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  roundRect(ctx, hpBarX, hpBarY, hpBarW, hpBarH, 6)
  ctx.fill()
  const hpRatio = Math.max(0, Math.min(1, state.health / 100))
  const hpColor = hpRatio > 0.6 ? '#5a8a70' : (hpRatio > 0.3 ? '#c8a87c' : '#c83a2e')
  ctx.fillStyle = hpColor
  roundRect(ctx, hpBarX, hpBarY, hpBarW * hpRatio, hpBarH, 6)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = '10px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(state.health, hpBarX + hpBarW * hpRatio - 4, hpBarY + hpBarH / 2)

  // 物品列表
  if (state.items && state.items.length > 0) {
    const itemY = healthY + 28
    ctx.fillStyle = 'rgba(200,200,200,0.5)'
    ctx.font = '13px ' + ui.fontFamily
    ctx.textAlign = 'left'
    ctx.fillText('行  李', px + 28, itemY)
    ctx.fillStyle = 'rgba(245,239,224,0.7)'
    ctx.font = '11px ' + ui.fontFamily
    const itemStr = state.items.map(i => i.icon + i.name).join('  ')
    ctx.fillText(itemStr, px + 86, itemY, pw - 86 - 28)
  }

  // 底部提示
  ctx.fillStyle = 'rgba(200,200,200,0.3)'
  ctx.font = '10px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('轻点关闭', px + pw / 2, py + ph - 12)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

// ─────── 加载中 ───────
function drawLoading(ctx) {
  // P2.10 不覆盖叙事，只显示半透明顶部提示
  const barH = 44
  const barY = layout.windowH - layout.itemBarH - barH - 10
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  roundRect(ctx, layout.padding, barY, layout.windowW - layout.padding * 2, barH, 8)
  ctx.fill()
  ctx.strokeStyle = 'rgba(212,168,83,0.3)'
  ctx.lineWidth = 1
  roundRect(ctx, layout.padding, barY, layout.windowW - layout.padding * 2, barH, 8)
  ctx.stroke()
  ctx.restore()

  ctx.fillStyle = COLORS.gold
  ctx.font = '14px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const dots = '.'.repeat(((Date.now() - loadingStart) / 500 % 4) | 0)
  ctx.fillText('AI 穿越中' + dots, layout.windowW / 2, barY + barH / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

// ─────── 错误提示 ───────
function drawError(ctx) {
  // P2.9 不画全屏黑底，只画一个小提示条
  const barH = 44
  const barY = layout.windowH - layout.itemBarH - barH - 10
  ctx.save()
  ctx.fillStyle = 'rgba(100,60,60,0.85)'
  roundRect(ctx, layout.padding, barY, layout.windowW - layout.padding * 2, barH, 8)
  ctx.fill()
  ctx.strokeStyle = 'rgba(200,80,80,0.4)'
  ctx.lineWidth = 1
  roundRect(ctx, layout.padding, barY, layout.windowW - layout.padding * 2, barH, 8)
  ctx.stroke()
  ctx.restore()

  ctx.fillStyle = '#e06060'
  ctx.font = '13px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(errorMsg, layout.windowW / 2, barY + barH / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

// ─────── AI 调试浮窗（v0.1.61）────
// 折叠：右上角小图标"DBG"（v0.1.60 改 — Emoji 在 Canvas 2D 不显示）
// 展开：全屏覆盖，显示最近 3 轮完整 input/result
function drawDebugPanel(ctx) {
  if (debugLog.length === 0) return

  if (!debugOpen) {
    // 折叠态：右上角小图标
    const iconSize = 36
    const iconX = layout.windowW - iconSize - 8
    const iconY = 8
    // 半透明背景（深色）
    ctx.fillStyle = 'rgba(40,20,60,0.85)'
    roundRect(ctx, iconX, iconY, iconSize, iconSize, 6)
    ctx.fill()
    // 边框（金色）
    ctx.strokeStyle = '#f0c878'
    ctx.lineWidth = 1.5
    ctx.stroke()
    // 文字
    ctx.fillStyle = '#f0c878'
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('DBG', iconX + iconSize / 2, iconY + iconSize / 2 + 1)
    // 调试轮数小角标
    if (debugLog.length > 0) {
      ctx.fillStyle = '#e04040'
      ctx.beginPath()
      ctx.arc(iconX + iconSize - 6, iconY + 6, 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 10px sans-serif'
      ctx.fillText(String(debugLog.length), iconX + iconSize - 6, iconY + 7)
    }
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    return
  }

  // 展开态：全屏覆盖
  const w = layout.windowW
  const h = layout.windowH
  const closeBarH = 40

  // 背景
  ctx.fillStyle = 'rgba(0,0,0,0.92)'
  ctx.fillRect(0, 0, w, h)

  // 顶部关闭条（v0.1.66 修高一点，避免和正文文字重叠）
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(0, 0, w, closeBarH)

  // v0.1.75 加"复制"按钮（紧贴右上角 ▲ 左边）
  const copyBtnW = 64
  const _ARROW_SIZE = 28  // 占位用，避免 const 重复声明
  const copyBtnX = w - _ARROW_SIZE - 8 - copyBtnW - 4
  ctx.fillStyle = 'rgba(240,200,120,0.18)'
  ctx.fillRect(copyBtnX, 4, copyBtnW, closeBarH - 8)
  ctx.fillStyle = '#f0c878'
  ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('复制', copyBtnX + copyBtnW / 2, closeBarH / 2 + 1)
  // 标记按钮区域供触摸用
  layout._copyBtn = { x: copyBtnX, y: 0, w: copyBtnW, h: closeBarH }

  ctx.fillStyle = '#f0c878'
  ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('DBG AI 调试 · 关闭 ↑', 12, closeBarH / 2)
  ctx.textAlign = 'right'
  // 向上箭头（顶部右）
  const arrowSize = 28
  ctx.fillStyle = 'rgba(240,200,120,0.2)'
  ctx.fillRect(w - arrowSize - 8, 2, arrowSize, closeBarH - 4)
  ctx.fillStyle = '#f0c878'
  ctx.font = 'bold 18px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('▲', w - arrowSize / 2 - 8, closeBarH / 2 + 1)
  // 向下箭头（底部）
  const downY = h - arrowSize - 8
  ctx.fillStyle = 'rgba(240,200,120,0.2)'
  ctx.fillRect(w - arrowSize - 8, downY, arrowSize, arrowSize)
  ctx.fillStyle = '#f0c878'
  ctx.fillText('▼', w - arrowSize / 2 - 8, downY + arrowSize / 2 + 1)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#888'
  ctx.font = '11px sans-serif'
  ctx.fillText('最近 ' + debugLog.length + ' 轮', w - arrowSize - 24, closeBarH / 2)

  // 内容区
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, closeBarH, w, h - closeBarH)
  ctx.clip()

  ctx.font = '10px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#c0c0c0'

  // 拼接所有轮次的完整文本（v0.1.70 精简：只留 AI 原始输入/输出）
  let allText = ''
  for (let i = 0; i < debugLog.length; i++) {
    const d = debugLog[i]
    allText += `== 第 ${i + 1}/${debugLog.length} 轮 round=${d.round} ==\n`
    allText += `[INPUT 玩家选项]: ${d.input || '(空)'}\n\n`

    if (d.messages_to_ai && d.messages_to_ai.length > 0) {
      allText += `[发给 AI 的 messages]:\n`
      d.messages_to_ai.forEach((m, j) => {
        allText += `  ── messages[${j}].role="${m.role}" ──\n${m.content}\n\n`
      })
    }

    if (d.raw_response) {
      allText += `[AI 原始返回]:\n${d.raw_response}\n\n`
    }

    if (d.all_branches && d.all_branches.length > 0) {
      allText += `[AI 生成 ${d.all_branches.length} 个分支]:\n`
      d.all_branches.forEach((b, j) => {
        allText += `  分支${j + 1} p=${b.p}\n  ${b.content || ''}\n  options: ${JSON.stringify(b.options)}\n\n`
      })
    }

    if (d.resultError) {
      allText += `[ERROR]: ${d.resultError}\n\n`
    }

    allText += '\n'
  }

  // 简单自动换行
  const charW = 6   // 10px monospace 一字约 6px
  const lineH = 13
  const maxCharsPerLine = Math.floor((w - 16) / charW)
  const lines = []
  for (const rawLine of allText.split('\n')) {
    if (rawLine.length <= maxCharsPerLine) {
      lines.push(rawLine)
    } else {
      for (let i = 0; i < rawLine.length; i += maxCharsPerLine) {
        lines.push(rawLine.substring(i, i + maxCharsPerLine))
      }
    }
  }

  // 限制 debugScroll 不超过内容总长
  const totalH = lines.length * lineH
  const viewH = h - closeBarH
  const maxScroll = Math.max(0, totalH - viewH)
  if (debugScroll > maxScroll) debugScroll = maxScroll
  if (debugScroll < 0) debugScroll = 0

  const startY = closeBarH + 8 - debugScroll
  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineH
    if (y < closeBarH || y > h) continue
    // 颜色：标题/请求/响应不同
    const line = lines[i]
    if (line.startsWith('━━━')) ctx.fillStyle = '#f0c878'
    else if (line.startsWith('────')) ctx.fillStyle = '#d08770'
    else if (line.startsWith('[INPUT')) ctx.fillStyle = '#88c0d0'
    else if (line.startsWith('[REQUEST')) ctx.fillStyle = '#a3be8c'
    else if (line.startsWith('[RESPONSE')) ctx.fillStyle = '#ebcb8b'
    else if (line.startsWith('[ERROR')) ctx.fillStyle = '#bf616a'
    else if (line.startsWith('[分支')) ctx.fillStyle = '#b48ead'
    else ctx.fillStyle = '#c0c0c0'
    ctx.fillText(line, 8, y)
  }
  ctx.restore()

  // 滚动条（右侧）
  if (totalH > viewH) {
    const barH = Math.max(40, viewH * viewH / totalH)
    const barY = closeBarH + (debugScroll / maxScroll) * (viewH - barH)
    ctx.fillStyle = 'rgba(240,200,120,0.4)'
    ctx.fillRect(w - 4, barY, 4, barH)
  }
}

// ─────── 触摸处理（支持长按呼出玉牒） ───────
// ─────── 物品详情浮窗（点击物品后弹出） ───────
function drawItemDetail(ctx) {
  if (!itemDetail || !itemDetail.item) return
  const item = itemDetail.item

  const w = layout.windowW
  const h = layout.windowH

  // 半透明遮罩
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(0, 0, w, h)

  // 详情面板（居中）
  const pw = Math.min(280, w - 40)
  const ph = 220
  const px = (w - pw) / 2
  const py = (h - ph) / 2

  ctx.save()
  // 玉色面板
  ctx.fillStyle = 'rgba(26,36,30,0.95)'
  roundRect(ctx, px, py, pw, ph, 12)
  ctx.fill()
  ctx.strokeStyle = 'rgba(90,138,112,0.5)'
  ctx.lineWidth = 1
  roundRect(ctx, px, py, pw, ph, 12)
  ctx.stroke()
  ctx.restore()

  // 大图标
  ctx.fillStyle = COLORS.gold
  ctx.font = '40px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(item.icon || '📦', px + pw / 2, py + 50)

  // 物品名
  ctx.fillStyle = COLORS.jade
  ctx.font = 'bold 18px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(item.name || '物品', px + pw / 2, py + 100)

  // 物品描述
  ctx.fillStyle = 'rgba(232,221,208,0.75)'
  ctx.font = '13px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const desc = item.desc || '一件普通的物品。'
  // 简单按 \n 拆行
  const descLines = desc.split('\n')
  descLines.forEach((line, i) => {
    ctx.fillText(line, px + pw / 2, py + 130 + i * 20, pw - 32)
  })
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // 底部提示
  ctx.fillStyle = 'rgba(200,168,124,0.5)'
  ctx.font = '10px ' + ui.fontFamily
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('轻点关闭', px + pw / 2, py + ph - 12)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

var scrollStartOffset = 0
var isScrolling = false
var touchStartTime = 0
var touchStartPos = { x: 0, y: 0 }
var longPressTriggered = false

function handleTouch(x, y, type) {
  // ── AI 调试浮窗触摸拦截（v0.1.61）──
  // 浮窗区域：右上角图标（折叠态）/ 全屏覆盖（展开态）
  if (debugLog.length > 0) {
    if (!debugOpen) {
      // 折叠态：右上角小图标
      const iconSize = 36
      const iconX = layout.windowW - iconSize - 8
      const iconY = 8
      if (hitTest(x, y, iconX, iconY, iconSize, iconSize)) {
        if (type === 'end') {
          debugOpen = true
          debugScroll = 0
        }
        return null  // 拦截，不传给游戏主流程
      }
    } else {
      // 展开态：点顶部条 = 折叠；点箭头 = 滚动
      const closeBarH = 40
      const arrowSize = 28
      const _w = layout.windowW
      const _h = layout.windowH

      // v0.1.75 复制按钮（顶部条右）
      if (type === 'end' && layout._copyBtn && y <= closeBarH
          && x >= layout._copyBtn.x && x <= layout._copyBtn.x + layout._copyBtn.w) {
        // 拼接最近 N 轮 AI 输入输出为文本
        const txt = debugLog.map((d, i) => {
          let s = `== 第 ${i + 1}/${debugLog.length} 轮 round=${d.round} ==\n`
          s += `[INPUT 玩家选项]: ${d.input || '(空)'}\n\n`
          if (d.messages_to_ai && d.messages_to_ai.length > 0) {
            s += `[发给 AI 的 messages]:\n`
            d.messages_to_ai.forEach((m, j) => {
              s += `  ── messages[${j}].role="${m.role}" ──\n${m.content}\n\n`
            })
          }
          if (d.raw_response) s += `[AI 原始返回]:\n${d.raw_response}\n\n`
          if (d.all_branches && d.all_branches.length > 0) {
            s += `[AI 生成 ${d.all_branches.length} 个分支]:\n`
            d.all_branches.forEach((b, j) => {
              s += `  分支${j + 1} p=${b.p}\n  ${b.content || ''}\n  options: ${JSON.stringify(b.options)}\n\n`
            })
          }
          if (d.resultError) s += `[ERROR]: ${d.resultError}\n`
          return s
        }).join('\n')
        if (typeof wx !== 'undefined' && wx.setClipboardData) {
          wx.setClipboardData({
            data: txt,
            success: () => {
              if (wx.showToast) wx.showToast({ title: '已复制 ' + txt.length + ' 字符', icon: 'none', duration: 1500 })
            },
            fail: (e) => {
              if (wx.showToast) wx.showToast({ title: '复制失败：' + (e.errMsg || ''), icon: 'none' })
            }
          })
        }
        return null
      }

      if (type === 'end' && y <= closeBarH) {
        debugOpen = false
        return null
      }
      // 向上箭头（顶部条右）
      const upX = _w - arrowSize - 8
      if (type === 'end' && y <= closeBarH && x >= upX) {
        debugScroll = Math.max(0, debugScroll - 80)
        return null
      }
      // 向下箭头（底部）
      const downY = _h - arrowSize - 8
      if (type === 'end' && y >= downY) {
        debugScroll = debugScroll + 80
        return null
      }
      // 点击文本区任意位置 = 向下滚 1 屏
      if (type === 'end' && y > closeBarH && y < downY) {
        debugScroll = debugScroll + 100
        return null
      }
      // 展开时整个浮窗区域拦截
      return null
    }
  }

  if (type === 'start') {
    touchStartTime = Date.now()
    touchStartPos = { x, y }
    longPressTriggered = false

    // 检测是否在叙事滚动区域
    if (layout._scrollArea && x >= layout._scrollArea.x && x <= layout._scrollArea.x + layout._scrollArea.w &&
        y >= layout._scrollArea.y && y <= layout._scrollArea.y + layout._scrollArea.h) {
      isScrolling = true
      scrollTouchStartY = y
      scrollStartOffset = scrollOffset
    }
    return null
  }

  if (type === 'move') {
    // 长按检测：手指按住不动 → 显示玉牒
    if (!longPressTriggered && !isLongPressing && Date.now() - touchStartTime > 400) {
      const dx = x - touchStartPos.x
      const dy = y - touchStartPos.y
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
        longPressTriggered = true
        isLongPressing = true
        return null
      }
    }

    if (isScrolling) {
      const dy = y - scrollTouchStartY
      scrollOffset = scrollStartOffset + dy
    }
    return null
  }

  if (type === 'end') {
    // 如果正在显示玉牒 → 点击关闭
    if (isLongPressing) {
      isLongPressing = false
      return null
    }

    isScrolling = false

    // 滑动超过阈值 → 不触发按钮点击
    if (scrollTouchStartY !== 0 && Math.abs(y - scrollTouchStartY) > 10) {
      scrollTouchStartY = 0
      return null
    }
    scrollTouchStartY = 0
  }

  if (type !== 'end') return null

  // 死亡触发淡出
  if (!alive) {
    if (!fadeOut) {
      fadeOut = { start: Date.now(), duration: 1500 }
    }
    return null
  }

  // 加载中不接受输入
  if (loading) return null

  // 错误状态下点重试
  if (errorMsg && options.length > 0) {
    if (isInOptionBounds(x, y, 0)) {
      errorMsg = ''
      options = []
      callAI('__retry__')
      return null
    }
  }

  // 检查选项按钮
  for (let i = 0; i < options.length; i++) {
    if (isInOptionBounds(x, y, i)) {
      const opt = options[i]
      handleOptionSelected(opt)
      return null
    }
  }

  // 检查自由输入
  if (layout.freeInputBounds && hitTest(x, y, layout.freeInputBounds.x, layout.freeInputBounds.y, layout.freeInputBounds.w, layout.freeInputBounds.h)) {
    handleFreeInput()
    return null
  }

  // 检查物品（点击物品 → 弹物品详情浮窗）
  if (itemDetail) {
    // 详情浮窗打开时，点任何位置关闭
    itemDetail = null
    return null
  }
  for (const item of (currentItems || [])) {
    if (item._bounds && hitTest(x, y, item._bounds.x, item._bounds.y, item._bounds.w, item._bounds.h)) {
      itemDetail = { item: item, time: Date.now() }
      return null
    }
  }
}

function isInOptionBounds(x, y, idx) {
  const opt = options[idx]
  if (!opt || !opt.bounds) return false
  return hitTest(x, y, opt.bounds.x, opt.bounds.y, opt.bounds.w, opt.bounds.h)
}

// ─────── 处理选项点击 ───────
function handleOptionSelected(opt) {
  // 重试特殊处理 — v0.1.63 (D005) 用内部信号不污染对话流
  if (opt.key === '__retry__') {
    errorMsg = ''
    options = []
    callAI('__retry__')
    return
  }

  // 标记玩家选择，立即反馈
  opt.selected = true
  options = []  // 清除选项防止重复点击

  // 调用 AI
  callAI(opt.label)
}

// ─────── 处理自由输入 ───────
function handleFreeInput() {
  if (typeof wx === 'undefined' || !wx.showKeyboard) {
    // 桌面调试 fallback
    const text = prompt('输入你想做的事：')
    if (text && text.trim()) {
      options = []
      callAI(text.trim())
    }
    return
  }

  // 微信小游戏：使用 showKeyboard + onKeyboardInput + onKeyboardConfirm
  freeInputActive = true
  freeInputText = ''

  wx.showKeyboard({
    defaultValue: '',
    maxLength: 100,
    confirmType: 'send',
    success: () => {
      // 键盘已弹出，监听用户输入
      if (wx.onKeyboardInput) {
        wx.offKeyboardInput && wx.offKeyboardInput()
        wx.onKeyboardInput && wx.onKeyboardInput((res) => {
          freeInputText = res.value || ''
        })
      }
      if (wx.onKeyboardConfirm) {
        wx.offKeyboardConfirm && wx.offKeyboardConfirm()
        wx.onKeyboardConfirm && wx.onKeyboardConfirm((res) => {
          const text = (res.value || freeInputText || '').trim()
          if (text) {
            options = []
            callAI(text)
          }
          freeInputActive = false
          if (wx.hideKeyboard) wx.hideKeyboard({})
          if (wx.offKeyboardInput) wx.offKeyboardInput()
          if (wx.offKeyboardConfirm) wx.offKeyboardConfirm()
        })
      }
    },
    fail: (err) => {
      // 备用方案：使用 modal 输入
      if (wx.showModal) {
        wx.showModal({
          title: '你想做什么？',
          editable: true,
          placeholderText: '例如：去茶摊打听消息',
          success: (res) => {
            if (res.confirm && res.content && res.content.trim()) {
              options = []
              callAI(res.content.trim())
            }
          },
        })
      }
    },
  })
}
