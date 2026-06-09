#!/usr/bin/env node
/**
 * 端到端测试：D008 异步轮询方案 v0.1.76
 * 流程：submit(拿 request_id) → 5s 轮询 get_result → done
 */

const { execSync } = require('child_process')

function invoke(fnName, data) {
  const dataStr = JSON.stringify(data)
  const out = execSync(
    `npx tcb fn invoke ${fnName} --params '${dataStr.replace(/'/g, "'\\''")}' 2>&1`,
    { encoding: 'utf8', timeout: 30 }
  )
  const m = out.match(/Return result：(.+)/)
  if (!m) throw new Error('未找到 Return result: ' + out)
  return JSON.parse(m[1].trim())
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log('🧪 测试 v0.1.76 异步轮询端到端链路\n')

  const testState = {
    life_number: 1, name: '测试玩家', gender: '男', age: 25,
    occupation: '庶民', socialClass: '庶人',
    dynasty: '北宋', eraDisplay: '仁宗朝', city: '开封',
    year: 1050, month: 3, round: 0,
    health: 100, coin: 1000,
    items: [], legacy: '', alive: true,
  }

  // 1. submit
  console.log('1️⃣ 调 ai_narrate_submit...')
  const submit = invoke('ai_narrate_submit', {
    state: testState, input: '', history: [], is_retry: false,
  })
  console.log('   结果:', JSON.stringify(submit).substring(0, 200))
  if (!submit.success) {
    console.error('❌ submit 失败')
    process.exit(1)
  }
  const requestId = submit.request_id
  console.log(`   request_id = ${requestId}\n`)

  // 2. 轮询
  console.log('2️⃣ 轮询 narrate_get_result（每 5 秒，最多 30 次 = 150 秒）...')
  const startTs = Date.now()
  let attempt = 0
  const MAX = 30

  while (attempt < MAX) {
    attempt++
    const elapsed = Math.round((Date.now() - startTs) / 1000)
    await sleep(5000)
    let poll
    try {
      poll = invoke('narrate_get_result', { request_id: requestId })
    } catch (e) {
      console.log(`   第 ${attempt} 次: 轮询失败 ${e.message.substring(0, 50)}`)
      continue
    }
    console.log(`   第 ${attempt} 次（已等 ${elapsed} 秒）: status = ${poll.status}`)

    if (poll.status === 'done') {
      console.log('\n✅ 端到端成功！')
      const branch = poll.result && poll.result.branch
      if (branch) {
        console.log(`   剧情首 100 字: ${branch.content.substring(0, 100)}...`)
        console.log(`   选项数: ${branch.options.length}`)
        console.log(`   状态: ${poll.result.state.year}年${poll.result.state.month}月, round=${poll.result.state.round}`)
      }
      console.log(`   总耗时: ${elapsed} 秒`)
      process.exit(0)
    }
    if (poll.status === 'error') {
      console.error(`\n❌ worker 失败: ${poll.error}`)
      process.exit(1)
    }
  }
  console.error(`\n❌ 轮询 ${MAX} 次仍未完成（超时）`)
  process.exit(1)
}

main().catch(e => {
  console.error('❌ 测试异常:', e.message)
  process.exit(1)
})