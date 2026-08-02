// mock-c-input-component.js
// 目标：验证 wx.createInput 在 Canvas 模式下能否替代 wx.showKeyboard + 内嵌输入框
// 用法：node mock-c-input-component.js

const path = require('path')

// ────────── mock wx ──────────
const _events = {}
const wx = {
  // 现有
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, safeArea: { bottom: 778 } }),
  showKeyboard: ({ defaultValue, maxLength, confirmType, success, fail }) => {
    console.log('[mock] showKeyboard 被调（这是我们要避免的双重弹起）')
    if (success) success()
  },
  onKeyboardInput: (cb) => { _events.onKeyboardInput = cb },
  onKeyboardConfirm: (cb) => { _events.onKeyboardConfirm = cb },
  offKeyboardInput: () => { delete _events.onKeyboardInput },
  offKeyboardConfirm: () => { delete _events.onKeyboardConfirm },
  hideKeyboard: () => console.log('[mock] hideKeyboard'),

  // 新方案 C 用的
  createInput: ({ x, y, width, height, ...rest }) => {
    console.log('[mock] createInput 参数:', { x, y, width, height, ...rest })
    return {
      _value: '',
      _listeners: {},
      on(event, cb) {
        this._listeners[event] = cb
        console.log('[mock] input.on 监听:', event)
      },
      off(event) {
        delete this._listeners[event]
        console.log('[mock] input.off 取消:', event)
      },
      focus() { console.log('[mock] input.focus() → 系统键盘应自动弹出') },
      blur() { console.log('[mock] input.blur() → 系统键盘应自动收起') },
      // 模拟：用户从键盘输入 '你好你好你好'
      _simulateUserInput(text) {
        this._value = text
        console.log('[mock] 用户输入了:', text)
        if (this._listeners.input) this._listeners.input({ value: text })
      },
      // 模拟：用户点键盘「发送」
      _simulateConfirm() {
        console.log('[mock] 用户点发送, value=', this._value)
        if (this._listeners.confirm) this._listeners.confirm({ value: this._value })
      },
    }
  },
}

// ────────── mock Canvas ──────────
const ctx = {
  fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', globalAlpha: 1,
  save() {}, restore() {}, fillRect() {}, strokeRect() {}, fillText() {},
  setLineDash() {}, fill() {}, stroke() {},
}

// ────────── 改造后的 handleFreeInput（C 方案）──────────
let freeInputText = ''
let freeInputInstance = null  // 保存 input 实例用于 hideKeyboard 时 blur

function handleFreeInput_C() {
  if (typeof wx === 'undefined' || !wx.createInput) {
    console.log('[mock] wx.createInput 不存在，降级到 wx.showModal')
    return
  }

  // 1. 位置：在 narrative 下方、选项上方（D076 视觉锚点）
  const inputY = 600  // mock 坐标
  const inputH = 40
  const inputW = 300

  // 2. 创建 input 组件（C 方案核心）
  freeInputInstance = wx.createInput({
    x: 38,                 // layout.padding
    y: inputY,
    width: inputW,
    height: inputH,
    maxLength: 100,
    confirmType: 'send',
    placeholder: '你想做什么...',  // 能否带 placeholder？文档待验证
    // style: '...'  样式定制？文档待验证
  })

  // 3. 监听事件
  freeInputInstance.on('input', (res) => {
    freeInputText = res.value || ''
    console.log('[mock] 实时输入:', freeInputText)
    // ⚠️ 入对话流吗？D005 教训：玩家打字过程中不入 messages
    // 保持现状：只有 confirm 才入 narrativeHistory
  })

  freeInputInstance.on('confirm', (res) => {
    const text = (res.value || '').trim()
    if (text) {
      console.log('[mock] ✅ 用户发送:', text)
      // 模拟 callAI
      // callAI(text)
    }
    // 收键盘
    freeInputInstance.blur()
  })

  freeInputInstance.on('blur', () => {
    console.log('[mock] 键盘已收起，input 组件失焦')
    // 此处可以销毁 input 组件（如果支持 destroy）
    freeInputInstance = null
  })

  // 4. 自动获取焦点 → 弹键盘
  freeInputInstance.focus()
}

// ────────── 测试场景 ──────────
console.log('=== C 方案 mock 测试 ===\n')

console.log('--- 场景 1：玩家点内嵌输入框 ---')
handleFreeInput_C()
console.log()

console.log('--- 场景 2：玩家从键盘打字「你好你好你好」---')
if (freeInputInstance) freeInputInstance._simulateUserInput('你好你好你好')
console.log()

console.log('--- 场景 3：玩家点发送按钮 ---')
if (freeInputInstance) freeInputInstance._simulateConfirm()
console.log()

console.log('--- 场景 4：先生重进游戏后再点输入框 ---')
handleFreeInput_C()
if (freeInputInstance) freeInputInstance._simulateUserInput('第二句话')
if (freeInputInstance) freeInputInstance._simulateConfirm()
console.log()

console.log('=== 测试完成 ===')
console.log()
console.log('⚠️ PMO 风险点（先生必须知道的）：')
console.log('1. wx.createInput 在 Canvas 模式下样式定制能力有限')
console.log('   - 能否画金色描边？→ 文档说只支持基础样式')
console.log('   - 能否半透明灰底？→ 不确定')
console.log('   - D076 的「视觉锚点最强」可能丢失')
console.log()
console.log('2. 位置控制：input 组件位置由 wx 决定，不是 Canvas 坐标')
console.log('   - D076 输入框在 narrative 下方 + 选项上方')
console.log('   - input 组件能否精确放这个位置？→ 待真机验证')
console.log()
console.log('3. 层级问题：input 组件可能盖在 narrative 上')
console.log('   - narrative 文字是否被挡？→ 待真机验证')
console.log('   - onTouch 事件在 input 区域是否会误触发？→ 待真机验证')
console.log()
console.log('✅ PMO 评估：C 方案能不能用，**真机测一次才知道**')
console.log('   Node mock 只能验证逻辑对不对，验证不了渲染样式')