# 穿越日记 · 项目记忆手册

> 最后更新：2026-06-01 03:22
> 所有项目决策、架构、schema、约束、坑点，浓缩于此。每次开始工作前从头过一遍。

---

## 1. 项目概况

| 项目 | 值 |
|------|------|
| 中文名 | 穿越日记（先生定名） |
| 英文名 | TheTime（先生定名） |
| 形态 | **微信小游戏**（Canvas 2D，非小程序） |
| AppID | `wx2fc3ba2c105c9ba2` |
| 云环境 | `cloud1-d5gkbowyvbd1c85e1` |
| 核心玩法 | 带3件现代物品穿越到真实中国历史 → 概率驱动人生 → AI叙事 + 选项交互 → 一生终结 → 跨世重来 |
| 上传命令 | `cd /home/admin/workspace/TheTime && node scripts/upload.js <version> <desc>` |
| 密钥 | `credentials/private.wx2fc3ba2c105c9ba2.key` |
| 最新版本 | v0.3.14（identity.js 纪年显示还原） |

---

## 2. 游戏流程图

```
entry.js ──→ selection.js ──→ intro.js ──→ identity.js ──→ game.js
(入口)      (选3件物品)      (穿越特效)    (身份卡)        (AI叙事对话)
                ↑                                                 │
                └──────────── 跨世重来 ──────────────────────────────┘
                          (game.js 检测死亡 → 回到 selection)
```

**场景切换机制：** 每个 scene 文件通过 `module.exports.autoNext = { scene, ...data }` 触发切换。
父级 `main.js` 或 `game.js` 的 switchScene 函数读取 autoNext 并跳转。

### 各场景数据流

| 场景 | 输入 | 输出 |
|------|------|------|
| entry.js | — | → `{ scene: 'selection' }` 或 `{ scene: 'records' }` |
| selection.js | — | → `{ scene: 'intro', items: chosenItems[], gender: '男'/'女' }` |
| intro.js | items, gender | 调用云函数 `generate_identity` → `{ scene: 'identity', items, identity }` |
| identity.js | items, identity | → `{ scene: 'game', items, identity }` |
| game.js | items, identity | AI叙事循环，死亡时回 selection |

---

## 3. 数据库 Collections（云实际部署）

### 3.1 数据表（有 schema 验证）

| 集合 | 主键 | 用途 | 状态 |
|------|------|------|------|
| `era_meta` | year | 时代通用信息（朝代、皇帝、识字率、姓氏） | ✅ 有数据 |
| `era_cities` | year+city | 城市人口与描述 | ✅ 有数据 |
| `era_age_dist` | year+age | 年龄分布权重 | ✅ 有数据 |
| `social_structure` | year+class | 社会阶层与职业池 | ✅ 有数据 |
| `event` | year+month+city | 历史事件 | ✅ 有数据 |

### 3.2 消息系统表（无 schema 验证，由云控台手动创建）

| 集合 | 用途 | 文档结构（待定义） |
|------|------|------|
| `system_message` | 存系统 prompt（世界观设定，固定） | `{ role, content, sessionId, createdAt }` |
| `user_message` | 存玩家输入（选项/自由输入） | `{ sessionId, content, turn, createdAt }` |
| `ai_message` | 存 AI 叙事输出 | `{ sessionId, narrative, options, stateMarkers, turn, createdAt }` |
| `lives` | 存每世记录（含 identity + 摘要+ 跨世数据） | `{ sessionId, identity, summary, items, startedAt, endedAt }` |
| `meta_message` | 会话元数据 | 存跨世数据、上一世痕迹等 |

### 3.3 其他表

| 集合 | 用途 |
|------|------|
| `population` | 废弃（旧版人口数据） |
| `era_stats` | 废弃（旧版统计数据） |
| `test_game_lives` | 测试用 |

---

## 4. 身份数据（云函数输出 schema）

`generate_identity` 云函数返回：

```json
{
  "success": true,
  "identity": {
    "year": 1102,
    "city": "汴京",
    "dynasty": "北宋",
    "emperor": "宋徽宗",
    "eraLabel": "崇宁元年",
    "eraDisplay": "北宋 · 崇宁元年",       // 前端展示用
    "name": "赵明远",
    "gender": "男",
    "age": 25,
    "canRead": true,
    "socialClass": "主户·中",
    "occupation": "书吏",
    "isCelebrity": false,
    "figure": null,
    "popMillion": 1.5,
    "cityDesc": "汴京跨汴河两岸...",
    "cityFigures": ["苏轼","李清照"],
    "source": "《宋史·地理志》"
  },
  "debug": { "totalWeight": 100, ... }
}
```

**算法：** 两遍遍历 `era_cities`（所有记录），人口加权随机 → 随机年龄 → 随机阶层+职业 → DS API 生成名字。

---

## 5. 技术约束与坑点

### 5.1 云函数
- **新云函数创建失败**：`ResourceNotFound.File: entryFile did not find in code or layers` → 只有更新已有函数可用，要新建必须在目录里有 `node_modules/package-lock.json`（从 get_era_meta 复制）
- **只允许一个 system 消息**：MiniMax-M2.7 API，多个 system 返回 2013 错误
- **必须用原生 `https.request`**：无依赖部署最快，needle/fetch 等 npm 包增加部署时间
- **`tcb fn deploy` 需要管道处理交互式输入**：`echo -e "envId\ny" | npx tcb fn deploy <name> --force`

### 5.2 前端（Canvas 小游戏）
- **触摸坐标用 `clientX/clientY`**，不是 `x/y`（`e.changedTouches[0].x` 不存在）
- **Canvas DPR 缩放会破坏触摸命中检测** → CSS 像素优先
- **NOTO Serif SC 字体子集化内嵌**（30KB TTF）
- **上传用 `compileType: 'miniGame'`** + `game.js` / `game.json` 入口

### 5.3 AI 输出
- **MiniMax-M2.7 无法关闭推理链**：默认输出 `<think>` 推理 tag，必须前端用正则 `/<think>[\s\S]*?<\/think>/g` 剥离
- **`max_tokens` ≥ 5000**：保证推理链完整体后输出叙事
- **`<rich-text>` 样式不继承**：所有样式必须内联

### 5.4 数据库
- **验证规则**：`additionalProperties: false` 时必须包含 `_id`
- **Schema 对 UPDATE 也生效**：required 字段必须完备
- **数据审核规则**：任何数据写入云数据库前，必须先展示完整内容给先生审核通过

---

## 6. AI 叙事 Prompt 设计（当前状态）

### 6.1 已确定的架构
- **不要 generate_story 云函数**：身份确定后直接开始 AI 对话
- **不要 atmosphere 字段**：已从设计中去掉
- **输出格式**：纯文本叙事 + `「选项A」「选项B」`标记 + `[26岁 打火机=快没油了]`状态标记
- **标记系统**：
  - `#INIT`：玩家睁眼 → AI写初始叙事
  - `#NEXT`：往前走一段时间（原#NEXT_MONTH，先生指出不能用"月"）
  - `#CHOICE`：玩家的选项
  - `#FREE_INPUT`：玩家自由输入
  - `#DEATH`：玩家死亡
  - `#SUMMARY`：生命总结

### 6.2 引擎选型
- **当前使用**：DeepSeek v4 Flash（generate_identity 用，API Key 在云函数环境变量）
- **叙事引擎待定**：MiniMax-M2.7 或 DeepSeek v4 Flash
- **API Key**: `sk-26d0e090ed7b4d90803aae706d9b7247`（DeepSeek，目前仅在 generate_identity 环境变量中，DS_API_KEY）

### 6.3 消息结构（Message 表单）
- 游戏对话以 `messages[]` 形式传给 AI
- 每轮 = 1 条 user message（玩家输入） + 1 条 assistant message（AI 叙事）
- 加上 1 条固定的 system message
- 前端每次调用时传最近 N 轮的 messages

### 6.4 跨世机制
- **核心设定**：死亡 = 游戏机制，不是失败。死后返回选物品重新穿越
- **跨世痕迹**：先生明确要求 "有些地方会有上一世的痕迹"——比如上一世的诗被收录在县志里、上一世认识的人的后代、上一世建的建筑成为古迹
- **跨世数据**：存放在 `lives` collection + `meta_message` 中，供 AI 叙事时引用

---

## 7. 云函数清单

| 函数 | 输入 | 输出 | 状态 |
|------|------|------|------|
| `init_db` | — | 创建5个集合 | ✅ 已部署 |
| `generate_identity` | `{gender?, mode?: 'pool'/'story'}` | 身份数据 或 故事叙事 | ❌ Failed |
| `get_era_meta` | `{year}` | era_meta 文档 | ✅ 已部署 |
| `get_era_cities` | `{year, city?}` | 城市列表或单城 | ✅ 已部署 |
| `get_era_age_dist` | `{year}` | 年龄分布列表 | ✅ 已部署 |
| `get_social_structure` | `{year}` | 社会阶层列表 | ✅ 已部署 |
| `get_events` | `{year, month, city}` | 事件列表 | ✅ 已部署 |
| `get_fate_pool` | — | 命运池 | ❌ Failed |
| `generate_story` | `{identity, items, history}` | 故事叙事 | ❌ Failed |
| `add_era_fields` | — | 添加数据字段 | ✅ |

### 需要注意
- generate_identity 目前是 Creating 状态，不工作
- story mode 在 generate_identity 里半成品（JSON解析 + DeepSeek，不是 MinMax）
- 新函数创建用 `echo -e "cloud1-d5gkbowyvbd1c85e1\ny" | npx tcb fn deploy <name> --force`

---

## 8. 关键决策记录

| 日期 | 决策 | 背景 |
|------|------|------|
| 05-31 | 项目从"小程序"转为"小游戏" | AppID 注册的是小游戏，上传 miniprogram-ci 报错 |
| 05-31 | 触摸坐标用 clientX/clientY | x/y 不存在导致按钮点击无效 |
| 05-31 | `_id` 必须在 properties 中 | Mongo schema 验证 additionalProperties:false |
| 05-31 | 名字由 AI 生成，male/femaleNames 改为可选 | 避免硬编码名字库 |
| 05-31 | figures 字段新增到 era_cities | 名人彩蛋机制 |
| 06-01 | 不生成 generate_story，直接进入 AI 对话 | 身份卡后自然衔接 |
| 06-01 | 不要 atmosphere 字段 | 设计已去除 |
| 06-01 | 输出为纯文本+「」+[], 非 JSON | 消息系统三集合（user/ai/system） |
| 06-01 | 跨世机制需要具体设计 | 先生要求有上一世痕迹的巧思 |

---

## 9. 相关文档索引

| 文档 | 内容 |
|------|------|
| `docs/database-schema.md` | 数据库 schema v5 详细设计 |
| `docs/data-roadmap.md` | 各朝代数据源路线图 |
| `docs/xia-data-package.md` | 夏朝数据包 |
| `docs/tech-manual.md` | **本文档** — 技术手册 |
| `minigame/scenes/game.js` | 游戏叙事页面（当前硬编码） |
| `minigame/scenes/identity.js` | 身份卡页面 |
| `minigame/scenes/selection.js` | 选物品页面 |
| `minigame/scenes/intro.js` | 穿越特效页面 |
| `minigame/scenes/entry.js` | 入口页面 |
| `cloudfunctions/generate_identity/index.js` | 身份生成云函数 |
| `data/game-probability.md` | 概率设计备忘 |
| `scripts/upload.js` | 上传脚本 |
| `credentials/private.wx2fc3ba2c105c9ba2.key` | 上传密钥 |
| `credentials/app-secret.json` | AppSecret |

---

## 10. 当前待办

1. **设计 AI 叙事 prompt**（纯文本+标记格式，含跨世痕迹）
2. **部署生成叙事的新云函数**（或者修复 generate_identity 的 story mode）
3. **部署 message 集合数据写入逻辑**（system/user/ai/lives）
4. **集成 MiniMax/DSeepSeek API**
5. **扩展事件库到更多朝代**
6. **真机测试自由输入（wx.showKeyboard）**
7. **跨世痕迹系统实现**
