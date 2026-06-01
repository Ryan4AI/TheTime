// Minimal text render test for WeChat Mini Game
const canvas = wx.createCanvas()
const sys = wx.getSystemInfoSync()
canvas.width = sys.windowWidth
canvas.height = sys.windowHeight
const ctx = canvas.getContext('2d')

// Draw background
ctx.fillStyle = '#0f0c08'
ctx.fillRect(0, 0, canvas.width, canvas.height)

// Test 1: Simple default font
ctx.font = 'normal 30px sans-serif'
ctx.fillStyle = '#e8ddd0'
ctx.textAlign = 'center'
ctx.textBaseline = 'middle'
ctx.fillText('测试文字 Test', canvas.width / 2, canvas.height / 2 - 40)

// Test 2: PingFang
ctx.font = 'normal 30px "PingFang SC"'
ctx.fillStyle = '#c8a87c'
ctx.fillText('穿越日记 PingFang', canvas.width / 2, canvas.height / 2 + 10)

// Test 3: With save/restore
ctx.save()
ctx.font = 'normal 24px sans-serif'
ctx.fillStyle = '#a09080'
ctx.textAlign = 'center'
ctx.fillText('保存/恢复测试', canvas.width / 2, canvas.height / 2 + 60)
ctx.restore()
