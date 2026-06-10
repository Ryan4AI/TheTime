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
2. **system message 触发类型**（至少覆盖 5 类）：
   - `[system · 时间]` 月份变化
   - `[system · 地点]` 城池/区域变更
   - `[system · 身份]` 身份/职业晋升或贬黜
   - `[system · 健康]` 重大健康变化
   - `[system · 财富]` 重大财富变化
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