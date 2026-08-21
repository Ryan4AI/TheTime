// PMO 巡检临时查询 · 放在项目目录内可用 wx-server-sdk
const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-d5gkbowyvbd1c85e1' });
const db = cloud.database();
const _ = db.command;

const TABLE = process.argv[2];
const TYPE = process.argv[3] || 'count';

(async () => {
  try {
    if (TYPE === 'count') {
      const r = await db.collection(TABLE).where({}).count();
      console.log(`${TABLE} count = ${r.total}`);
    } else if (TYPE === 'recent3') {
      const r = await db.collection(TABLE).orderBy('createdAt','desc').limit(3).get();
      r.data.forEach(x => console.log(' ', x._id, x.createdAt, x.status||'', x.category||''));
    } else if (TYPE === 'dirty_count') {
      const r = await db.collection(TABLE).where({ content: _.exists(false) }).count();
      console.log(`${TABLE} content-missing = ${r.total}`);
    } else if (TYPE === 'dirty_ids') {
      const r = await db.collection(TABLE).where({ content: _.exists(false) }).limit(50).get();
      console.log(`${TABLE} no-content records = ${r.data.length}`);
      r.data.slice(0, 25).forEach(x => console.log(' ', x._id, 'seq='+x.seq, 'status='+x.status, x.createdAt));
    } else if (TYPE === 'pending_all') {
      const r = await db.collection(TABLE).where({ status: 'pending' }).limit(100).get();
      console.log(`${TABLE} total pending = ${r.data.length}`);
      const cats = {};
      r.data.forEach(x => { cats[x.category||'?'] = (cats[x.category||'?']||0)+1; });
      console.log('by category:', JSON.stringify(cats));
      r.data.slice(0, 5).forEach(x => console.log(' ', x._id, x.category, x.createdAt));
    } else if (TYPE === 'pending_latest') {
      const r = await db.collection(TABLE).where({ status: 'pending' }).orderBy('createdAt','desc').limit(3).get();
      r.data.forEach(x => console.log(' ', x._id, x.category||'?', x.createdAt));
    } else if (TYPE === 'pending_old10m') {
      const r = await db.collection(TABLE).where({
        status: 'pending',
        createdAt: _.lt(Date.now() - 10*60*1000)
      }).count();
      console.log(`${TABLE} pending >10min = ${r.total}`);
    } else if (TYPE === 'narrate_max_seq') {
      const r = await db.collection(TABLE).orderBy('seq','desc').limit(3).get();
      r.data.forEach(x => console.log(' ', x._id, 'seq='+x.seq, 'createdAt='+x.createdAt, 'content='+(typeof x.content==='string'?x.content.slice(0,40):'[NOT STRING]')));
    }
  } catch(e) {
    console.error('ERR:', e.errMsg || e.message);
  }
})();
