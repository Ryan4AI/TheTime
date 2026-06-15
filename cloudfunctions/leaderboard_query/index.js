const cloud = require('wx-server-sdk');

cloud.init({ env: 'cloud1-d5gkbowyvbd1c85e1' });
const db = cloud.database();
const _ = db.command;

// 榜单配置
const BOARD_CONFIG = {
  '名医榜': { formula: (p) => (p.医术 || 0) * 0.7 + (p.声望 || 0) * 0.3 },
  '名将榜': { formula: (p) => (p.战功 || 0) * 0.7 + (p.声望 || 0) * 0.3 },
  '富商榜': { formula: (p) => (p.财富 || 0) * 1.0 },
  '文豪榜': { formula: (p) => (p.文采 || 0) * 0.7 + (p.学识 || 0) * 0.3 },
  '能臣榜': { formula: (p) => (p.政绩 || 0) * 0.7 + (p.声望 || 0) * 0.3 },
  '义士榜': { formula: (p) => (p.义行 || 0) * 0.7 + (p.声望 || 0) * 0.3 },
  '全能榜': { formula: (p) => (p.声望 || 0) + (p.财富 || 0) + (p.学识 || 0) + (p.颜值 || 0) },
  '长寿榜': { formula: (p) => p.寿命 || 0 },
  '旅行家榜': { formula: (p) => p.游历城市数 || 0 },
  '颜值榜': { formula: (p) => (p.颜值 || 0) * 1.0 }
};

exports.main = async (event) => {
  const { action, board, playerAttributes } = event;
  
  try {
    // 1. 查询所有榜单列表（不含人物详情）
    if (action === 'list') {
      const result = await db.collection('leaderboards')
        .field({
          _id: true,
          name: true,
          type: true,
          formula: true,
          attr: true,
          count: true
        })
        .get();
      
      return {
        success: true,
        data: result.data
      };
    }
    
    // 2. 查询单个榜单详情（含人物列表）
    if (action === 'detail' && board) {
      const result = await db.collection('leaderboards')
        .doc(board)
        .get();
      
      if (!result.data) {
        return { success: false, error: '榜单不存在' };
      }
      
      return {
        success: true,
        data: result.data
      };
    }
    
    // 3. 查询玩家最接近榜单
    if (action === 'closest' && playerAttributes) {
      const allBoards = await db.collection('leaderboards').get()
      let best = null, bestDiff = Infinity

      for (const doc of (allBoards.data || [])) {
        const config = BOARD_CONFIG[doc.name || doc._id]
        if (!config || !doc.characters || doc.characters.length === 0) continue
        // 长寿榜/旅行家榜透传属性算不了玩家分（需寿命/游历数据），跳过
        if (doc.name === '长寿榜' || doc.name === '旅行家榜') continue

        const playerScore = Math.round(config.formula(playerAttributes))
        const threshold = doc.characters[doc.characters.length - 1].综合分
        const diff = threshold - playerScore

        if (diff <= 0) {
          // 已上榜：立即返回
          return {
            success: true,
            data: { name: doc.name, diff: 0, on: true, targetPerson: null }
          }
        }
        if (diff < bestDiff) {
          const bottom = doc.characters[doc.characters.length - 1]
          bestDiff = diff
          best = {
            name: doc.name,
            diff: diff,
            on: false,
            targetPerson: bottom.name + '(' + (bottom.dynasty || '') + ')'
          }
        }
      }

      return { success: true, data: best }
    }
    if (action === 'rank' && board && playerAttributes) {
      const result = await db.collection('leaderboards')
        .doc(board)
        .get();
      
      if (!result.data) {
        return { success: false, error: '榜单不存在' };
      }
      
      const boardData = result.data;
      const config = BOARD_CONFIG[board];
      
      if (!config) {
        return { success: false, error: '榜单配置不存在' };
      }
      
      // 计算玩家分数
      const playerScore = Math.round(config.formula(playerAttributes));
      
      // 计算玩家排名
      let rank = 1;
      for (const char of boardData.characters) {
        if (char.综合分 > playerScore) {
          rank++;
        } else {
          break;
        }
      }
      
      // 找出玩家超越的历史人物
      const surpassed = [];
      for (const char of boardData.characters) {
        if (char.综合分 < playerScore) {
          surpassed.push({
            name: char.name,
            dynasty: char.dynasty,
            score: char.综合分,
            rank: char.排名
          });
        }
      }
      
      // 找出排名最接近的历史人物（玩家还没超越的）
      let nextTarget = null;
      for (const char of boardData.characters) {
        if (char.综合分 >= playerScore) {
          nextTarget = {
            name: char.name,
            dynasty: char.dynasty,
            score: char.综合分,
            rank: char.排名,
            diff: char.综合分 - playerScore
          };
        }
      }
      
      return {
        success: true,
        data: {
          board: board,
          playerScore: playerScore,
          rank: rank,
          total: boardData.count,
          surpassed: surpassed.slice(-5), // 最近超越的5个
          nextTarget: nextTarget // 下一个目标
        }
      };
    }
    
    return { success: false, error: '无效的 action 参数' };
    
  } catch (e) {
    return { success: false, error: e.message };
  }
};
