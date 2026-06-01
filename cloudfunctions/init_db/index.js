const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const COLLECTIONS = ['era_meta', 'era_cities', 'era_age_dist', 'social_structure', 'event']

exports.main = async () => {
  const db = cloud.database()
  const results = []

  for (const name of COLLECTIONS) {
    try {
      await db.collection(name).add({ data: { _init_: true, createdAt: Date.now() } })
      results.push({ ok: `${name} created` })
    } catch (e) {
      if (e.message && e.message.includes('already exist')) {
        results.push({ ok: `${name} already exists` })
      } else {
        results.push({ err: name, msg: e.message })
      }
    }
  }

  return { success: true, results }
}
