# 穿越日记 · 消息集合文档结构

> 基于现有 5 个数据表（era_meta/era_cities/era_age_dist/social_structure/event）补充 5 个消息集合的文档结构

---

## system_message —— 系统提示（固定一条）

```json
{
  "_id": "system-prompt-v7",
  "role": "system",
  "content": "你是《穿越日记》的世界叙述者……",
  "version": 7,
  "createdAt": Date
}
```

写入时机：游戏启动。只写一次，不重复。

---

## user_message —— 玩家输入（每轮一条）

```json
{
  "_id": "auto",
  "sessionId": "wx_openid_xxx",
  "lifeId": 3,
  "turn": 7,
  "marker": "CHOICE",
  "content": "A",
  "ref": {
    "identity": null,
    "items": null,
    "echoes": null,
    "event": null,
    "deathCause": null
  },
  "createdAt": Date
}
```

| marker | content | ref |
|--------|---------|-----|
| `INIT` | "" | `{ identity: {...}, items: [...], echoes: "..." }` |
| `NEXT` | "" | `{ }` |
| `EVENT` | "" | `{ event: { title, desc, type, scope } }` |
| `CHOICE` | "A"/"B"/"C" | `{ }` |
| `FREE_INPUT` | 玩家输入文本 | `{ }` |
| `DEATH` | "金兵破城" | `{ deathCause: "..." }` |

**INIT 的 identity 数据来源：** generate_identity 云函数返回的完整 identity 对象：

```json
{
  "name": "赵明远",
  "year": 1102,
  "age": 25,
  "dynasty": "宋",
  "emperor": "宋徽宗",
  "eraLabel": "崇宁元年",
  "city": "汴京",
  "gender": "男",
  "socialClass": "庶人",
  "occupation": "书吏",
  "canRead": true,
  "isCelebrity": false,
  "popMillion": 1.5,
  "cityDesc": "汴京跨汴河两岸……",
  "residence": "城内东南角"
}
```

**INIT 的 echoes 数据来源：** lives 集合随机取 1-2 条，提取 traces 字段拼成自然语言。

---

## ai_message —— AI 回复（每轮一条）

```json
{
  "_id": "auto",
  "sessionId": "wx_openid_xxx",
  "lifeId": 3,
  "turn": 7,
  "narrative": "你推开门，一股混着药材和旧纸的气息扑在脸上……",
  "options": ["上前跟老汉搭话", "低头快步走过"],
  "state": {
    "age": 25,
    "打火机": "还热着",
    "铜钱": "50文"
  },
  "refEvents": ["event_id_xxx"],
  "raw": "原始AI输出（含<think>）",
  "createdAt": Date
}
```

**state 来源：** 从 AI 回复中的 `[]` 方括号标记解析。例 `[25岁 打火机=还热着 铜钱=50文]` → `state` 对象。

---

## lives —— 每世记录（一世一条）

```json
{
  "_id": "auto",
  "sessionId": "wx_openid_xxx",
  "lifeId": 3,
  "identity": {
    "name": "赵明远",
    "age": 25,
    "dynasty": "宋",
    "emperor": "宋徽宗",
    "eraLabel": "崇宁元年",
    "city": "汴京",
    "socialClass": "庶人",
    "occupation": "书吏",
    "gender": "男",
    "canRead": true
  },
  "items": ["打火机", "指南针", "防水火柴"],
  "summary": "赵明远活了32岁……",
  "traces": ["一首写在墙上的诗", "指南针在逃难时遗失"],
  "itemFates": {
    "打火机": "油尽被女儿埋后院",
    "指南针": "逃难途中遗失",
    "防水火柴": "一直用到最后"
  },
  "totalTurns": 24,
  "deathCause": "金兵破城，失血过多",
  "startedAt": Date,
  "endedAt": Date
}
```

**traces 来源：** 从 #SUMMARY 的 AI 输出解析，提取"留下痕迹"部分。

---

## meta_message —— 游戏状态（每轮更新一条）

```json
{
  "_id": "auto",
  "sessionId": "wx_openid_xxx",
  "lifeId": 3,
  "turn": 7,
  "state": {
    "age": 25,
    "year": 1102,
    "month": 3,
    "city": "汴京",
    "items": {
      "打火机": "还热着",
      "指南针": "完好",
      "防水火柴": "完好"
    },
    "wealth": "50文",
    "health": "正常"
  },
  "createdAt": Date
}
```

写入时机：每轮收到 AI 回复后，用 state 字段更新。

---

## MiniMax API 调用构造

基于以上文档结构，云函数构造 API 请求：

```javascript
// 1. 取 system prompt
const sysMsg = await db.collection('system_message').doc('system-prompt-v7').get()

// 2. 取最近 N 条对话历史
const history = await db.collection('ai_message')
  .where({ sessionId, lifeId })
  .orderBy('turn', 'desc')
  .limit(10)
  .get()

// 3. 构造 user_message（当前轮输入）
const userMsgData = {
  marker: "CHOICE",
  content: "A",
  ref: {}
}
await db.collection('user_message').add(userMsgData)

// 4. 构造 MiniMax 调用
const userContent = marker === 'INIT'
  ? `#INIT\n${JSON.stringify(ref.identity)}\n物品：${ref.items.join('、')}\n${ref.echoes}`
  : marker === 'CHOICE'
    ? `#CHOICE\n${content}`
    : marker === 'FREE_INPUT'
      ? `#FREE_INPUT\n${content}`
      : marker === 'NEXT'
        ? '#NEXT'
        : marker === 'DEATH'
          ? `#DEATH\n${ref.deathCause}`
          : ''

const messages = [
  { role: 'system', content: sysMsg.data.content },
  ...history.reverse().map(m => ({
    role: m.role,   // 从 doc 中存 role
    content: m.content
  })),
  { role: 'user', content: userContent }
]

// 5. 调用 MiniMax
```

---

## AI 输出解析

```javascript
function parseAiOutput(raw) {
  // 剥离 <think>
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

  // 提取状态标记 []
  const stateMatch = text.match(/\[([^\]]+)\]$/)
  const state = {}
  if (stateMatch) {
    stateMatch[1].split(/\s+/).forEach(pair => {
      const [k, v] = pair.split('=')
      state[k] = v || true
    })
  }

  // 提取选项 「」
  const options = []
  const optRegex = /「([^」]+)」/g
  let match
  while ((match = optRegex.exec(text)) !== null) {
    options.push(match[1])
  }

  // 叙事 = 去掉最后的状态标记行和「」选项
  const narrative = text
    .replace(/\[[^\]]+\]$/, '')    // 去掉状态标记行
    .replace(/「[^」]+」/g, '')     // 去掉选项标记
    .replace(/\n{3,}/g, '\n\n')   // 去多余空行
    .trim()

  // 写入 ai_message
  return {
    narrative,
    options,
    state
  }
}
```

---

## 完整一轮的生命周期

```
1. 玩家进入游戏 → 调用 generate_identity → 生成身份
2. 系统写 meta_message（初始状态）+ user_message（#INIT）
3. 构造 MiniMax 调用（system + #INIT）
4. 解析 AI 回复 → 写 ai_message（narrative + options + state）
5. 用 state 更新 meta_message
6. 展示给玩家 → 玩家选选项/自由输入
7. 回到 2（写 user_message）→ 循环
```

每轮的核心就是：读 DB → 构造 MiniMax 输入 → 调 API → 解析输出 → 写回 DB。
