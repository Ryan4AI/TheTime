# DECISIONS.md - TheTime 项目决策锁死档

> 所有定案的产品/技术决策。已有决策不得重开讨论，新需求开新 D 编号。

---

## D001：AI 输出格式定案

- **AI 输出 = 纯文本叙事 + 「」引语 + `[]` 选项 + JSON patch 块**
- 非 JSON（patch 块除外）、非 Markdown（无 # 无 **）
- 5 段叙事节奏：场景描写 → 事件冲击 → 内心波动 → 行动选项 → 历史回响

## D002：对话架构 = 纯对话流，无独立事件引擎

- 月份推进、健康/财富/身份变化全部由 AI 在 patch 中声明
- 无独立"事件触发器"模块
- AI 是叙事 + 状态机的统一来源

## D003：先生手机交流，禁止发文件路径

- 所有输出贴聊天窗口，路径不上屏
- 引用文件内容直接复制粘贴

## D004：v9 system prompt 定案（铁律 + 写作风格 + 输出格式）

- 5 条铁律 + 1 段写作风格 + 1 段输出格式
- 不修改这 3 段，只追加
- v10 = v9 + 9 条自检铁律 + 1 段禁忌词

## D005：前端重试机制不污染对话流

- `__retry__` 内部信号不入 messages，不推进月份
- 云函数识别后跳过 history 追加

## D006：评估 7 个 ClawHub skill 找 prompt 增强

- 选 the-storytellers-workbench（5 原则 + 7 模式）入 v10
- 其它：story-cog/3星、inkos/2星、writing-claw/3星、story-structure-builder/2星

## D007：v10 = v9 + 9 条自检 + 1 段禁忌词

- 2026-06-07 04:55 先生拍板
- 只追加，不修改 v9 三段
- 教训：先生授权过的可回滚改动（prompt/upload），即使凌晨也直接做，不套"凌晨不当真"红线

## D008：时间与状态推进权 — AI 全权 + system message 注入（2026-06-11 拍板）

### 核心规则

- **`month_delta` 由 AI 全权决定**，不再有系统兜底
- **状态变化触发 system message 注入**，角色标 `system`，进 narrativeHistory
- **AI 下一回合自动从对话流读取当前状态**，无需 prompt 塞 context

### 工程边界

1. **`month_delta` clamp 范围 [0, 60]**（先生拍板：单回合最多跳 60 个月 / 10 年）
   - 0 = 同月内多事件（"看了一天病"）
   - 1 = 默认节奏（"过了一夜"、"次日"）
   - 3 = 季度跨度（"过完冬天开春了"）
   - 60 = 极端长跨度（"十年后..."）上限
2. **system message 触发类型**（5 类，**D032 2026-06-27 23:20 先生拍板修正**：原文档"健康（≥10）/财富（≥30%）"阈值描述过时，实际代码不设阈值任意变化都列）：
   - `[system · 时间]` 年/月变化
   - `[system · 地点]` 城池/区域变更
   - `[system · 身份]` 身份/职业晋升或贬黜
   - `[system · 气血]` health 变化 ≥10（恢复 commit 3f56e01）
   - `[system · 九属性]` 任一属性变化时输出全部 9 项当前值（声望/财富/学识/颜值/医术/战功/文采/政绩/义行）
   - D032 拍板 B：财富/其他 8 属性**不设阈值**（任意变化都列，与 D008 文档原意不符但先生拍板维持现状）
3. **system message 进 messages 列表**，AI 下一轮可读
4. **`__retry__` 内部信号不进 messages**（D005 不变）

### Worker 行为

| 场景 | 行为 |
|---|---|
| AI 漏 `month_delta` 字段 | worker 保底 `month_delta: 0`（不推进月份，尊重 AI 决定） |
| AI 输出 `month_delta: 999` | clamp 到 60 |
| AI 输出 `month_delta: -1` | clamp 到 0 |
| patch 含状态字段变化 | worker 对比新旧 state，生成对应 `[system · XXX]` 消息 |
| patch 不含状态字段变化 | 不注入 system message |

### Prompt 改动（v11）

- 输出格式段追加 `month_delta` 字段说明
- 新增节奏指导段：单回合跨度典型案例（看一天病/过一夜/过冬/过三载/十年）
- v10 的 9 条自检 + 1 段禁忌词 + v9 三段全部保留不动

### 前端改动

- `game.js` 识别 system message 角色，特殊样式（淡灰色、缩进、不计入叙事字数）
- 月 UI、时间轴、状态卡片从 state 读取（D005 之后）

### 风险与缓解

| 风险 | 缓解 |
|---|---|
| AI 漏 `month_delta` | worker 保底 0 |
| AI 跨度过大（一回合写完一生） | clamp 60 + v10 第 9 条史官密探自检 |
| AI 不写 system 副作用 | worker 根据 patch 字段变化自动注入，不依赖 AI 主动写 |
| system message 污染叙事字数统计 | 前端识别角色不计入 |

### 与既有决策的对称性

- D005（重试内部信号不入流）↔ D008（外部状态变化必须入流）—— 对称设计
- D002（AI 是状态机来源）↔ D008（AI 全权决定推进）—— 一致
- D004（v9 三段不修改）↔ v11（仅追加节奏指导 + 字段说明，不动三段）—— 兼容

---

_本文件由久月维护。新决策追加，不修改旧条目（除非先生明确拍板"作废 X 条"）。_
## D009：墓志铭系统整改（2026-06-19 04:47 拍板）

### 语义分层
- **epitaph** = 死亡时 AI 生成的墓志铭（一句话格言/短句）
- **legacy** = 跨世继承的前世遗物/记忆（epitaph 文本 + 跨世传递）
- 两者语义不重叠：epitaph 是死时生成，legacy 是跨世桥梁

### 死亡 → 轮回完整链路
1. 寿限到（age ≥ lifespan）→ AI 在 patch.epitaph 写一句墓志铭
2. 全社会属性归零（社会性死亡）→ 云函数按身份/年龄兜底生成 epitaph
3. death scene 显示 epitaph（前端无兜底，无 epitaph 时用 UI 默认文案）
4. 点"再入轮回" → epitaph 写入 storage 字段 `legacy`
5. 下一世载入 state.legacy → 注入 prompt 的 `legacyContext` 段
6. 提示 AI "前世留下过这句话"（不强制每轮出现）

### 寿限提示注入（D008 范围扩展）
- age ≥ 40：注入"暮年将近"提示，让 AI 写"岁月不饶人"氛围
- age ≥ lifespan：注入"⚠ 寿限已至"，要求 AI 在本回合生成 epitaph
- **不暴露具体寿限数字**（避免 AI 抢戏、剧透）

### 强制 epitaph 生成（prompt 约束 + 后端兜底）
- **prompt 强制**（worker buildSystemPrompt）：寿限到时 AI 必须在 patch.epitaph 写一句
- **后端兜底**（worker line 175-177）：社会性死亡时 AI 没机会写，云函数按身份/年龄补
- **前端不兜底**（先生拍板）：保持 UI 简洁，AI 没写就显示默认文案

### fallback 文案（按身份 + 年龄）
- < 15 岁：`未及弱冠，便已消散于人海。`
- 15-30 岁：寒门 `青春未展，已无踪迹可寻。` / 贵族 `锦衣玉食，终化南柯一梦。`
- 30-50 岁：寒门 `碌碌半生，终归尘土。` / 贵族 `风云一世，史书半行。`
- ≥ 50 岁：寒门 `一生如梦，来去无痕。` / 贵族 `功过自有后人评。`

### 历史矛盾修复
- prompt-v11 line 51 原写"epitaph/legacy/last_words 不在本 prompt 范围"
- 改为"epitaph 由 AI 在寿限到时生成，legacy 由系统跨世传递"

## D048（2026-06-28 09:15 拍板）AI₂ 评分 prompt 重写 + 喂最近 3 轮 history

**问题：** AI₂ 评分 prompt 太简单（70 行，line 1127-1239 旧版），先生判定"质量太差"。具体问题：
- 没历史 context（不知道"上轮已结算什么"）
- "判断步骤"空话，没具体"什么剧情→什么数值"映射
- 数值幅度"重大事件 ±100~500" 太宽
- 没给物品识别规则
- month_delta 写"参考上方判断步骤 3"——步骤 3 就一句"剧情时间跨度多久"

**修复：**
- caller (line 214)：`callScoringAI(picked.content, preUpdate)` → `+ history`
- 函数签名 (line 1145)：加 `history` 参数 + recentHistory IIFE（`history.slice(-6)`，system 标"系统"）
- scorePrompt (line 1161-1338)：完全重写 178 行 4960 字符
  - 加 3 段背景（产品定位"AI₂是计分系统"/玩家档案"普通人+9属性+物品"/剧情解读"显性/隐性信号"）
  - 主体改 7 段（任务/输入/输出/数值 5 档/抑制 4 档/判断 8 步/年龄/强制）
- 9 属性各列"加分/减分/不变"事件清单（避免 AI 瞎猜）
- 数值幅度从 3 档扩到 5 档（5-15 / 20-50 / 60-200 / 300-800 / 1000+）
- 抑制规则 4 档（1000×0.7, 3000×0.4, 5000×0.2, 8000×0.1）
- 判断步骤从 5 步扩到 8 步（第 1 步专门"扫前情，避免重复算"）

**约束（先生红线）：**
- 叙事 AI（callAI / buildSystemPrompt）一字未动
- callAI 的 history 处理（line 654 全量）一字未动
- history 截断只给 callScoringAI

**验证：**
- `mock-d048-scoring.js` 36 项检查全过
- node -c SYNTAX OK
- 1 个 scorePrompt 数组（无新旧残留）

**版本：待 deploy**（commit 284d5c1）

---

## D050（2026-06-30 11:15 拍板）D040 红线违规清理 + 自检矛盾修正

**问题：** D040（先生 2026-06-28 拍板）明确禁止 prompt 模板字符串（反引号内）出现"对人解释"的注释。先生 11:15 检查 system prompt 约束时发现违规：

主 prompt 违规 4 处：
1. 物品新增规则段 — "AI₂ 属性评分时会根据你的剧情内容生成新物品记录（你不需要在 JSON 里写物品字段）"
2. 叙事中的属性体现段 — "属性数值变化由评分系统根据你的剧情内容自动计算"
3. 自检 #3 — "（评分系统会自动处理耐久）"
4. 死亡判定重复句 — "死亡判定由系统负责" 出现 2 次（末段冗余）

矛盾点：
- 铁律 #1 "生死成败由系统掷骰子"
- 自检 #17 "**系统不再掷骰子**——AI 完全决定选项的结果"
- 自检 #18 "本月无历史事件（系统掷骰子没触发考验）"
- 3 条前后打架，先生"3 不改其它改"隐含拍板 = 改自检不改铁律（铁律 #1 是规则术语）

v3.0.9c 描述变更段（也是 D040 精神违规）：
- 历史名人榜末尾段 "约束：现在只输出 1 个 narrative（不再有 p 字段）· 不需要管'分支 p 之和'"
- 这是变更描述（对人解释为什么改了），不是对 AI 的指令 → 改正向

**修复（main prompt）：**
- D040 违规 4 处全清
- 自检 #17 改成 "AI 在 content 里写明玩家'消耗了什么/受到了什么损耗'，玩家下一状态就反映这些损耗。AI 不写死亡（见铁律 1）"
- 自检 #18 删括号 "（系统掷骰子没触发考验）"
- 历史名人榜末尾 "约束" 改成 "# 写作守则" → "只输出 1 个 narrative + 3 个 options，不要输出 p 字段或多分支"

**callScoringAI prompt 第二轮清理（12:08 拍板·先生"都改吧"）：**
- 删"你（AI₂）是游戏的'计分系统'。游戏分两层 AI…"段 8 行（"计分系统/玩家看不到/产品核心体验"对人解释）
- 删"AI₁ 写的剧情不是'客观报道'" → "剧情不是'客观报道'"
- 删"9 项社会属性（数值范围 0~10000，越高越接近历史上榜名人）"尾标
- 删"玩家做的每个选择都会留下'数字'…也是他能不能被史书记一笔的判断依据"尾句
- 改"已有属性越高，再增长越难——这是系统约束，不是你决定的" → "按下方'抑制规则'算"
- 删"【系统记分员】" → "计分员"

**未动：**
- MiniMax 多 system 2013 风险观察（先生 11:15 "3 不改"留观察）
- 自检 #1 之前的内容（NPC + 物品 + 阶层 + 戏剧 + 信息密度 + 爽点密度 + 角色矛盾 + 节奏分配 + 物品母题 + 回合末钩子 + NPC 同框 + NPC 行为一致 + 情感真实）— 这些是规则指令不是对人解释
- 铁律 #1 "系统掷骰子" — 是规则术语，不是对人解释

**约束：**
- 铁律 #1/2/3/4/5/6/7/8/9 一字不动
- 写作风格段（8 条）+ 输出格式段一字不动
- 禁忌词段（"穿越者/外卖/996"等）一字不动

**部署：**
- 第一次（commit `a8deb43`，仅 main prompt）：`tcb fn deploy ai_narrate_worker --force --dir cloudfunctions/ai_narrate_worker` ✅
- 第二次（commit 第二次，main prompt + callScoringAI prompt 都清完）：✅ 再 deploy 一次
- 先生 ping github `57c1e0d..a8deb43 main -> main` ✅

**两次部署全过：** 两次 `node -c` 通过 + 两次 COS 上传部署成功（先生手机 DBG 浮窗可以验：`system_prompt` tab 看新 prompt 实际生效）

## D062（2026-07-05 10:13 先生拍板）player_load 排序真因：_id 不带时间戳，改 created_at asc

**问题：** 先生 10:02 反馈"重进游戏前端显示的不是最近一条剧情，而是第一条"。

**真因排查：**
- player_load 用 `.orderBy('_id', 'asc')` 排序 narrate_history
- D056 当时拍板注释写"云数据库 _id 包含时间戳"——**判断错的**
- 实际上 CloudBase 自动 `_id` 是 32 hex 随机字符串，**不带时间戳信息**（不像 MongoDB ObjectId 前 4 字节是时间戳秒数）
- 真因验证：先生云端 3 条 ai 按 `_id asc` 拿到的是「街上议论 → 客栈门口 → 告示栏转身」（字典序），不是时间顺序
- 真因：先生重进时 narrativeHistory = 字典序随机排序；game.init line 234-244 "从后往前找第一条 ai" → 拿到的是字典序最靠后那条 = 时间上最早那条（07-04 22:18 告示栏）

**修复（一行改动）：**
- `cloudfunctions/player_load/index.js` line 33：`.orderBy('_id', 'asc')` → `.orderBy('created_at', 'asc')`
- 注释修正：`_id 包含时间戳，asc = 旧→新` → `created_at 是 worker 写入时的 Date.now() 毫秒时间戳，asc = 旧→新`
- `cloudfunctions/ai_narrate_worker/index.js` line 324 注释：删"云数据库 _id 自带去重"误导说明，加"D056 当初判断错 / D062 修正"标注

**红线遵守：**
- ✅ **不动数据库设计**（先生 10:10 拍板红线）
  - 字段名 `created_at` 不改 `event_at`
  - 不建索引（先生 3 条数据无所谓）
  - 不加 event_type 字段
  - 不数据迁移

**mock 测试：**
- `minigame/mock-d062-player-load.js` 用先生真实 3 条 ai 数据（07-04 22:18 / 07-05 09:00 / 07-05 09:01）
- 测试通过：第 0 条告示栏（最早）→ 第 1 条街上议论 → 第 2 条客栈门口（最近）

**部署：**
- `tcb fn deploy player_load --force` ✅ COS 上传成功
- ai_narrate_worker 注释只改没新代码逻辑，**不需重新 deploy**（下次改 worker 代码时一起部署）

**先生验收（10:20 拍板"可以"）：**
- 杀进程重进游戏 → narrative 应显示「你披衣下楼，客栈门口已经围了一群人...」（第 2 条，最近）
- DBG 浮窗 → 「对话流」tab → narrativeHistory 数组应按时间升序：告示栏转身 → 街上议论 → 客栈门口围人

**未做（待先生决定）：**
- DECISIONS.md 落后 D051-D061 60+ 决策未落档（先生没让补，先不动）
- 远端 ahead 12 + 本次 D062 commit 仍未 push（先生自助）

---

## D090（2026-07-20 01:11 先生拍板"彻底整改"）state 真值迁移到云端 player_life，前端变纯视图+输入

### 背景（先生连续 4 问逼出的架构本质）
D089 两阶段改造后，发现"新一轮生成拿旧 state"的隐患。先生连续质疑：
1. 选项为何等属性评分？→ 已修(partial 同屏)
2. 新一轮要等上一轮属性结算完 → 最初想前端缓存(awaitingFinalize)，先生否
3. 为何前端传 state 给后端？→ 先生：后端自己有 state 吗？
4. 为何前端传 life_number？→ 先生：后端不是自己也有吗？转世为何要专门 action？→ 先生：调 generate_identity 就创建新世了

**本质**：前端不该持有真值。state 权威必须在云端 player_life，前端只发 openid+input，收 result 渲染。

### 决策（彻底整改）
- **player_life 是真值**：life_number + state 全部由云端持有。
- **generate_identity 改为写库**：生成 identity 后分配 life_number（查 player_life 最新世+1，首世=1），把初始 state 写进 player_life（含 openid）。转世=调 generate_identity 创建新世，不新增 action。
- **ai_narrate_submit 只传 openid + input**（删 state / life_number 传递）。
- **ai_narrate_worker 从 player_life 拉最新世 state**（不读 event.state）；finalize 算完写回 player_life（updated + last_finalize_at 时间戳）；第二轮 worker 开头若上一轮 finalize 未完（last_finalize_at 早于本轮 callAI 开始时间），短等重试直到拿到结算后 state。
- **前端 callAI 只发 openid + input**；handleAIResponse 保留 result.state merge（仅显示用副本，非真值）；autoSaveToCloud 删 state 写入（后端已是真值）。
- **initIdentity 改为**：调 generate_identity（后端写 player_life）→ submit 拉回 state 渲染（首屏用 identity 占位）。
- **回滚 D089-fix2 的 awaitingFinalize / pendingSelection**（后端自治后前端零缓存）。

### 真值时序保证
- 首世：generate_identity 写 player_life（life_number=1, initial state）
- 续世：submit → worker 读 player_life 最新世 → callAI → finalize 写回 player_life（updated）
- 转世：death scene 调 generate_identity → 写 player_life（life_number=N+1）→ submit 续新世
- 第二轮 submit 永远读到"上一轮 finalize 写回的 state"（短等保证），不会拿旧值算

### 字段变更（无 schema 破坏，仅新增）
- player_life 新增 `last_finalize_at`（finalize 完成时间戳），用于第二轮 worker 短等仲裁。

### 风险
- 涉及身份生成+存档+叙事三条核心链路，需 mock 测试 + 后端部署 + 前端上传 + 真机验收。
- 首局时序：generate_identity 必须先在 player_life 落记录，worker 才能读到；若 worker 读到空（异常）直接报错返回，不兜底生成（先生：能发 submit 必已有世）。

### 状态
- 实施中（2026-07-20 01:11 起）

## D094（2026-07-22 01:18 先生拍板）业务数据与 AI 调试数据彻底分离

### 问题
D089/D090 两阶段实现错误地把 `llm_io.output.result` 当成前端业务结果和 A₂ 完成通道。`llm_io` 的正确职责只是 AI 调用调试记录；当前 worker 先写 `partial:true`，再用未 await 的后台 `finalizeTask` 覆盖同一条 `llm_io`，导致最新真实记录长期停在 partial，前端属性和年月不刷新。

### 定案
- `llm_io` 只记录调试信息：prompt、原始响应、耗时、错误；不得作为业务状态、业务结果、A₂ 任务队列或前端业务结果来源。
- `player_life` 是状态真值：年月、回合、年龄、九属性、物品及最终结算状态写入这里。
- `narrate_history` 是玩家可见消息真值：AI₁ 生成的叙事和选项必须先入库，再返回前端展示；A₂ 以这条已入库的玩家可见 AI 消息为评分对象，不以 llm_io 或前端上下文为业务依据。
- 前端只负责提交输入和展示，不提交 state/history；前端轮询业务结果接口，不直接依赖 llm_io。
- A₂ 必须是独立、可靠的云函数调用，不能依赖主函数返回后的悬空 Promise。
- `request_id` 仅作为一次异步任务/结果轮询的关联号，不是业务内容真值；业务内容以 narrate_history、状态以 player_life 为准。
- 同一玩家同一世同一时间只能有一条待结算 AI 消息；已有待结算消息时不得创建下一轮，避免“最新消息”歧义和重复结算。
- `partial` 作为业务结果接口的展示状态保留：`true`=消息已展示、状态待结算；`false`=A₂ 已完成，前端可刷新状态；失败必须是明确错误状态，不得伪装成 partial。

### 改造范围
1. AI₁：先写 narrate_history 的 AI 消息，再返回 partial；保存必要的待结算标记。
2. 独立 A₂ 函数：读取唯一待结算的已入库 AI 消息，调用评分 AI，写回 player_life，并标记消息已结算。
3. 业务结果函数：从 player_life + narrate_history 返回 pending/final/error，不从 llm_io 读取业务结果。
4. llm_io 保留旁路 debug 写入，不参与业务判断。
5. 前端继续 partial→final 的展示流程，但数据源切换到业务结果接口。

### 约束
- 不删除历史 llm_io 数据。
- 不新增“前端状态上传”路径。
- 涉及 narrate_history 待结算字段和业务结果读取路径；实现前须先核对现有 schema，避免破坏历史数据。
