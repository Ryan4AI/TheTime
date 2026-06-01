const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const { year, month, city } = event
  const cond = {}

  if (typeof year === 'number') cond.year = year
  if (typeof month === 'number') cond.month = month
  if (city) cond.city = city

  const db = cloud.database()

  try {
    let query = db.collection('event').where(cond)
    if (cond.year) query = query.orderBy('month', 'asc')
    const { data } = await query.limit(50).get()
    return { events: data, count: data.length }
  } catch (e) {
    return { error: e.message }
  }
}
