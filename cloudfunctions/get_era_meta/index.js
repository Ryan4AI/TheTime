const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const { year } = event
  if (typeof year !== 'number') return { error: 'year required (number)' }

  const db = cloud.database()

  const { data } = await db.collection('era_meta')
    .where({ year: db.command.lte(year) })
    .orderBy('year', 'desc')
    .limit(1)
    .get()

  return { eraMeta: data[0] || null }
}
