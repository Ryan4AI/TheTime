const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const { year, city } = event
  if (typeof year !== 'number') return { error: 'year required (number)' }

  const db = cloud.database()

  if (city) {
    // 查单个城市
    const { data } = await db.collection('era_cities')
      .where({ year: db.command.lte(year), city })
      .orderBy('year', 'desc')
      .limit(1)
      .get()
    return { city: data[0] || null }
  }

  // 查最近年份全部城市
  const { data } = await db.collection('era_cities')
    .where({ year: db.command.lte(year) })
    .orderBy('year', 'desc')
    .limit(50)
    .get()

  if (data.length === 0) return { cities: [], year: null }

  // 只取最近年份的数据
  const latestYear = data[0].year
  const cities = data.filter(d => d.year === latestYear).map(d => ({
    city: d.city,
    popMillion: d.popMillion,
  }))

  return { cities, year: latestYear }
}
