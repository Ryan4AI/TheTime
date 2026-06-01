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
        s.init(items, identity, gender)
      } else {
        s.init()
      }
    }
  }
}

// Register scenes
var sceneNames = ['entry', 'selection', 'intro', 'identity', 'game', 'death', 'records']
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

// Must register onTouchStart for onTouchEnd to work on some devices
wx.onTouchStart(function() {})
wx.onTouchEnd(function(e) {
  if (e.changedTouches && e.changedTouches.length > 0) {
    var tx = Math.floor(e.changedTouches[0].clientX)
    var ty = Math.floor(e.changedTouches[0].clientY)
    _g.tapX = tx
    _g.tapY = ty
    _g.tapTime = Date.now()
    
    // Process touch immediately
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
