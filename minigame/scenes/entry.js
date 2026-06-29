// Entry scene — 穿越日记 · 古风入口
// 中国水墨画风格：留白、写意、含蓄
// 月亮高悬冷光、墨山层叠、题诗式标题

const ui = require('../engine/ui')
const {
  COLORS, getSystemInfo, drawBackground,
  drawText, drawButton, drawPrimaryButton, hitTest, roundRect
} = ui
const { CharAnim, SlideFadeAnim, FadeAnim } = require('../engine/anim')

const TITLE = '穿越日记'
const SUBTITLE = '留名青史，或无名而亡'
const BTN_START = '踏入长河'
const BTN_LEADERBOARD = '金榜题名'
const BTN_TEST_POEM = '追忆前尘'  // v3.0.6
const FOOTER = 'AI演绎 · 历史真实数据'

// v0.7.11: 测试墓志铭按钮 → 直接切到 death scene，由 death.js 内部画骨架屏+调云函数
// （不再做蒙层拦截，蒙层是过度设计——先生拍板 05:38）

// 3 个测试样例（先生不同时跑能看出多样性）
const TEST_CASES = [
  {
    name: '韩守安', gender: '男', age: 65, occupation: '伙夫', socialClass: '寒门',
    dynasty: '西汉', city: '长安', year: 160, life_number: 1,
    lifespan: 70, deathType: '寿终',
    narrativeHistory: [
      { role: 'ai', content: '韩守安生于长安东市一户贫家，幼年丧父，靠母亲纺织为生。' },
      { role: 'user', content: '我去学手艺' },
      { role: 'ai', content: '韩守安拜入东市某馆为伙夫，主以严苛闻名。韩某谨事二十余年，未尝有失。' },
      { role: 'user', content: '娶妻' },
      { role: 'ai', content: '韩守安娶同里张氏为妻，育二子一女。' },
      { role: 'user', content: '继续' },
      { role: 'ai', content: '长子夭于元鼎二年疫，韩守安哀痛数日，次日仍按时上工。' },
      { role: 'user', content: '暮年' },
      { role: 'ai', content: '暮年告归，卧病三月，殁于家。' },
    ],
  },
  {
    name: '沈青禾', gender: '女', age: 28, occupation: '女医', socialClass: '平民',
    dynasty: '北宋', city: '开封', year: 1075, life_number: 1,
    lifespan: 75, deathType: '意外',
    narrativeHistory: [
      { role: 'ai', content: '沈青禾自幼随父习医，能辨百草。' },
      { role: 'user', content: '我去城里行医' },
      { role: 'ai', content: '沈青禾在开封城南悬壶济世，尤擅治小儿痘疹，活人无数。' },
      { role: 'user', content: '遇到瘟疫' },
      { role: 'ai', content: '瘟疫流行，沈青禾日夜诊治，不幸染病。' },
    ],
  },
  {
    name: '王守诚', gender: '男', age: 55, occupation: '商贾', socialClass: '官宦',
    dynasty: '南宋', city: '临安', year: 1180, life_number: 1,
    lifespan: 60, deathType: '社会性',
    narrativeHistory: [
      { role: 'ai', content: '王守诚为临安巨贾，贩丝帛通南北，家资巨万。' },
      { role: 'user', content: '继续' },
      { role: 'ai', content: '王守诚被诬通敌，抄家没产，妻离子散。' },
    ],
  },
]

let layout = {}
let anims = null

function calcLayout() {
  var sys = getSystemInfo()
  var w = sys.width
  var h = sys.height
  var cx = Math.floor(w / 2)

  // Moon: high up, cold blue-white
  var moonR = Math.floor(Math.min(w * 0.22, h * 0.15))
  var moonY = Math.floor(h * 0.12 + moonR)

  // Mountains: subtle ink wash at bottom
  var mtY = Math.floor(h * 0.72)
  var mtH = Math.floor(h * 0.28)

  // Title: poem inscription style, small and elegant
  var titleS = Math.min(42, Math.floor(w * 0.10))
  var titleY = Math.floor(h * 0.32)
  var titleAreaW = Math.floor(Math.min(w * 0.65, titleS * 5.5))
  var charSpacing = Math.floor(titleAreaW / TITLE.length)
  var titleStartX = Math.floor(cx - (TITLE.length - 1) * charSpacing / 2)

  // Subtitle
  var subS = Math.min(14, Math.floor(w * 0.037))
  var subY = Math.floor(titleY + titleS * 0.55 + 18)

  // Decorative line
  var divW = Math.min(60, Math.floor(w * 0.16))
  var divY = Math.floor(subY + 18)

  // Buttons
  var btnW = Math.min(200, Math.floor(w * 0.52))
  var btnH = Math.min(64, Math.floor(w * 0.17))
  var btnS = Math.min(18, Math.floor(w * 0.048))
  var btnX = Math.floor(cx - btnW / 2)
  var btnY1 = Math.floor(h * 0.60)
  var btnY2 = Math.floor(btnY1 + btnH + 8)
  var btnY3 = Math.floor(btnY2 + btnH + 8)  // v0.7.0: 测试墓志铭按钮

  // Footer
  var footerS = Math.min(10, Math.floor(w * 0.028))
  var footerY = Math.floor(h - 36)

  layout = {
    w: w, h: h, cx: cx,
    moonR: moonR, moonY: moonY,
    mtY: mtY, mtH: mtH,
    titleS: titleS, titleY: titleY,
    charSpacing: charSpacing, titleStartX: titleStartX,
    subS: subS, subY: subY,
    divW: divW, divY: divY,
    btnW: btnW, btnH: btnH, btnS: btnS,
    btnX: btnX, btnY1: btnY1, btnY2: btnY2, btnY3: btnY3,
    footerS: footerS, footerY: footerY,
  }
}

function init() {
  calcLayout()
  var now = Date.now()

  anims = {
    moon: new FadeAnim(200, 1500),
    mountains: new FadeAnim(400, 1200),
    title: new CharAnim(TITLE, 100, 500),
    subtitle: new SlideFadeAnim(6, 300, 600),
    divider: new SlideFadeAnim(1, 400, 900),
    btnStart: new SlideFadeAnim(8, 400, 1000),
    btnLeaderboard: new SlideFadeAnim(8, 300, 1200),
    footer: new SlideFadeAnim(3, 200, 1400),
  }

  for (var key in anims) anims[key].start(now)

  // D049 修复 v9（2026-06-30 01:12 拍板）：init 调 player_load 时设 loading=true
  // 真因：先生 01:10 反馈"v8 直接进入叙事页但重新生成"——说明先生重进时
  //   init 异步 player_load 还没回就点踏入长河 → cloudSave 空 → 走 v4 路径 else 走 selection
  //   然后 v8 1.5s 后才补跳 game——但先生已经在 selection，1.5s 后 game 跳出来
  //   → 先生看到 game 但 cloudNarrateHistory 还在 loading 状态（异步没回）
  // 修复：init 时设 loading=true，渲染时画"加载存档中..."提示
  //   玩家看到 loading 提示，知道要等 1-2 秒再点踏入长河
  //   异步 player_load 回来后设 loading=false（隐藏提示）
  layout.loading = true
  layout.loadingText = '正在加载存档...'

  if (typeof wx !== 'undefined' && wx.cloud && wx.cloud.callFunction) {
    try {
      wx.cloud.callFunction({
        name: 'player_load',
        data: {},
        success: (res) => {
          const r = (res && res.result) || {}
          if (r.openid && typeof wx.setStorageSync === 'function') {
            wx.setStorageSync('openid', r.openid)
          }
          if (r.success && r.player_life && r.player_life.alive) {
            // 有云端 alive 存档 → 存到 storage, onTouch 用
            if (typeof wx.setStorageSync === 'function') {
              wx.setStorageSync('cloud_save_data', {
                player: r.player,
                player_life: r.player_life,
                narrate_history: r.narrate_history_list || []
              })
              console.log('[D049-fix-v3] entry 找到云端存档, life=', r.player.life_number)
            }
            // D049 修复 v9：异步回来后设 loading=false
            layout.loading = false
            layout.loadingText = ''
          } else {
            if (typeof wx.setStorageSync === 'function') {
              wx.setStorageSync('cloud_save_data', null)
            }
            layout.loading = false
            layout.loadingText = ''
          }
        },
        fail: (err) => {
          console.error('[D049-fix-v3] entry player_load 失败:', err && (err.errMsg || err.message))
          layout.loading = false
          layout.loadingText = ''
        }
      })
    } catch (e) {
      console.error('[D049-fix-v3] entry player_load 异常:', e.message)
    }
  }
}

// ─── Ink wash mountain range ───
function drawMountains(ctx) {
  var w = layout.w
  var h = layout.h
  var baseY = layout.mtY
  var mtH = layout.mtH
  var op = anims.mountains.update(Date.now())
  if (op <= 0) return

  ctx.save()
  ctx.globalAlpha = op

  // Ink wash gradient
  var grad = ctx.createLinearGradient(0, baseY, 0, h)
  grad.addColorStop(0, 'rgba(200,168,124,0)')
  grad.addColorStop(0.15, 'rgba(200,168,124,0.02)')
  grad.addColorStop(0.5, 'rgba(200,168,124,0.04)')
  grad.addColorStop(1, 'rgba(200,168,124,0.06)')
  ctx.fillStyle = grad
  ctx.fillRect(0, baseY, w, mtH)

  // Back mountains — lighter, softer
  ctx.fillStyle = 'rgba(200,168,124,0.02)'
  ctx.beginPath()
  ctx.moveTo(0, h)
  ctx.quadraticCurveTo(w * 0.12, baseY - mtH * 0.55, w * 0.25, baseY - mtH * 0.35)
  ctx.quadraticCurveTo(w * 0.38, baseY - mtH * 0.7, w * 0.5, baseY - mtH * 0.25)
  ctx.quadraticCurveTo(w * 0.62, baseY - mtH * 0.5, w * 0.75, baseY - mtH * 0.3)
  ctx.quadraticCurveTo(w * 0.88, baseY - mtH * 0.45, w, baseY - mtH * 0.28)
  ctx.lineTo(w, h)
  ctx.lineTo(0, h)
  ctx.closePath()
  ctx.fill()

  // Front mountains — more defined
  ctx.fillStyle = 'rgba(200,168,124,0.035)'
  ctx.beginPath()
  ctx.moveTo(0, h)
  ctx.quadraticCurveTo(w * 0.1, baseY - mtH * 0.2, w * 0.2, baseY + mtH * 0.05)
  ctx.quadraticCurveTo(w * 0.3, baseY - mtH * 0.35, w * 0.4, baseY - mtH * 0.12)
  ctx.quadraticCurveTo(w * 0.48, baseY - mtH * 0.45, w * 0.55, baseY - mtH * 0.08)
  ctx.quadraticCurveTo(w * 0.6, baseY - mtH * 0.3, w * 0.68, baseY)
  ctx.quadraticCurveTo(w * 0.75, baseY - mtH * 0.2, w * 0.82, baseY - mtH * 0.05)
  ctx.quadraticCurveTo(w * 0.9, baseY - mtH * 0.25, w, baseY - mtH * 0.1)
  ctx.lineTo(w, h)
  ctx.lineTo(0, h)
  ctx.closePath()
  ctx.fill()

  ctx.restore()
}

// ─── Moon glow — cold/blue-tinted, dim ───
function drawMoon(ctx) {
  var l = layout
  var cx = l.cx
  var op = anims.moon.update(Date.now())
  if (op <= 0) return

  ctx.save()
  ctx.globalAlpha = op

  // Outer glow
  var grad = ctx.createRadialGradient(cx, l.moonY, 0, cx, l.moonY, l.moonR * 1.5)
  grad.addColorStop(0, 'rgba(180,195,210,' + (0.10 * op) + ')')
  grad.addColorStop(0.5, 'rgba(180,195,210,' + (0.04 * op) + ')')
  grad.addColorStop(1, 'rgba(180,195,210,0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(cx, l.moonY, l.moonR * 1.5, 0, Math.PI * 2)
  ctx.fill()

  // Moon disc
  ctx.fillStyle = 'rgba(210,220,230,' + (0.35 * op) + ')'
  ctx.beginPath()
  ctx.arc(cx, l.moonY, l.moonR, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

// ─── Subtle cloud wisps ───
function drawClouds(ctx) {
  var w = layout.w
  var now = Date.now()
  ctx.save()

  var cloudY = Math.floor(layout.moonY + layout.moonR * 0.3)
  var baseOp = 0.04

  var offsets = [{ x: 0.1, s: 0.15 }, { x: 0.45, s: 0.12 }, { x: 0.75, s: 0.1 }]
  for (var i = 0; i < offsets.length; i++) {
    var drift = (now * 0.00003 + i * 2000) % 80 - 40
    var x = w * offsets[i].x + drift
    var size = w * offsets[i].s

    ctx.fillStyle = 'rgba(180,195,210,' + baseOp + ')'
    ctx.beginPath()
    ctx.ellipse(x, cloudY + i * 15, size, size * 0.25, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

// ─── Decorative traditional corner ───
function drawCornerDecoration(ctx) {
  var w = layout.w
  var h = layout.h
  var op = anims.subtitle.update(Date.now()).opacity
  ctx.save()
  ctx.globalAlpha = op * 0.15

  var m = 12
  var len = 18
  var gap = 4

  ctx.strokeStyle = COLORS.goldLight
  ctx.lineWidth = 1
  ;[[m + gap, m], [w - m - gap, m], [w - m - gap, h - m], [m + gap, h - m]].forEach(function(p, idx) {
    ctx.beginPath()
    if (idx < 2) {
      ctx.moveTo(p[0], p[1])
      ctx.lineTo(p[0], p[1] + gap)
      ctx.lineTo(p[0] + (idx === 0 ? -gap : gap), p[1] + gap)
    } else {
      ctx.moveTo(p[0], p[1])
      ctx.lineTo(p[0], p[1] - gap)
      ctx.lineTo(p[0] + (idx === 3 ? -gap : gap), p[1] - gap)
    }
    ctx.stroke()
  })

  ctx.restore()
}

// ─── Render ───
function render(ctx) {
  var w = layout.w
  var h = layout.h
  var cx = layout.cx
  var now = Date.now()
  var l = layout

  // 1. Background
  drawBackground(ctx, w, h)

  // 2. Moon
  drawMoon(ctx)

  // 3. Clouds
  drawClouds(ctx)

  // 4. Mountains
  drawMountains(ctx)

  // 5. Corner decorations
  drawCornerDecoration(ctx)

  // 6. Title
  for (var i = 0; i < TITLE.length; i++) {
    var op = anims.title.getCharOpacity(now, i)
    if (op <= 0) continue
    var chx = l.titleStartX + i * l.charSpacing

    ctx.save()
    if (op > 0.3) {
      ctx.shadowColor = 'rgba(220,180,130,' + ((op - 0.3) * 0.15) + ')'
      ctx.shadowBlur = 10
    }
    drawText(ctx, TITLE[i], chx, l.titleY, {
      fontSize: l.titleS,
      color: COLORS.goldLight,
      opacity: Math.min(1, op * 1.1),
      bold: true,
    })
    ctx.restore()
  }

  // 7. Subtitle
  var s2 = anims.subtitle.update(now)
  if (s2.opacity > 0) {
    drawText(ctx, SUBTITLE, cx, l.subY + s2.y, {
      fontSize: l.subS,
      color: COLORS.paperDim,
      opacity: s2.opacity * 0.75,
    })
  }

  // 8. Decorative line
  var d = anims.divider.update(now)
  if (d.opacity > 0) {
    ctx.save()
    ctx.globalAlpha = 0.2 * d.opacity
    ctx.strokeStyle = COLORS.gold
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(cx - l.divW / 2, l.divY + d.y)
    ctx.lineTo(cx + l.divW / 2, l.divY + d.y)
    ctx.stroke()
    ctx.restore()
  }

  // 9. Buttons (static position for hit test consistency)
  var b1 = anims.btnStart.update(now)
  var b2 = anims.btnLeaderboard.update(now)
  if (b1.opacity > 0) {
    drawPrimaryButton(ctx, l.btnX, l.btnY1, l.btnW, l.btnH, BTN_START,
      { fontSize: l.btnS, opacity: b1.opacity })
  }
  if (b2.opacity > 0) {
    drawButton(ctx, l.btnX, l.btnY2, l.btnW, l.btnH, BTN_LEADERBOARD,
      { fontSize: l.btnS, opacity: b2.opacity })
  }

  // 9.5 v0.7.0: 测试墓志铭按钮（更小，灰色）
  var b3 = anims.btnTestPoem ? anims.btnTestPoem.update(now) : { opacity: 1 }
  if (b3.opacity > 0) {
    drawButton(ctx, l.btnX, l.btnY3, l.btnW, l.btnH, BTN_TEST_POEM,
      { fontSize: l.btnS - 2, opacity: b3.opacity * 0.7 })
  }

  // D049 修复 v9（2026-06-30 01:12 拍板）：loading 提示
  // 画在"踏入长河"按钮下方，让玩家知道要等 1-2 秒再点
  if (layout.loading && layout.loadingText) {
    ctx.save()
    ctx.fillStyle = 'rgba(232,200,130,0.85)'  // 暖金提示色
    ctx.font = '14px ' + (ui.fontFamily || 'sans-serif')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(layout.loadingText, l.cx, l.btnY1 + l.btnH + 28)
    ctx.restore()
  }

  // 9.7 v0.7.11: 测试按钮不再画蒙层（已删除蒙层逻辑）
  // （先生拍板 05:38：直接跳转到 death scene，由 death.js 内部画骨架屏）

  // 10. Footer
  var f = anims.footer.update(now)
  if (f.opacity > 0) {
    drawText(ctx, FOOTER, cx, l.footerY + f.y, {
      fontSize: l.footerS,
      color: COLORS.paperDarker,
      opacity: f.opacity * 0.4,
    })
  }
}

// ─── Touch ───
function onTouch(x, y, type) {
  if (type === 'end') {
    var l = layout

    // v0.7.11: 测试墓志铭按钮（btnY3）— 1 次点击 → 直接切到 death scene
    // （不再蒙层、不再弹窗，先生拍板 05:38：先跳转后生成）
    if (l.btnY3 && hitTest(x, y, l.btnX, l.btnY3, l.btnW, l.btnH)) {
      var idx = Math.floor(Math.random() * TEST_CASES.length)
      var tc = TEST_CASES[idx]
      // v0.7.11 fix: 把 testPoemPending/testPoemCase 塞到 identity 对象里
      // （game.js switchScene 把 params.identity 直接传给 death.init，null 会丢字段）
      return {
        scene: 'death',
        items: [],
        identity: { testPoemPending: true, testPoemCase: tc },
        gender: tc.gender,
      }
    }

    // D049 修复 v4（2026-06-30 00:30 拍板）：点"踏入长河"前同步调 player_load
    // 之前 init 异步调的 player_load 可能还没回来（先生立即点"踏入长河"快过网络）
    // → cloud_save_data 为空 → 走 selection → 重头
    // 修复：onTouch 时如果 cloud_save_data 没值，同步调一次 player_load（不等回调，跳 game）
    var cloudSave = null
    var openid = null
    try {
      if (typeof wx !== 'undefined' && wx.getStorageSync) {
        cloudSave = wx.getStorageSync('cloud_save_data')
        openid = wx.getStorageSync('openid')
      }
    } catch (e) { /* ignore */ }

    if (!cloudSave || !cloudSave.player || !cloudSave.player_life || !cloudSave.player_life.alive) {
      // D049 修复 v8（2026-06-30 01:10 拍板）：cloud_save_data 空时再调一次 player_load + 延迟 1.5 秒
      // 真因：先生 01:07 反馈"还是重新生成"——先生进 entry 后立即点"踏入长河"（< 1 秒）
      //   init 异步调 player_load 还没回 → cloud_save_data 空 → 走 selection → 走新玩家流程
      //   → identity 来自 generate_identity（不是 fromCloud）→ game.init 调 callAI → 重新生成
      // 修复：cloud_save_data 空时再调一次 player_load + setTimeout 1.5s 后再处理
      //   1.5s 内 player_load 回调回来 → 跳 game（用云端 state）
      //   1.5s 后还没回 → 走 selection（新玩家）
      if (typeof wx !== 'undefined' && wx.cloud && wx.cloud.callFunction) {
        wx.cloud.callFunction({
          name: 'player_load',
          data: {},
          success: (res) => {
            const r = (res && res.result) || {}
            if (r.openid && typeof wx.setStorageSync === 'function') {
              wx.setStorageSync('openid', r.openid)
            }
            if (r.success && r.player_life && r.player_life.alive) {
              if (typeof wx.setStorageSync === 'function') {
                wx.setStorageSync('cloud_save_data', {
                  player: r.player,
                  player_life: r.player_life,
                  narrate_history: r.narrate_history_list || []
                })
                console.log('[D049-fix-v8] onTouch 二次 player_load 找到云端存档, life=', r.player.life_number)
              }
            } else {
              if (typeof wx.setStorageSync === 'function') {
                wx.setStorageSync('cloud_save_data', null)
              }
            }
          }
        })
        // setTimeout 1.5 秒后再决定跳哪个 scene
        setTimeout(function() {
          var cs = null
          try { cs = wx.getStorageSync && wx.getStorageSync('cloud_save_data') } catch (e) {}
          if (cs && cs.player && cs.player_life && cs.player_life.alive) {
            var life2 = cs.player_life
            var ri = {
              life_number: life2.life_number, name: life2.name, gender: life2.gender, age: life2.age,
              occupation: life2.occupation, social_class: life2.social_class,
              dynasty: life2.dynasty, eraDisplay: life2.era_display, city: life2.city, year: life2.year,
              '声望': life2.reputation, '财富': life2.wealth, '学识': life2.knowledge, '颜值': life2.appearance,
              '医术': life2.medical, '战功': life2.military, '文采': life2.literary, '政绩': life2.political, '义行': life2.righteous,
              fromCloud: true, cloudPlayer: cs.player, cloudNarrateHistory: cs.narrate_history || [],
            }
            console.log('[D049-fix-v8] 1.5s 后跳 game, life=', life2.life_number)
            // 用 module.exports.autoNext 让 game.js 切场景
            if (module.exports.autoNext !== undefined) {
              module.exports.autoNext = { scene: 'game', items: life2.current_items || [], identity: ri }
            }
          }
        }, 1500)
      }
      console.log('[D049-fix-v8] cloud_save_data 空, onTouch 二次 player_load + 等 1.5s, 暂时走 selection')
      return { scene: 'selection' }
    }

    var life = cloudSave.player_life
    var restoredIdentity = {
      life_number: life.life_number,
      name: life.name,
      gender: life.gender,
      age: life.age,
      occupation: life.occupation,
      social_class: life.social_class,
      dynasty: life.dynasty,
      eraDisplay: life.era_display,
      city: life.city,
      year: life.year,
      // 9 属性
      '声望': life.reputation,
      '财富': life.wealth,
      '学识': life.knowledge,
      '颜值': life.appearance,
      '医术': life.medical,
      '战功': life.military,
      '文采': life.literary,
      '政绩': life.political,
      '义行': life.righteous,
      fromCloud: true,
      cloudPlayer: cloudSave.player,
      cloudNarrateHistory: cloudSave.narrate_history || [],
    }
    console.log('[D049-fix-v4] entry 踏入长河 → 直接进 game（用云端存档）, life=', life.life_number)
    return {
      scene: 'game',
      items: life.current_items || [],
      identity: restoredIdentity,
    }
  }
  return null
}

// v0.7.0: 简易文字拆行（保留，entry.js 不直接用）
function splitText(text, maxWidth, fontSize) {
  if (!text) return ['']
  var charWidth = fontSize
  var maxChars = Math.floor(maxWidth / charWidth) || 12
  var lines = []
  var currentLine = ''
  var sentences = text.split(/([，。；！？、])/)
  for (var i = 0; i < sentences.length; i++) {
    var seg = sentences[i]
    if (!seg) continue
    if ((currentLine + seg).length <= maxChars) {
      currentLine += seg
    } else {
      if (currentLine) lines.push(currentLine)
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

module.exports = { init: init, render: render, onTouch: onTouch, autoNext: null }
