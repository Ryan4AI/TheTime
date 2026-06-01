// 穿越日记 数据库初始化脚本
// 用法：node scripts/setup_db.js
// 需 tcb 环境已登录

const { execSync } = require('child_process')

const ENV_ID = 'cloud1-d5gkbowyvbd1c85e1'
const COLLECTIONS = [
  // ========== lives — 一世一条 ==========
  {
    name: 'lives',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: [
          'user_id', 'life_number', 'is_active',
          'name', 'gender', 'age', 'social_class',
          'city_name', 'dynasty',
          'health', 'coin', 'coin_unit',
          'current_year', 'current_month',
          'created_at', 'updated_at'
        ],
        additionalProperties: false,
        properties: {
          _id: { bsonType: 'objectId' },
          user_id: { bsonType: 'string', description: '微信openid' },
          life_number: { bsonType: 'int', minimum: 1, description: '第几世' },
          is_active: { bsonType: 'bool', description: '是否存活' },

          // 身份（平铺）
          name: { bsonType: 'string' },
          gender: { enum: ['男', '女'] },
          age: { bsonType: 'int', minimum: 0 },
          occupation: { bsonType: ['string', 'null'] },
          social_class: { bsonType: 'string' },
          city_name: { bsonType: 'string' },
          dynasty: { bsonType: 'string' },

          // 状态
          health: { bsonType: 'int', minimum: 0, maximum: 100 },
          coin: { bsonType: 'int', minimum: 0 },
          coin_unit: { bsonType: 'string' },
          current_year: { bsonType: 'int' },
          current_month: { bsonType: 'int', minimum: 1, maximum: 12 },
          items: {
            bsonType: 'array',
            items: {
              bsonType: 'object',
              required: ['id', 'name', 'icon', 'durability'],
              properties: {
                id: { bsonType: 'string' },
                name: { bsonType: 'string' },
                icon: { bsonType: 'string' },
                durability: { bsonType: 'int', minimum: 0, maximum: 100 }
              }
            }
          },

          // 结局
          epitaph: { bsonType: ['string', 'null'] },
          legacy: { bsonType: ['string', 'null'] },
          last_words: { bsonType: ['string', 'null'] },

          created_at: { bsonType: 'long', description: '创建时间戳ms' },
          updated_at: { bsonType: 'long', description: '更新时间戳ms' }
        }
      }
    }
  },

  // ========== meta_message — 交互索引 ==========
  {
    name: 'meta_message',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['life_id', 'seq', 'type', 'year', 'month', 'detail_id', 'created_at'],
        additionalProperties: false,
        properties: {
          _id: { bsonType: 'objectId' },
          life_id: { bsonType: 'objectId', description: '引用lives._id' },
          seq: { bsonType: 'int', minimum: 1, description: '世内递增序号' },
          type: { enum: ['ai', 'user', 'system'] },
          year: { bsonType: 'int' },
          month: { bsonType: 'int', minimum: 1, maximum: 12 },
          detail_id: { bsonType: 'objectId', description: '引用对应detail表._id' },
          created_at: { bsonType: 'long' }
        }
      }
    }
  },

  // ========== ai_message — AI叙事+概率分支 ==========
  {
    name: 'ai_message',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['items'],
        additionalProperties: false,
        properties: {
          _id: { bsonType: 'objectId' },
          items: {
            bsonType: 'array',
            minItems: 1,
            items: {
              bsonType: 'object',
              required: ['p', 'content', 'options', 'patch'],
              properties: {
                p: { bsonType: 'double', minimum: 0, maximum: 1 },
                content: { bsonType: 'string' },
                options: {
                  bsonType: 'array',
                  minItems: 1,
                  items: { bsonType: 'string' }
                },
                patch: { bsonType: 'object' }
              }
            }
          },
          selected_index: { bsonType: ['int', 'null'] }
        }
      }
    }
  },

  // ========== user_message — 玩家输入 ==========
  {
    name: 'user_message',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['content'],
        additionalProperties: false,
        properties: {
          _id: { bsonType: 'objectId' },
          content: { bsonType: 'string' },
          patch: { bsonType: ['object', 'null'] }
        }
      }
    }
  },

  // ========== system_message — 系统操作 ==========
  {
    name: 'system_message',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['type', 'desc', 'patch'],
        additionalProperties: false,
        properties: {
          _id: { bsonType: 'objectId' },
          type: { enum: ['month_progress', 'death'] },
          desc: { bsonType: 'string' },
          patch: { bsonType: 'object' }
        }
      }
    }
  }
]

// 建表
for (const col of COLLECTIONS) {
  const cmd = JSON.stringify([{
    createCollection: col.name,
    validator: col.validator
  }])
  const escaped = cmd.replace(/'/g, "'\\''")
  try {
    const out = execSync(
      `echo '${escaped}' | npx tcb db nosql execute -e ${ENV_ID} --command '${escaped}' 2>/dev/null`,
      { encoding: 'utf8', timeout: 30000 }
    )
    console.log(`✅ ${col.name}`)
  } catch (e) {
    // 如果已经存在，直接创建索引
    console.log(`⚠️  ${col.name}: ${e.stderr?.trim() || '可能已存在'}`);
    // 尝试只加索引
  }
}

// 建索引（不要求validator就能跑）
console.log('\n--- 创建索引 ---')
const INDEXES = [
  { col: 'lives', keys: { user_id: 1, life_number: -1 } },
  { col: 'meta_message', keys: { life_id: 1, seq: 1 } },
  { col: 'meta_message', keys: { life_id: 1, created_at: -1 } },
]

for (const { col, keys } of INDEXES) {
  const cmd = JSON.stringify([{
    createIndexes: col,
    indexes: [{ key: keys, name: Object.keys(keys).join('_') }]
  }])
  const escaped = cmd.replace(/'/g, "'\\''")
  try {
    execSync(
      `echo '${escaped}' | npx tcb db nosql execute -e ${ENV_ID} --command '${escaped}' 2>/dev/null`,
      { encoding: 'utf8', timeout: 30000 }
    )
    console.log(`✅ 索引 ${col}.${Object.keys(keys).join('+')}`)
  } catch (e) {
    console.log(`❌ ${col}: ${e.message}`)
  }
}

console.log('\n🏁 完成')
