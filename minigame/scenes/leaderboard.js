// Leaderboard scene — 历史名人榜（独立场景，可从首页进入）

const ui = require('../engine/ui')
const { COLORS, getSystemInfo, drawBackground, drawText, hitTest, roundRect } = ui
const { FadeAnim, SlideFadeAnim } = require('../engine/anim')

var layout = {}
var anims = {}
var currentBoardIndex = 0
var leaderboardData = null
var leaderboardLoading = false
var ready = false

const BOARD_LIST = ['名医榜', '名将榜', '富商榜', '文豪榜', '能臣榜', '义士榜', '全能榜', '长寿榜', '旅行家榜', '颜值榜']

function calcLayout() {
  var sys = getSystemInfo()
  var w = sys.width
  var h = sys.height
  var cx = Math.floor(w / 2)

  layout = {
    w: w, h: h, cx: cx,
    padding: 12,
    titleY: 40,
    tabY: 80,
    contentY: 160,
    btnY: h - 60,
    btnW: 120,
    btnH: 40,
  }
}

function init() {
  calcLayout()
  ready = false
  leaderboardData = null
  leaderboardLoading = true
  currentBoardIndex = 0

  var now = Date.now()
  anims = {
    title: new FadeAnim(200, 500),
    tabs: new FadeAnim(400, 500),
    content: new FadeAnim(600, 500),
    btn: new SlideFadeAnim(8, 400, 800),
  }
  for (var k in anims) anims[k].start(now)

  fetchLeaderboardData()
  setTimeout(function() { ready = true }, 1000)
}

function fetchLeaderboardData() {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
    console.warn('[leaderboard] wx.cloud 不可用')
    leaderboardLoading = false
    return
  }

  wx.cloud.callFunction({
    name: 'leaderboard_query',
    data: { action: 'list' }
  }).then(function(res) {
    if (res.result && res.result.success) {
      var promises = BOARD_LIST.map(function(name) {
        return wx.cloud.callFunction({
          name: 'leaderboard_query',
          data: { action: 'detail', board: name }
        })
      })
      return Promise.all(promises)
    }
    throw new Error('获取榜单列表失败')
  }).then(function(results) {
    leaderboardData = {}
    for (var i = 0; i < results.length; i++) {
      var r = results[i]
      if (r.result && r.result.success && r.result.data) {
        leaderboardData[r.result.data.name] = r.result.data.characters || []
      }
    }
    leaderboardLoading = false
  }).catch(function(err) {
    console.error('[leaderboard] 获取失败:', err)
    leaderboardLoading = false
  })
}

function onTouch(x, y, type) {
  if (type !== 'end' || !ready) return null

  // Tab切换
  var tabW = 60
  var tabH = 28
  var tabGap = 6
  var tabStartX = layout.padding
  for (var i = 0; i < BOARD_LIST.length; i++) {
    var row = Math.floor(i / 5)
    var col = i % 5
    var tx = tabStartX + col * (tabW + tabGap)
    var ty = layout.tabY + row * (tabH + tabGap)
    if (hitTest(x, y, tx, ty, tabW, tabH)) {
      currentBoardIndex = i
      return null
    }
  }

  // 返回按钮
  var btnX = layout.cx - layout.btnW / 2
  if (hitTest(x, y, btnX, layout.btnY, layout.btnW, layout.btnH)) {
    return { scene: 'entry' }
  }

  return null
}

function render(ctx) {
  var w = layout.w
  var h = layout.h
  var cx = layout.cx
  var now = Date.now()

  drawBackground(ctx, w, h)

  // 标题
  var tOp = anims.title.update(now)
  if (tOp > 0) {
    drawText(ctx, '历 史 名 人 榜', cx, layout.titleY, {
      fontSize: 20,
      color: COLORS.goldLight,
      align: 'center', baseline: 'middle',
      opacity: tOp * 0.95,
      bold: true,
    })
  }

  // Tab栏（2行5列）
  var tabOp = anims.tabs.update(now)
  if (tabOp > 0) {
    var tabW = 60
    var tabH = 28
    var tabGap = 6
    var tabStartX = layout.padding
    ctx.save()
    ctx.globalAlpha = tabOp
    for (var i = 0; i < BOARD_LIST.length; i++) {
      var row = Math.floor(i / 5)
      var col = i % 5
      var tx = tabStartX + col * (tabW + tabGap)
      var ty = layout.tabY + row * (tabH + tabGap)
      var isSelected = (i === currentBoardIndex)

      roundRect(ctx, tx, ty, tabW, tabH, 4)
      ctx.fillStyle = isSelected ? 'rgba(192,48,48,0.8)' : 'rgba(30,25,20,0.6)'
      ctx.fill()
      ctx.strokeStyle = isSelected ? 'rgba(220,80,80,0.9)' : 'rgba(200,168,124,0.3)'
      ctx.lineWidth = isSelected ? 1.5 : 0.8
      ctx.stroke()

      drawText(ctx, BOARD_LIST[i], tx + tabW / 2, ty + tabH / 2, {
        fontSize: 12,
        color: isSelected ? COLORS.paper : 'rgba(200,168,124,0.7)',
        align: 'center', baseline: 'middle',
        opacity: tabOp,
        bold: isSelected,
      })
    }
    ctx.restore()
  }

  // 内容区
  var cOp = anims.content.update(now)
  if (cOp > 0) {
    ctx.save()
    ctx.globalAlpha = cOp

    if (leaderboardLoading) {
      drawText(ctx, '加载中...', cx, layout.contentY + 60, {
        fontSize: 14,
        color: COLORS.paper,
        align: 'center', baseline: 'middle',
        opacity: cOp * 0.6,
      })
    } else if (!leaderboardData || !leaderboardData[BOARD_LIST[currentBoardIndex]]) {
      drawText(ctx, '暂无数据', cx, layout.contentY + 60, {
        fontSize: 14,
        color: COLORS.paper,
        align: 'center', baseline: 'middle',
        opacity: cOp * 0.6,
      })
    } else {
      var chars = leaderboardData[BOARD_LIST[currentBoardIndex]]
      var rowH = 36
      var maxRows = Math.floor((layout.btnY - layout.contentY - 20) / rowH)
      var startY = layout.contentY

      for (var i = 0; i < Math.min(chars.length, maxRows); i++) {
        var char = chars[i]
        var ry = startY + i * rowH

        // 排名（前3名特殊颜色）
        var rankColor = i < 3 ? 'rgba(192,48,48,0.95)' : 'rgba(200,168,124,0.7)'
        drawText(ctx, String(i + 1), layout.padding + 20, ry + rowH / 2, {
          fontSize: 14,
          color: rankColor,
          align: 'center', baseline: 'middle',
          opacity: cOp,
          bold: i < 3,
        })

        // 姓名
        drawText(ctx, char.name, layout.padding + 60, ry + rowH / 2, {
          fontSize: 14,
          color: COLORS.paper,
          align: 'left', baseline: 'middle',
          opacity: cOp * 0.95,
        })

        // 朝代
        drawText(ctx, char.dynasty, layout.padding + 140, ry + rowH / 2, {
          fontSize: 11,
          color: 'rgba(200,168,124,0.6)',
          align: 'left', baseline: 'middle',
          opacity: cOp,
        })

        // 综合分
        drawText(ctx, char.综合分 + '分', w - layout.padding - 20, ry + rowH / 2, {
          fontSize: 13,
          color: COLORS.paperWarm,
          align: 'right', baseline: 'middle',
          opacity: cOp * 0.85,
        })

        // 分隔线
        if (i < chars.length - 1) {
          ctx.strokeStyle = 'rgba(200,168,124,0.1)'
          ctx.lineWidth = 0.5
          ctx.beginPath()
          ctx.moveTo(layout.padding + 20, ry + rowH)
          ctx.lineTo(w - layout.padding - 20, ry + rowH)
          ctx.stroke()
        }
      }

      if (chars.length > maxRows) {
        drawText(ctx, '显示前 ' + maxRows + ' 人，共 ' + chars.length + ' 人', cx, layout.btnY - 30, {
          fontSize: 10,
          color: 'rgba(200,168,124,0.5)',
          align: 'center', baseline: 'middle',
          opacity: cOp * 0.6,
        })
      }
    }
    ctx.restore()
  }

  // 返回按钮
  var bOp = anims.btn.update(now)
  if (bOp > 0) {
    var btnX = cx - layout.btnW / 2
    ctx.save()
    ctx.globalAlpha = bOp
    roundRect(ctx, btnX, layout.btnY, layout.btnW, layout.btnH, 6)
    ctx.fillStyle = 'rgba(30,25,20,0.7)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(200,168,124,0.5)'
    ctx.lineWidth = 1
    ctx.stroke()
    drawText(ctx, '返回', cx, layout.btnY + layout.btnH / 2, {
      fontSize: 15,
      color: COLORS.paper,
      align: 'center', baseline: 'middle',
      opacity: bOp * 0.9,
    })
    ctx.restore()
  }
}

module.exports = { init: init, render: render, onTouch: onTouch, autoNext: null }
