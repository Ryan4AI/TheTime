// PMO 巡检临时查询脚本，TableName/CommandType/Command 包装格式
const https = require('https');
const fs = require('fs');

const APP_ID = 'wx2fc3ba2c105c9ba2';
const APP_SECRET = fs.readFileSync('credentials/app-secret.json','utf8').match(/"appsecret"\s*:\s*"([^"]+)"/)[1];
const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1';

function getToken() {
  return new Promise((resolve, reject) => {
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`;
    https.get(url, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(JSON.parse(body).access_token));
    }).on('error', reject);
  });
}

async function dbQuery(query, isCount) {
  const token = await getToken();
  const endpoint = isCount ? 'databasecount' : 'databasequery';
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ env: ENV_ID, query });
    const opts = {
      hostname: 'api.weixin.qq.com',
      path: `/tcb/${endpoint}?access_token=${token}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const table = process.argv[2];
  const type = process.argv[3] || 'count';
  let query, isCount;

  if (type === 'count') {
    query = `db.collection('${table}').count()`;
    isCount = true;
  } else if (type === 'recent3') {
    query = `db.collection('${table}').orderBy('createdAt','desc').limit(3).get()`;
    isCount = false;
  } else if (type === 'pending_all') {
    query = `db.collection('${table}').where({status:'pending'}).limit(100).get()`;
    isCount = false;
  } else if (type === 'pending_latest') {
    query = `db.collection('${table}').where({status:'pending'}).orderBy('createdAt','desc').limit(3).get()`;
    isCount = false;
  } else {
    // Treat as raw query
    query = `db.collection('${table}').${type}`;
    isCount = type.includes('.count()');
  }

  const result = await dbQuery(query, isCount);
  console.log(JSON.stringify(result, null, 2).slice(0, 3000));
})().catch(e => console.error('ERR:', e.message));
