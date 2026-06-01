const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  // Build year→dynasty lookup from era_meta
  const { data: eras } = await db.collection('era_meta').limit(200).get()
  const dynByYear = {}
  for (const e of eras) {
    dynByYear[e.year] = e.dynasty
  }

  // Load cities, derive dynasty from year
  const { data } = await db.collection('era_cities').limit(1000).get()
  const seen = {}
  const pool = []
  for (let i = 0; i < data.length; i++) {
    const d = data[i]
    const dynasty = dynByYear[d.year] || '未知'
    if (!d.city || seen[dynasty + '·' + d.city]) continue
    seen[dynasty + '·' + d.city] = true
    pool.push(dynasty + '·' + d.city)
  }

  // Shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return { pool }
}
