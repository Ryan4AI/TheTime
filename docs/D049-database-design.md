# D049 玩家数据云端持久化 — 数据库结构设计

> 设计稿 · 2026-06-28 21:13 先生拍板
> 目标：玩家数据上云端，跨设备续作

---

## 一、设计原则（先生红线）

1. **数据清晰不混乱**（先生 21:12 教训）—— schema 严格，字段命名统一
2. **每次数据更新都存**（不局限回合）—— 状态、9 属性、物品、回合数变化都触发存盘
3. **玩家绑微信**（openid）—— 跨设备续作
4. **1 玩家 1 record**（life_number 字段区分世）—— 简单，避免多 record 复杂度
5. **schema 在前端 + 后端双重校验**（先生 6/7 教训：前端 schema 也要写）

---

## 二、集合设计

### 集合 1：`player` （玩家主表，1 玩家 1 record）

| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `_id` | string | ✅ | openid | 微信 openid，**云函数从 wxContext 拿，前端不传** |
| `openid` | string | ✅ | _id | 冗余存一份，方便查询 |
| `state` | object | ✅ | - | 玩家完整 state（见下方 state 字段）|
| `narrateHistory` | array | ✅ | [] | 叙事历史 [{role, content}]，喂 AI 上下文用 |
| `currentItems` | array | ✅ | [] | 物品栏 [{name, icon, desc, durability}] |
| `life_number` | number | ✅ | 1 | 第几世，跨世用 |
| `legacy` | object\|null | - | null | 前世信息（跨世用，D008 已有字段）<br>子字段：`{epRecord, epitaph, deathCause}` |
| `last_round` | number | ✅ | 0 | 最近回合数（前端展示进度用）|
| `last_narrative` | string | - | '' | 最近 1 段叙事（前端快速恢复用）|
| `last_options` | array | - | [] | 最近 1 轮的 options（恢复用）|
| `lifespan` | number | - | 随机 55-80 | 隐藏寿限（D008）|
| `alive` | bool | ✅ | true | 是否活着 |
| `created_at` | number | ✅ | - | 创建时间戳（首条 record 时）|
| `updated_at` | number | ✅ | - | 更新时间戳（每次存盘）|

#### state 子字段（最复杂，9 属性 + 元数据）

| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `name` | string | ✅ | '无名' | 姓名 |
| `gender` | string | ✅ | '男' | 性别（先生身份页生成）|
| `age` | number | ✅ | 25 | 年龄 |
| `occupation` | string | ✅ | '庶民' | 职业 |
| `socialClass` | string | ✅ | '庶人' | 阶层 |
| `dynasty` | string | ✅ | '' | 朝代 |
| `eraDisplay` | string | ✅ | '' | 年号显示 |
| `city` | string | ✅ | '某地' | 城市 |
| `year` | number | ✅ | 0 | 年 |
| `month` | number | ✅ | 1 | 月 |
| `round` | number | ✅ | 0 | 回合数 |
| `health` | number | ✅ | 100 | 健康值（前端不显示但存）|
| `coin` | number | ✅ | 0 | 铜钱（冗余存，主表用 `财富` 属性）|
| `声望` | number | ✅ | 0 | 9 属性之一 |
| `财富` | number | ✅ | 0 | 9 属性之一 |
| `学识` | number | ✅ | 0 | 9 属性之一 |
| `颜值` | number | ✅ | 0 | 9 属性之一 |
| `医术` | number | ✅ | 0 | 9 属性之一 |
| `战功` | number | ✅ | 0 | 9 属性之一 |
| `文采` | number | ✅ | 0 | 9 属性之一 |
| `政绩` | number | ✅ | 0 | 9 属性之一 |
| `义行` | number | ✅ | 0 | 9 属性之一 |
| `epitaph` | string | - | '' | 墓志铭（死时写）|

---

### 集合 2：`narrate_result` （**已存在**，D002 设计保留）

不动，先生已用得很熟。

---

### 集合 3：`event` （**已存在**，历史事件库）

不动。

---

## 三、不做的设计（避免先生担心的"数据混乱"）

| 不做 | 原因 |
|---|---|
| `player_history` 集合（每回合快照）| 先生 21:12 拍"清晰不混乱"——1 玩家 1 record 就够 |
| `player_attrs` 集合（9 属性分表）| 9 属性跟着 state 走，**不分表** |
| `player_items` 集合（物品分表）| 物品跟着 currentItems 走，**不分表** |
| `player_session`（登录会话）| openid 唯一标识，**不需要 session** |
| `backup_xxx`（备份表）| 云函数层面出问题时再说，**目前不预设** |
| `audit_log`（审计日志）| debugLog 临时的不存云端 |

---

## 四、API 设计（云函数）

### 云函数 1：`player_save`

**输入：**
```js
{
  state: {...},           // 玩家完整 state
  narrateHistory: [...], // 叙事历史
  currentItems: [...],   // 物品
  life_number: 1,        // 世数
  legacy: {...}|null,    // 前世信息
  // openid 从 wxContext 拿，前端不传
}
```

**输出：**
```js
{
  success: true,
  updated_at: 1740000000
}
// 或
{
  success: false,
  error: '...'
}
```

**逻辑：**
- `wxContext.OPENID` 拿 openid
- 校验 state 必填字段（D048 已有的 schema 校验）
- 校验 9 属性 0-10000 范围
- `db.collection('player').doc(openid).update({...})` 或 `add`（首次）
- catch 错误返回 {success: false, error}

**触发时机：**
- 每回合结束（`handleAIResponse` 完成后）
- 9 属性变化时（如果独立 attrPatch 路径）
- 物品损耗/新增时
- 跨世（死 → 转入下一世）

### 云函数 2：`player_load`

**输入：**
```js
{
  // 无需参数，openid 从 wxContext 拿
}
```

**输出：**
```js
{
  success: true,
  player: {
    state: {...},
    narrateHistory: [...],
    currentItems: [...],
    life_number: 1,
    legacy: {...}|null,
    ...
  }
}
// 或
{
  success: false,
  error: 'no_player',  // 该 openid 没玩过
  // 或
  error: '...'
}
```

**逻辑：**
- `wxContext.OPENID` 拿 openid
- `db.collection('player').doc(openid).get()`
- 找到：返回 player record
- 找不到：返回 `{success: false, error: 'no_player'}`（前端用这个判断是不是新玩家）

### 前端流程：

```
玩家进游戏
  ↓
wx.login 拿 code
  ↓
callFunction(player_load)
  ↓
拿到 player → state 渲染
  ↓
玩家点选项 → 触发叙事
  ↓
handleAIResponse 完成
  ↓
自动调 callFunction(player_save)  // 每次都存
  ↓
玩家死 → 跳墓碑页 → 转入下一世
  ↓
新身份生成 → 调 player_save（life_number+1）
```

---

## 五、失败回退（D044 教训）

**player_save 失败时**：
- 提示"存档失败，重试"toast
- **不阻塞游戏继续玩**（前端 state 还在内存里）
- 玩家下次进入时如果 cloud 上没 record → **提示"数据未同步，重新开始"**（不丢太多）

**player_load 失败时**：
- 网络错 → 提示"网络错误，重试"
- `no_player` → 进身份生成页（**新玩家流程**）
- 其他错 → 进身份生成页（**保守策略：新玩家**）

---

## 六、字段校验规则（云函数端）

| 字段 | 校验 |
|---|---|
| `state.name` | 必填，string，1-20 字符 |
| `state.age` | 必填，number，0-150 |
| `state.life_number` | 必填，number，≥1 |
| `state['声望']` 等 9 属性 | 必填，number，0-10000 |
| `narrateHistory` | 必填，array，元素 `{role, content}` |
| `currentItems` | 必填，array |

校验失败 → 写云函数日志 + 返回 `{success: false, error: 'invalid_<field>'}`

---

## 七、不存的东西（明确）

| 字段 | 不存的原因 |
|---|---|
| `debugLog` | 临时调试数据，重启清空 |
| `errorMsg` | 临时错误提示 |
| `loading` / `loadingText` | UI 临时状态 |
| `loadingStart` | UI 临时状态 |
| `loadingType` | UI 临时状态 |
| `streamedText` | 打字机临时（D048c 删流式后通常为空）|
| `displayStartTime` / `displayedChars` | 打字机临时 |
| `optionsAppearTime` | 打字机临时 |
| `userScrolledAway` / `showFateDetail` | UI 临时 |
| `systemMessages` | 状态变化的 system message 列表（已合并进 narrateHistory）|
| `lastScore` 等 leaderboard 临时数据 | 排名数据（先生有单独 leaderboard 集合）|

---

## 八、迁移（如果将来要拆字段）

如果以后要拆 `player_state` 集合 / `player_items` 集合 / `player_history` 集合——
- **保留 `_id = openid`** 作为关联 key
- 迁移时 `db.collection('player').where().get()` → 批量重写新集合
- 旧集合保留 7 天兜底

---

## 九、文件改动清单

| 改动 | 文件 | 行数估计 |
|---|---|---|
| 新建 `player_save` 云函数 | cloudfunctions/player_save/index.js | 80-120 |
| 新建 `player_save/package.json` | cloudfunctions/player_save/package.json | 5 |
| 新建 `player_load` 云函数 | cloudfunctions/player_load/index.js | 60-80 |
| 新建 `player_load/package.json` | cloudfunctions/player_load/package.json | 5 |
| `cloudbaserc.json` 加 2 函数 | cloudbaserc.json | +30 |
| `init_db` 加 `player` 集合 | cloudfunctions/init_db/index.js | +5 |
| 前端 `wx.login` + `callLoadState` | minigame/scenes/identity.js | +40 |
| 前端 `callSaveState` 自动存 | minigame/scenes/game.js | +30 |
| 前端 `state` 改为"启动时拉云端" | minigame/scenes/game.js | -20（删内存缓存）|

**总改动 ~280 行**。D049 是一个完整大改，分批 deploy。

---

## 十、阶段计划（避免一改全挂）

1. **D049a**：建 `player` 集合（init_db 加 1 行）+ 建 `player_save` / `player_load` 云函数 + 部署云端
2. **D049b**：前端 `wx.login` + 手动调 `callSaveState` / `callLoadState`（玩家手动存/读）
3. **D049c**：前端自动 `callSaveState`（每回合 + 9 属性变化时）
4. **D049d**：删 `state` 纯前端缓存（彻底切到云端）

**D049a 部署完先生测通过再 D049b，依此类推**。

---

_此文档是设计稿，不是代码。先生拍板后开 D049a 改代码。_
