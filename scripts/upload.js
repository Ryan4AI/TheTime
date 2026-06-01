/**
 * 穿越日记 · 直接上传小游戏到微信
 * 用法: node scripts/upload.js [version] [desc]
 */
const path = require('path')
const { Project, upload } = require('miniprogram-ci')

async function main() {
  const appid = 'wx2fc3ba2c105c9ba2'
  const keyFile = path.join(__dirname, '../credentials/private.wx2fc3ba2c105c9ba2.key')
  const version = process.argv[2] || '0.0.1'
  const desc = process.argv[3] || '小游戏入口页面'

  console.log('=== 穿越日记 · TheTime (Mini Game) ===')
  console.log('AppID:', appid)
  console.log('Version:', version)
  console.log('Desc:', desc)

  try {
    const project = new Project({
      appid,
      type: 'miniGame',  // Changed from miniProgram to miniGame
      projectPath: path.join(__dirname, '../minigame'),
      privateKeyPath: keyFile,
      ignores: ['node_modules/**', 'credentials/**', 'scripts/**'],
    })

    console.log('上传中...')
    const result = await upload({
      project,
      version,
      desc,
      robot: 1,
      setting: {
        es6: true,
        es7: true,
        minify: true,
        minifyJS: true,
        codeProtect: false,
      },
    })
    console.log('结果:', JSON.stringify(result, null, 2))
    console.log('✅ 上传成功！')
  } catch (e) {
    console.error('❌ 上传失败:', e.message)
    if (e.stack) console.error(e.stack)
    process.exit(1)
  }
}

main()
