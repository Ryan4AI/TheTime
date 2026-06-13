const cloud = require('wx-server-sdk');
const leaderboards = require('./leaderboards.json');

cloud.init({ env: 'cloud1-d5gkbowyvbd1c85e1' });
const db = cloud.database();

exports.main = async (event) => {
  const results = [];
  
  // 先尝试创建集合（如果不存在）
  try {
    await db.createCollection('leaderboards');
    results.push('集合 leaderboards 创建成功');
  } catch (e) {
    if (e.message.includes('already exists') || e.message.includes('集合已存在')) {
      results.push('集合 leaderboards 已存在');
    } else {
      results.push('创建集合失败: ' + e.message);
    }
  }
  
  const meta = {
    '名医榜': { type: '专业', formula: '医术×0.7+声望×0.3', attr: '医术' },
    '名将榜': { type: '专业', formula: '战功×0.7+声望×0.3', attr: '战功' },
    '富商榜': { type: '专业', formula: '财富×1.0', attr: '财富' },
    '文豪榜': { type: '专业', formula: '文采×0.7+学识×0.3', attr: '文采' },
    '能臣榜': { type: '专业', formula: '政绩×0.7+声望×0.3', attr: '政绩' },
    '义士榜': { type: '专业', formula: '义行×0.7+声望×0.3', attr: '义行' },
    '全能榜': { type: '专业', formula: '声望+财富+学识+颜值', attr: '全能' },
    '长寿榜': { type: '趣味', formula: '寿命', attr: '寿命' },
    '旅行家榜': { type: '趣味', formula: '游历城市数', attr: '游历' },
    '颜值榜': { type: '趣味', formula: '颜值×1.0', attr: '颜值' },
  };
  
  for (const [name, chars] of Object.entries(leaderboards)) {
    const doc = {
      _id: name,
      name,
      type: meta[name].type,
      formula: meta[name].formula,
      attr: meta[name].attr,
      count: chars.length,
      characters: chars
    };
    
    // 检查是否存在
    const existing = await db.collection('leaderboards').doc(name).get().catch(() => null);
    
    if (existing) {
      // 更新
      await db.collection('leaderboards').doc(name).update(doc);
      results.push(`${name}: updated (${chars.length}人)`);
    } else {
      // 创建
      await db.collection('leaderboards').add(doc);
      results.push(`${name}: created (${chars.length}人)`);
    }
  }
  
  return { success: true, results };
};
