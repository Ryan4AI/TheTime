/**
 * 穿越日记 minigame 上传脚本
 * 用法: node scripts/upload-minigame.js [version] [desc]
 */
const path = require('path')
const { Project, upload } = require('miniprogram-ci')

async function main() {
  const keyFile = path.join(__dirname, '../credentials/private.wx2fc3ba2c105c9ba2.key')
  const appid = 'wx2fc3ba2c105c9ba2'
  const version = process.argv[2] || '1.0.0'
  const desc = process.argv[3] || 'server direct upload'

  console.log('=== TheTime minigame upload ===')
  console.log('Key:', keyFile)
  console.log('AppID:', appid)
  console.log('Version:', version)
  console.log('Desc:', desc)

  try {
    const project = new Project({
      appid,
      type: 'miniGame',
      projectPath: path.join(__dirname, '../minigame'),
      privateKeyPath: keyFile,
      ignores: ['node_modules/**'],
    })

    console.log('开始上传...')
    const result = await upload({
      project,
      version,
      desc,
      setting: {
        es6: true,
        es7: true,
        minify: true,
        minifyJS: true,
      },
    })
    console.log('✅ 上传成功:', result)
  } catch (e) {
    console.error('❌ 上传失败:', e.message || e)
    process.exit(1)
  }
}

main()
