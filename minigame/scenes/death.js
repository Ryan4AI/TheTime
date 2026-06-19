// Death scene — 墓碑页（v0.6.96 重构）
// 极简：圆弧顶墓碑 + 居中墓志铭 + 姓名 + 朝代 + 享年 + 死因 + 最高成就 + 小按钮

const ui = require('../engine/ui')
const { COLORS, getSystemInfo, drawBackground, drawText, drawButton, hitTest, roundRect } = ui
const { FadeAnim, SlideFadeAnim } = require('../engine/anim')

var layout = {}
var anims = {}
var deathState = null
var deathCause = ''
var deathType = '剧情杀'
var epRecord = ''  // v0.6.97: 志（小传 50-100 字）
var highestAchievement = null
// v0.7.2: 测试按钮专用数据（home → 测试墓志铭 → death）
var testPoemData = null  // { deathCause, epRecord, epitaph, name, dynasty }
function setTestPoemData(data) { testPoemData = data }
function clearTestPoemData() { testPoemData = null }
function getDeathCause() { return testPoemData ? (testPoemData.deathCause || '') : deathCause }
function getEpRecord() { return testPoemData ? (testPoemData.epRecord || '') : epRecord }
function getEpitaph() { return testPoemData ? (testPoemData.epitaph || '') : (deathState.epitaph || '一生如梦，来去无痕。') }
function getDeathState() { return testPoemData ? (testPoemData._deathState || deathState) : deathState }
var ready = false
// v0.7.11: 测试模式骨架屏状态（先生拍板 05:38：先跳转后生成）
var testPoemPending = false  // init 时传入 testPoemPending=true 启动
var testPoemCase = null  // entry.js 传过来的 TEST_CASES[idx]
var testPoemLoading = false  // 云函数调用中
var testPoemError = null  // 失败时显示
var testPoemLoadingStartTime = 0  // 用于旋转环

function calcLayout() {
  var sys = getSystemInfo()
  var w = sys.width
  var h = sys.height
  var cx = Math.floor(w / 2)

  // v0.6.99: 墓碑尺寸（按 skill 重设计，5 行紧凑布局）
  var tabletW = Math.min(280, Math.floor(w * 0.78))
  var tabletH = Math.floor(h * 0.58)  // 紧凑（之前 0.62）
  var tabletX = Math.floor(cx - tabletW / 2)
  var tabletY = Math.floor(h * 0.18)

  layout = {
    w: w, h: h, cx: cx,
    tabletW: tabletW, tabletH: tabletH,
    tabletX: tabletX, tabletY: tabletY,
    // 圆弧顶高度
    archH: 32,
    // v0.6.99: 5 行布局（按 impeccable + game-ui-design skill 重设计）
    // 行 1: 铭（22pt 金色大字，主体）
    epitaphY: tabletY + tabletH * 0.22,
    // 行 2: 志（小传 12pt × 3 行）
    epRecordY: tabletY + tabletH * 0.40,
    epRecordLineH: 16,
    epRecordMaxLines: 3,
    // 行 3: 元信息上半（朝代 · 享年 11pt 灰色）
    metaY: tabletY + tabletH * 0.64,
    // 行 3.5: 元信息下半（死因 单独一行，11pt 弱金色）—— v0.7.11 fix3 拆短
    // 行 4: 最高成就（10pt 玉色）—— 同步下移避开元信息下半
    achieveY: tabletY + tabletH * 0.82,
    // 按钮位置（墓碑下方）—— v0.6.98: 两个按钮并排
    btnY: tabletY + tabletH + 24,
    btnW: Math.min(130, Math.floor(w * 0.36)),
    btnH: 40,
  }
}

function init(items, identity, gender) {
  calcLayout()
  // v0.7.2: 测试数据优先（home → 测试墓志铭 → death）
  if (testPoemData) {
    deathState = testPoemData._deathState || identity || {}
    deathCause = testPoemData.deathCause || ''
    deathType = testPoemData.deathType || '剧情杀'
    epRecord = testPoemData.epRecord || ''
    highestAchievement = testPoemData.highestAchievement || null
  } else {
    deathState = identity || {}
    deathCause = identity && identity.deathCause || ''
    deathType = (identity && identity.deathType) || '剧情杀'
    epRecord = (identity && identity.epRecord) || ''  // v0.6.97
    highestAchievement = (identity && identity.highestAchievement) || null
  }
  anims = {}
  ready = false

  // v0.7.11: 测试墓志铭按钮 → entry.js 直接传 testPoemPending + testPoemCase
  // （先生拍板 05:38：先跳转到 death scene，由 death 内部画骨架屏+调云函数）
  if (identity && identity.testPoemPending && identity.testPoemCase) {
    testPoemPending = true
    testPoemCase = identity.testPoemCase
    // 占位 deathState（云函数返回前墓碑不空白）
    deathState = {
      name: testPoemCase.name,
      dynasty: testPoemCase.dynasty,
      city: testPoemCase.city,
      eraDisplay: testPoemCase.year + '年',
      age: testPoemCase.age,
      life_number: testPoemCase.life_number,
      historical_shelter: 0,
    }
    deathCause = ''
    deathType = testPoemCase.deathType || '剧情杀'
    epRecord = ''
    highestAchievement = null
    // 启动云函数
    triggerTestPoemCloud()
  }

  var now = Date.now()
  anims = {
    tablet: new FadeAnim(200, 800),
    epitaph: new FadeAnim(900, 700),
    name: new FadeAnim(1400, 500),
    era: new FadeAnim(1800, 500),
    deathCause: new FadeAnim(2200, 500),
    achieve: new FadeAnim(2600, 500),
    btn: new SlideFadeAnim(8, 400, 3000),
  }
  for (var k in anims) anims[k].start(now)

  // v0.7.11: 按钮 ready 跟数据 ready 同步（先生 05:46 反馈）
  // 测试模式：云函数返回 + setTestPoemData 后立即 ready（不等 800ms / 3200ms 动画）
  // 正常死亡流：等 3200ms 是因为有墓碑/铭/姓名 fade-in 动画，按钮是最后一项
  if (testPoemPending) {
    ready = false  // 测试模式：云函数返回时改 true（triggerTestPoemCloud success 里）
  } else {
    setTimeout(function() { ready = true }, 3200)
  }
}

function onTouch(x, y, type) {
  if (type !== 'end') return null
  if (!ready) return null

  var l = layout
  // v0.6.98: 两个按钮并排——再入轮回（左）+ 返回主页（右）
  var gap = 12
  var totalW = l.btnW * 2 + gap
  var leftX = Math.floor(l.cx - totalW / 2)
  var rightX = leftX + l.btnW + gap

  // 左：再入轮回（写轮回数据）
  if (hitTest(x, y, leftX, l.btnY, l.btnW, l.btnH)) {
    // v0.7.2: 清测试数据（避免下次进墓碑页还显示测试样例）
    clearTestPoemData()
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync('rebirth', {
        life_number: (deathState.life_number || 1) + 1,
        historical_shelter: (deathState.historical_shelter || 0) + 1,
        legacy: {
          epRecord: epRecord || deathState.epRecord || '',
          epitaph: deathState.epitaph || '',
          deathCause: deathCause || '',
        },
      })
    }
    return { scene: 'entry' }
  }

  // 右：返回主页（不写轮回数据，清空 rebirth 让玩家重新开始）
  if (hitTest(x, y, rightX, l.btnY, l.btnW, l.btnH)) {
    // v0.7.2: 清测试数据
    clearTestPoemData()
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.removeStorageSync('rebirth')
    }
    return { scene: 'entry' }
  }
  return null
}

function render(ctx) {
  var l = layout
  var now = Date.now()
  var w = l.w, h = l.h, cx = l.cx

  // 1. 背景（深墨色）
  drawBackground(ctx, w, h)

  // 2. 墓碑
  var tabletOp = anims.tablet.update(now)
  if (tabletOp <= 0) return

  ctx.save()
  ctx.globalAlpha = tabletOp
  // 圆弧顶
  ctx.fillStyle = 'rgba(45,40,32,0.95)'
  ctx.beginPath()
  ctx.moveTo(l.tabletX, l.tabletY + l.archH)
  ctx.quadraticCurveTo(l.tabletX + l.tabletW / 2, l.tabletY - 8, l.tabletX + l.tabletW, l.tabletY + l.archH)
  ctx.lineTo(l.tabletX + l.tabletW, l.tabletY + l.tabletH)
  ctx.lineTo(l.tabletX, l.tabletY + l.tabletH)
  ctx.closePath()
  ctx.fill()
  // 墓碑边框（细金线）
  ctx.globalAlpha = tabletOp * 0.4
  ctx.strokeStyle = 'rgba(200,168,124,0.6)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(l.tabletX, l.tabletY + l.archH)
  ctx.quadraticCurveTo(l.tabletX + l.tabletW / 2, l.tabletY - 8, l.tabletX + l.tabletW, l.tabletY + l.archH)
  ctx.lineTo(l.tabletX + l.tabletW, l.tabletY + l.tabletH)
  ctx.lineTo(l.tabletX, l.tabletY + l.tabletH)
  ctx.closePath()
  ctx.stroke()
  ctx.restore()

  // v0.7.11: 测试模式加载中 → 画骨架屏覆盖在墓碑中央
  // （先生拍板 05:38：先跳转后生成，墓碑不空白）
  if (testPoemLoading) {
    drawTestPoemSkeleton(ctx)
    return  // loading 中：不画后续文字/按钮（避免墓志铭位置错乱）
  }
  // v0.7.11 fix2: 失败时仍画骨架屏（说明情况），但**继续渲染按钮**让先生能返回
  // （先生 05:46 反馈：按钮不该等；失败也要可点）
  if (testPoemError) {
    drawTestPoemSkeleton(ctx)
    // 不 return，继续画下面的姓名/朝代/享年/按钮
  }

  // 3. 顶部小字"第 X 世"（淡灰色）
  ctx.save()
  ctx.fillStyle = 'rgba(200,168,124,0.4)'
  ctx.font = '10px ' + (ui.fontFamily || 'sans-serif')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  var lifeNum = deathState.life_number || 1
  drawText(ctx, '第 ' + lifeNum + ' 世', cx, l.tabletY + 20, {
    fontSize: 10,
    color: 'rgba(200,168,124,0.5)',
    align: 'center', baseline: 'middle',
  })
  ctx.restore()

  // 4. 铭（韵语，居中大字）—— v0.6.99: 字号放大到 22pt（按 skill：主体感）
  var eOp = anims.epitaph.update(now)
  if (eOp > 0) {
    var epitaph = deathState.epitaph || '一生如梦，来去无痕。'
    drawText(ctx, epitaph, cx, l.epitaphY, {
      fontSize: 22,
      color: 'rgba(200,168,124,1)',  // 金色
      align: 'center', baseline: 'middle',
      opacity: eOp * 0.95,
      maxWidth: l.tabletW - 40,
    })
  }

  // 5. 志（小传）—— v0.6.99: 字号 12pt
  var recOp = anims.epitaph.update(now) * 0.85
  if (recOp > 0 && epRecord) {
    var recLines = splitText(epRecord, l.tabletW - 40, 12)
    recLines = recLines.slice(0, l.epRecordMaxLines)
    for (var li = 0; li < recLines.length; li++) {
      drawText(ctx, recLines[li], cx, l.epRecordY + li * l.epRecordLineH, {
        fontSize: 12,
        color: 'rgba(232,221,208,0.75)',  // 纸色
        align: 'center', baseline: 'middle',
        opacity: recOp,
        maxWidth: l.tabletW - 40,
      })
    }
  }

  // 6. 元信息行（v0.6.99 新增：朝代 + 享年 + 死因 三合一）
  // 按 game-ui-design: every element earns screen space
  // v0.7.11 fix3: 死因单独一行（先生 05:49 反馈：元信息行文字溢出墓碑边框）
  // 原方案 "dynasty·享年X岁·死因" 挤一行，字数超 maxWidth 就溢出（drawText 不截断）
  var mOp = anims.name.update(now)
  if (mOp > 0) {
    var dynasty = deathState.dynasty || ''
    var eraDisplay = deathState.eraDisplay || ''
    var age = deathState.age != null ? deathState.age : '?'
    var ageStr = '享年 ' + age + '岁'
    var causeStr = deathCause ? deathCause : ''
    // 上半行：朝代 · 享年
    var upperParts = []
    if (dynasty) upperParts.push(dynasty + (eraDisplay ? '·' + eraDisplay : ''))
    if (ageStr) upperParts.push(ageStr)
    var upperStr = upperParts.join(' · ')
    drawText(ctx, upperStr, cx, l.metaY, {
      fontSize: 11,
      color: 'rgba(200,168,124,0.7)',  // 金色弱
      align: 'center', baseline: 'middle',
      opacity: mOp * 0.85,
    })
    // 下半行：死因（单独画，限定宽度，超长按字符截断）
    if (causeStr) {
      var maxChars = Math.floor((l.tabletW - 40) / 11) - 1  // 11pt 字号每字符约 11px
      var causeDisplay = causeStr
      if (causeStr.length > maxChars) {
        causeDisplay = causeStr.substring(0, maxChars) + '…'
      }
      drawText(ctx, causeDisplay, cx, l.metaY + 16, {
        fontSize: 11,
        color: 'rgba(200,168,124,0.55)',  // 弱金色（弱于上半行）
        align: 'center', baseline: 'middle',
        opacity: mOp * 0.85,
      })
    }
  }

  // 7. 最高成就（v0.6.99 保留）
  var aOp = anims.achieve.update(now)
  if (aOp > 0 && highestAchievement) {
    var achieveText = ''
    if (highestAchievement.on) {
      achieveText = '荣登' + highestAchievement.name
    } else {
      achieveText = '距' + highestAchievement.name + '还差 ' + Math.round(highestAchievement.diff || 0) + ' 分'
    }
    drawText(ctx, achieveText, cx, l.achieveY, {
      fontSize: 10,
      color: 'rgba(170,210,180,0.7)',  // 玉色
      align: 'center', baseline: 'middle',
      opacity: aOp * 0.75,
      maxWidth: l.tabletW - 40,
    })
  }

  // 9. 按钮"再入轮回"（左）+ "返回主页"（右）—— v0.6.98: 两个并排
  var bOp = anims.btn.update(now)
  if (bOp > 0) {
    var gap = 12
    var totalW = l.btnW * 2 + gap
    var leftX = Math.floor(cx - totalW / 2)
    var rightX = leftX + l.btnW + gap

    // 左：再入轮回
    ctx.save()
    ctx.globalAlpha = bOp
    ctx.fillStyle = 'rgba(200,168,124,0.18)'
    roundRect(ctx, leftX, l.btnY, l.btnW, l.btnH, 4)
    ctx.fill()
    ctx.strokeStyle = 'rgba(200,168,124,0.5)'
    ctx.lineWidth = 1
    roundRect(ctx, leftX, l.btnY, l.btnW, l.btnH, 4)
    ctx.stroke()
    ctx.fillStyle = 'rgba(200,168,124,0.9)'
    ctx.font = '13px ' + (ui.fontFamily || 'sans-serif')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('再入轮回', leftX + l.btnW / 2, l.btnY + l.btnH / 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.restore()

    // 右：返回主页
    ctx.save()
    ctx.globalAlpha = bOp
    ctx.fillStyle = 'rgba(200,168,124,0.10)'
    roundRect(ctx, rightX, l.btnY, l.btnW, l.btnH, 4)
    ctx.fill()
    ctx.strokeStyle = 'rgba(200,168,124,0.4)'
    ctx.lineWidth = 1
    roundRect(ctx, rightX, l.btnY, l.btnW, l.btnH, 4)
    ctx.stroke()
    ctx.fillStyle = 'rgba(200,168,124,0.75)'
    ctx.font = '13px ' + (ui.fontFamily || 'sans-serif')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('返回主页', rightX + l.btnW / 2, l.btnY + l.btnH / 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.restore()
  }
}

// v0.6.97: 简易文字拆行工具（按字符数估算宽度）
function splitText(text, maxWidth, fontSize) {
  if (!text) return ['']
  // 估算：每个汉字占 fontSize px，每个英文/标点占 fontSize/2 px
  var charWidth = fontSize  // 汉字
  var maxChars = Math.floor(maxWidth / charWidth) || 12
  var lines = []
  var currentLine = ''
  // 先按中文逗号、句号断句（保持碑文节奏感）
  var sentences = text.split(/([，。；！？、])/)
  for (var i = 0; i < sentences.length; i++) {
    var seg = sentences[i]
    if (!seg) continue
    if ((currentLine + seg).length <= maxChars) {
      currentLine += seg
    } else {
      if (currentLine) lines.push(currentLine)
      // 单段超长 → 硬断
      if (seg.length > maxChars) {
        for (var j = 0; j < seg.length; j += maxChars) {
          lines.push(seg.substring(j, j + maxChars))
        }
        currentLine = ''
      } else {
        currentLine = seg
      }
    }
  }
  if (currentLine) lines.push(currentLine)
  return lines.length ? lines : ['']
}

// ─── v0.7.11 测试墓志铭：云函数调用 + 骨架屏 ───
// （先生拍板 05:38：先跳转后生成，跟正常死亡流一致——墓碑页内部"加载中"）

// 骨架屏：墓碑灰色渲染 + 中央旋转环 + "史官落笔中…"
function drawTestPoemSkeleton(ctx) {
  var l = layout
  // 旋转环（用 ctx.rotate + 简单线段）
  var cx = l.cx
  var cy = l.tabletY + l.tabletH / 2
  ctx.save()
  ctx.translate(cx, cy - 30)
  ctx.rotate(testPoemLoadingStartTime > 0 ? (Date.now() - testPoemLoadingStartTime) / 500 : 0)
  ctx.strokeStyle = 'rgba(200,168,124,0.6)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, 0, 18, 0, Math.PI * 1.4)
  ctx.stroke()
  ctx.restore()
  // 文字
  if (testPoemError) {
    drawText(ctx, '生成失败', cx, cy + 16, {
      fontSize: 14,
      color: 'rgba(232,180,160,0.9)',  // 弱红色
      align: 'center', baseline: 'middle',
    })
    drawText(ctx, testPoemError, cx, cy + 38, {
      fontSize: 11,
      color: 'rgba(200,168,124,0.7)',
      align: 'center', baseline: 'middle',
      maxWidth: l.tabletW - 40,
    })
  } else {
    drawText(ctx, '史官落笔中…', cx, cy + 16, {
      fontSize: 14,
      color: 'rgba(232,221,208,0.85)',
      align: 'center', baseline: 'middle',
    })
    drawText(ctx, '（约 8-10 秒）', cx, cy + 38, {
      fontSize: 11,
      color: 'rgba(200,168,124,0.55)',
      align: 'center', baseline: 'middle',
    })
  }
}

function triggerTestPoemCloud() {
  if (testPoemLoading) return
  if (!testPoemCase) return
  testPoemLoading = true
  testPoemError = null
  testPoemLoadingStartTime = Date.now()

  var tc = testPoemCase
  if (typeof wx !== 'undefined' && wx.cloud) {
    wx.cloud.callFunction({
      name: 'ai_write_death',
      data: {
        state: {
          name: tc.name,
          gender: tc.gender,
          age: tc.age,
          occupation: tc.occupation,
          socialClass: tc.socialClass,
          dynasty: tc.dynasty,
          city: tc.city,
          year: tc.year,
          life_number: tc.life_number,
          lifespan: tc.lifespan,
        },
        narrativeHistory: tc.narrativeHistory,
        deathType: tc.deathType,
      },
      success: res => {
        testPoemLoading = false
        if (res && res.result && res.result.success) {
          // v0.7.11: 用 setTestPoemData 填数据 → render 下一帧填内容
          setTestPoemData({
            name: tc.name,
            dynasty: tc.dynasty,
            deathType: tc.deathType,
            deathCause: res.result.deathCause,
            epRecord: res.result.epRecord,
            epitaph: res.result.epitaph,
            highestAchievement: null,
            _deathState: {
              name: tc.name,
              dynasty: tc.dynasty,
              city: tc.city,
              eraDisplay: tc.year + '年',
              age: tc.age,
              life_number: tc.life_number,
              historical_shelter: 0,
              epitaph: res.result.epitaph,
            },
          })
          // 把这些字段也写到 deathState，让 render 用得到（getEpitaph/getEpRecord 兜底）
          deathState.epRecord = res.result.epRecord
          deathState.epitaph = res.result.epitaph
          deathCause = res.result.deathCause
          epRecord = res.result.epRecord
          // 标记测试模式已结束
          testPoemPending = false
          // v0.7.11 fix2: 数据 ready → 按钮 ready（先生 05:46 反馈）
          ready = true
        } else {
          testPoemError = (res && res.result && res.result.error) || '未知错误'
        }
      },
      fail: err => {
        testPoemLoading = false
        testPoemError = (err && err.errMsg) || '调用失败'
        // v0.7.11 fix2: 失败也要让按钮 ready（先生可以点返回主页）
        ready = true
      },
    })
  } else {
    testPoemLoading = false
    testPoemError = '微信环境不可用'
  }
}

module.exports = { init: init, render: render, onTouch: onTouch, autoNext: null }
