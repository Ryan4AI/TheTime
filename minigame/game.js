/**
 * 穿越日记 · TheTime - Mini Game Entry
 * Scene management + full UI
 * Uses clientX/clientY (standard Touch API, not x/y)
 */
var canvas = wx.createCanvas()
var sys = wx.getSystemInfoSync()
var dpr = sys.pixelRatio || 1
var cssW = sys.windowWidth
var cssH = sys.windowHeight
canvas.width = cssW * dpr
canvas.height = cssH * dpr
var ctx = canvas.getContext('2d')
ctx.scale(dpr, dpr)

const ui = require('./engine/ui')

// 云开发初始化
wx.cloud.init({
  env: 'cloud1-d5gkbowyvbd1c85e1'
})

// Load custom font
var fontName = wx.loadFont('./res/font/NotoSerifSC.ttf')
if (fontName) {
  ui.setCustomFont(fontName)
}

// Scene management
var scenes = {}
var currentScene = null
var sceneParams = null

function switchScene(name, params) {
  var s = scenes[name]
  if (s) {
    currentScene = name
    sceneParams = params || null
    if (s.init) {
      if (sceneParams) {
        var items = (sceneParams && sceneParams.items) || []
        var identity = (sceneParams && sceneParams.identity) || null
        var gender = (sceneParams && sceneParams.gender) || null
        // v0.6.97: 把 autoNext 顶层字段（deathCause / epRecord / epitaph / deathType / highestAchievement）合并到 identity
        // death scene 的 init(items, identity, gender) 第二个参数是 identity
        if (identity && name === 'death') {
          if (params.deathCause !== undefined) identity.deathCause = params.deathCause
          if (params.epRecord !== undefined) identity.epRecord = params.epRecord
          if (params.epitaph !== undefined) identity.epitaph = params.epitaph
          if (params.deathType !== undefined) identity.deathType = params.deathType
          if (params.highestAchievement !== undefined) identity.highestAchievement = params.highestAchievement
          // v0.7.11: testPoemPending/testPoemCase 由 entry.js 直接放到 identity 对象里（不在顶层）
        }
        s.init(items, identity, gender)
      } else {
        s.init()
      }
    }
  }
}

// Register scenes
var sceneNames = ['entry', 'selection', 'intro', 'identity', 'game', 'death', 'leaderboard']
for (var si = 0; si < sceneNames.length; si++) {
  try {
    scenes[sceneNames[si]] = require('./scenes/' + sceneNames[si])
  } catch(e) {
    // Skip missing scenes
  }
}
switchScene('entry')

// Touch state
var _g = { tapX: -1, tapY: -1, tapTime: 0 }

// 转发触摸事件到当前场景
function sendTouch(x, y, type) {
  if (currentScene) {
    var s = scenes[currentScene]
    if (s && s.onTouch) {
      s.onTouch(x, y, type)
    }
  }
}

wx.onTouchStart(function(e) {
  if (e.touches && e.touches.length > 0) {
    sendTouch(Math.floor(e.touches[0].clientX), Math.floor(e.touches[0].clientY), 'start')
  }
})
wx.onTouchMove(function(e) {
  if (e.touches && e.touches.length > 0) {
    sendTouch(Math.floor(e.touches[0].clientX), Math.floor(e.touches[0].clientY), 'move')
  }
})
wx.onTouchEnd(function(e) {
  if (e.changedTouches && e.changedTouches.length > 0) {
    var tx = Math.floor(e.changedTouches[0].clientX)
    var ty = Math.floor(e.changedTouches[0].clientY)
    _g.tapX = tx
    _g.tapY = ty
    _g.tapTime = Date.now()

    // 转发 end 事件
    if (currentScene) {
      var s = scenes[currentScene]
      if (s && s.onTouch) {
        var result = s.onTouch(tx, ty, 'end')
        if (result && result.scene && scenes[result.scene]) {
          switchScene(result.scene, result)
        }
      }
    }

  }
})

function render() {
  try {
    ctx.clearRect(0, 0, cssW, cssH)
    
    if (currentScene) {
      var s = scenes[currentScene]
      if (s && s.render) {
        s.render(ctx)
        // Auto scene switch (for intro transitions, etc.)
        if (s.autoNext) {
          var an = s.autoNext
          s.autoNext = null
          switchScene(an.scene, an)
        }
      }
      // Tap indicator (no debug text)
      if (_g.tapX >= 0) {
        var elapsed = Date.now() - _g.tapTime
        if (elapsed > 500) {
          _g.tapX = -1
        } else {
          var alpha = 1 - elapsed / 500
          ctx.save()
          ctx.strokeStyle = 'rgba(200,168,124,' + (alpha * 0.8) + ')'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(_g.tapX, _g.tapY, 12 + (1 - alpha) * 20, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }
      }
    }
    
  } catch(e) {
    ctx.font = '14px sans-serif'
    ctx.fillStyle = '#e04040'
    ctx.textAlign = 'center'
    ctx.fillText('Error: ' + e.message, cssW / 2, cssH / 2)
  }
}

var loop = function() { render(); requestAnimationFrame(loop) }
requestAnimationFrame(loop)
