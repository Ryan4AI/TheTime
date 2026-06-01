const ci = require('miniprogram-ci')
const path = require('path')
const fs = require('fs')

const projectPath = path.join(__dirname, '..', 'minigame')
const keyPath = path.join(__dirname, '..', 'credentials', 'private.wx2fc3ba2c105c9ba2.key')
const appid = 'wx2fc3ba2c105c9ba2'

const version = process.argv[2] || '0.3.1'
const desc = process.argv[3] || '年号显示更新'

async function main() {
  const project = new ci.Project({
    appid,
    type: 'miniGame',
    projectPath,
    privateKey: fs.readFileSync(keyPath, 'utf8'),
    ignores: ['node_modules/**/*'],
  })
  const result = await ci.upload({
    project,
    version,
    desc,
    setting: {
      es6: true,
      minifyJS: false,
      minifyWXML: false,
      minifyWXSS: false,
    },
  })
  console.log('✅ 上传成功', JSON.stringify(result))
}

main().catch(e => {
  console.error('❌ 上传失败:', e.message)
  process.exit(1)
})