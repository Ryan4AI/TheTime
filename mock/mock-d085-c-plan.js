// mock-d085-c-plan.js
// 目标：验证 D085 C 方案（wx.createInput 替换 wx.showKeyboard）的逻辑链路
// 用法：node mock-d085-c-plan.js

// ────────── mock wx ──────────
const _events = {}
const _createdInputs = []
let _inputCreateCount = 0

const wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, safeArea: { top: 47, bottom: 778 } }),

  // D085 新方案
  createInput: ({ x, y, width, height, ...rest }) => {
    _inputCreateCount++
    const instance = {
      _id: _inputCreateCount,
      _value: '',
      _listeners: {},
      x, y, width, height, ...rest,
      on(event, cb) {
        this._listeners[event] = cb
        console.log(`  [mock input#${this._id}] on('${event}')`)
      },
      off(event) {
        delete this._listeners[event]
        console.log(`  [mock input#${this._id}] off('${event}')`)
      },
      focus() {
        console.log(`  [mock input#${this._id}] focus() → 系统键盘应弹出`)
        if (this._listeners.focus) this._listeners.focus({})
      },
      blur() {
        console.log(`  [mock input#${this._id}] blur() → 系统键盘应收起`)
        if (this._listeners.blur) this._listeners.blur({})
      },
      _simulateUserInput(text) {
        this._value = text
        console.log(`  [mock input#${this._id}] 用户输入: "${text}"`)
        if (this._listeners.input) this._listeners.input({ value: text })
      },
      _simulateConfirm() {
        console.log(`  [mock input#${this._id}] 用户点发送, value="${this._value}"`)
        if (this._listeners.confirm) this._listeners.confirm({ value: this._value })
      },
    }
    _createdInputs.push(instance)
    console.log(`[mock] createInput #${_inputCreateCount} at (${x}, ${y}) ${width}x${height}`)
    return instance
  },

  // 旧的（D085 已废弃，但保留作为对照）
  showKeyboard: ({ success }) => {
    console.log('[mock] ❌ showKeyboard 被调（D085 C 方案已废弃，应该不调）')
    if (success) success()
  },
  onKeyboardHeightChange: (cb) => { _events.onKeyboardHeightChange = cb },

  // 兜底用
  showModal: ({ success }) => {
    console.log('[mock] showModal 兜底方案')
    if (success) success({ confirm: true, content: '兜底测试输入' })
  },
}

// ────────── mock game.js 模块 ──────────
// 加载真实 game.js 但用 mock wx 替换全局 wx
global.wx = wx

// 提取 game.js 的关键函数（避开 module.exports 包裹）
const fs = require('fs')
const path = require('path')
const gameSource = fs.readFileSync(
  path.join(__dirname, '..', 'minigame', 'scenes', 'game.js'),
  'utf8'
)

// 提取 module.exports 块中的函数定义
const varMatches = gameSource.match(/^var\s+\w+\s*=.*$/gm) || []
const funcMatches = gameSource.match(/^function\s+\w+\(.*?\)\s*\{/gm) || []

console.log('=== D085 C 方案 mock 测试 ===\n')
console.log(`游戏源文件：`)
console.log(`  var 声明：${varMatches.length} 个`)
console.log(`  function 定义：${funcMatches.length} 个`)
console.log()

// ────────── 直接验证 game.js 代码完整性 ──────────
const checks = [
  { name: 'D085 createFreeInput 函数存在', re: /function createFreeInput\(\)/ },
  { name: 'D085 wx.createInput 调用存在', re: /wx\.createInput\(/ },
  { name: 'D085 input.on("confirm") 存在', re: /freeInputInstance\.on\(['"]confirm['"]/ },
  { name: 'D085 freeInputInstance 全局变量存在', re: /var freeInputInstance/ },
  { name: 'D085 删 drawFreeInputButton 函数（旧版）', re: /function drawFreeInputButton/, expectAbsent: true },
  { name: 'D085 drawFreeInputButton(ctx) 调用已删', re: /drawFreeInputButton\(ctx\)/, expectAbsent: true },
  { name: 'D085 handleFreeInput 重写（C 方案）', re: /function handleFreeInput\(\)[\s\S]{0,500}freeInputInstance/ },
  { name: 'D085 删 _freeInputBtn hitTest', re: /hitTest\(.*_freeInputBtn/, expectAbsent: true },
  { name: 'D085 删 freeInputText 重置', re: /freeInputText\s*=\s*['"]{2}/, expectAbsent: true },
  { name: 'D085 layout._optionY_override 同步', re: /layout\._optionY_override = freeBottom/ },
  { name: 'D076 drawFreeInputButton 注释保留', re: /D085[\s\S]{0,200}drawFreeInputButton 已废弃/ },
  { name: 'D085 init 调用 createFreeInput', re: /initLayout\(\)[\s\S]{0,200}createFreeInput\(\)/ },
]

console.log('--- 代码完整性检查 ---')
let passCount = 0
let failCount = 0
for (const check of checks) {
  const found = check.re.test(gameSource)
  const passed = check.expectAbsent ? !found : found
  if (passed) {
    console.log(`  ✅ ${check.name}`)
    passCount++
  } else {
    console.log(`  ❌ ${check.name}`)
    failCount++
  }
}
console.log(`\n  通过：${passCount}/${checks.length}`)
if (failCount > 0) {
  console.log(`  ⚠️ 有 ${failCount} 项未通过，先生拍板前必须修`)
  process.exit(1)
}

// ────────── 语法检查 ──────────
console.log('\n--- 语法检查（node -c）---')
const { execSync } = require('child_process')
try {
  execSync(`node -c "${path.join(__dirname, '..', 'minigame', 'scenes', 'game.js')}"`, { stdio: 'pipe' })
  console.log('  ✅ game.js 语法 OK')
} catch (e) {
  console.log('  ❌ game.js 语法错：')
  console.log(e.stderr.toString())
  process.exit(1)
}

console.log('\n=== Mock 检查完成 ===')
console.log()
console.log('⚠️ PMO 提示：')
console.log('  - 逻辑链路 OK（代码完整性 + 语法）')
console.log('  - 但 wx.createInput 真机行为（样式/层级/位置）只有真机测才能验证')
console.log('  - 先生上传后真机测：① 输入框出现 ② 玩家点 → 键盘弹 ③ 输入文字 → 文字进 input ④ 点发送 → callAI 触发')
console.log('  - 若 input 位置/样式不满意，再迭代（保留 _optionY_override 字段方便调整）')