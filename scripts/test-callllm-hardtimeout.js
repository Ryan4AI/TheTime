#!/usr/bin/env node
/**
 * 验证硬性截止计时器模式（独立最小测试，2026-08-04 15:20 巡检修复）
 * 不依赖 worker 抽取，直接验证 "trickle 服务器（socket 永远活跃） + 硬性 setTimeout" 能在 timeoutMs 时 reject。
 */
const http = require('http')

async function main() {
  // 服务器：每 500ms 吐小块数据，永不 end → socket 永远活跃（模拟 MiniMax 流式 reasoning）
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    const t = setInterval(() => { res.write('{"chunk":') }, 500)
    req.on('close', () => clearInterval(t))
  })
  await new Promise(r => server.listen(0, r))
  const port = server.address().port
  console.log(`🧪 trickle 服务器 port=${port}（socket 永远活跃）`)

  // 模拟修复后的 callLLM：硬性 setTimeout + settled 防抖
  function callLLMWithHardTimeout(timeoutMs) {
    return new Promise((resolve, reject) => {
      let settled = false
      const hardTimeout = setTimeout(() => {
        if (settled) return
        settled = true
        req.destroy()
        reject(new Error('AI响应超时'))
      }, timeoutMs)
      const req = http.request({
        hostname: '127.0.0.1', port, path: '/chat/completions', method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: timeoutMs,
      }, res => {
        let body = ''
        res.on('data', c => body += c)
        res.on('end', () => {
          if (settled) return
          settled = true
          clearTimeout(hardTimeout)
          resolve(body)
        })
      })
      req.on('error', (e) => { if (settled) return; settled = true; clearTimeout(hardTimeout); reject(e) })
      req.on('timeout', () => {
        if (settled) return
        settled = true
        clearTimeout(hardTimeout)
        req.destroy()
        reject(new Error('AI响应超时'))
      })
      req.write('{}')
      req.end()
    })
  }

  // 测试 1：trickle + 3s 硬性截止 → 应在 ~3s reject
  let t0 = Date.now()
  try {
    await callLLMWithHardTimeout(3000)
    console.log('❌ 测试1 应该超时却 resolve 了')
    process.exit(1)
  } catch (e) {
    const elapsed = Date.now() - t0
    if (e.message !== 'AI响应超时') { console.log('❌ 测试1 error 消息不对: ' + e.message); process.exit(1) }
    if (elapsed < 2500 || elapsed > 4500) { console.log(`❌ 测试1 超时窗口不对: ${elapsed}ms`); process.exit(1) }
    console.log(`✅ 测试1 硬性截止生效：${elapsed}ms reject（socket 永远活跃仍能在 ~3s 终止）`)
  }

  // 测试 2：trickle + 1.5s 硬性截止 → 应在 ~1.5s reject（验证窗口可配）
  t0 = Date.now()
  try {
    await callLLMWithHardTimeout(1500)
    console.log('❌ 测试2 应该超时却 resolve 了')
    process.exit(1)
  } catch (e) {
    const elapsed = Date.now() - t0
    if (e.message !== 'AI响应超时') { console.log('❌ 测试2 error 消息不对: ' + e.message); process.exit(1) }
    if (elapsed < 1000 || elapsed > 3000) { console.log(`❌ 测试2 超时窗口不对: ${elapsed}ms`); process.exit(1) }
    console.log(`✅ 测试2 不同 timeoutMs 同样生效：${elapsed}ms reject`)
  }

  // 测试 3：快速响应服务器 → 不应被计时器误杀
  const fast = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: 1 }))
  })
  await new Promise(r => fast.listen(0, r))
  const fport = fast.address().port
  function callFast() {
    return new Promise((resolve, reject) => {
      let settled = false
      const hardTimeout = setTimeout(() => {
        if (settled) return
        settled = true
        req.destroy()
        reject(new Error('AI响应超时'))
      }, 3000)
      const req = http.request({ hostname: '127.0.0.1', port: fport, path: '/', method: 'GET' }, res => {
        let body = ''
        res.on('data', c => body += c)
        res.on('end', () => {
          if (settled) return
          settled = true
          clearTimeout(hardTimeout)
          resolve(body)
        })
      })
      req.on('error', (e) => { if (settled) return; settled = true; clearTimeout(hardTimeout); reject(e) })
      req.on('timeout', () => {
        if (settled) return
        settled = true
        clearTimeout(hardTimeout)
        req.destroy()
        reject(new Error('AI响应超时'))
      })
      req.end()
    })
  }
  t0 = Date.now()
  const resp = await callFast()
  const elapsed = Date.now() - t0
  if (!resp.includes('ok')) { console.log('❌ 测试3 响应内容不对'); process.exit(1) }
  if (elapsed > 2000) { console.log(`❌ 测试3 不应超时: ${elapsed}ms`); process.exit(1) }
  console.log(`✅ 测试3 快速响应正常 resolve：${elapsed}ms，硬性计时器未误杀`)

  server.close()
  fast.close()
  console.log('\n结果：硬性截止计时器 3/3 通过 ✅ — callLLM 修复模式验证成功，可部署')
}

main().catch(e => { console.error('❌', e); process.exit(1) })