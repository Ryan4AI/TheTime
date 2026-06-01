const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const { year } = event
  if (typeof year !== 'number') return { error: 'year required (number)' }

  const db = cloud.database()

  const { data } = await db.collection('era_age_dist')
    .where({ year: db.command.lte(year) })
    .orderBy('year', 'desc')
    .limit(81)
    .get()

  if (data.length === 0) return { ageDist: [], year: null }

  const latestYear = data[0].year
  const rows = data.filter(d => d.year === latestYear)

  return { ageDist: rows, year: latestYear }
}
