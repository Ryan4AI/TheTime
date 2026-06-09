# TheTime · 推进计划

> 维护者：久月（PMO cron 任务）
> 单一事实源：`docs/design.md` §七（实现状态总览）—— **先生亲自维护**
> 本文件：PMO 工作日志，记录推进过程，不替代 design.md

---

## 状态快照（最新一次 cron 运行 · 2026-06-09 09:01）

| 维度 | 状态 | 备注 |
|------|------|------|
| Git 工作树 | 脏（3 modified / 0 untracked） | 先生昨晚 02:06 已 commit（D008 bugfix），昨日 24 个 untracked 全部入库 |
| 远端 main | `329fc56`（D008 v0.1.69 ai_narrate 修 3 硬编码 bug） | 本地已同步，**远端 7 小时无新 commit** |
| 本地 main | `329fc56`（作者：久月） | 跟远端一致 · 凌晨由 久月代 commit（D008 包） |
| 云函数部署 | 6 个 ✅ / 1 个新 (`ai_narrate`) 未部署 | 本地 `ai_narrate/index.js` 612 行 + 凌晨调优未部署（max_tokens 2500 / timeout 120s / M2.7-highspeed） |
| 新增云函数 | `gen_image`（Pollinations 水墨图）97 行 | 本地新建，**未部署** |
| 数据库 | 5 集合：era_meta **115/22 朝代** / era_cities 167 / era_age_dist 9881 / social_structure 619 / event 197 | era_meta 22 个朝代（夏/商/西周/春秋/战国/秦/西汉/东汉/三国/西晋/东晋/南北朝/隋/唐/五代十国/北宋/南宋/元/明/清/中华民国/中华人民共和国），event 未涨 |
| 场景文件 | 5 个：entry / game / identity / intro / selection | game.js 1735 行（凌晨 commit 中改了 +32/-19 行，复制按钮改"只复制最新一轮"） |
| 上次 PMO cron | 2026-06-08 21:01（第 3 次） | 本次是 2026-06-09 09:01（早档），距上次 12 小时 |

---

## design.md §七 待完成项（PMO 推进跟踪）

> 来自 `docs/design.md` §七。**完成时**：
> - PROJECT.md 标 `[DONE YYYY-MM-DD]`
> - 提议先生更新 `docs/design.md` §七（先生自己改）

### ❌ 待完成（来自 design.md §七）

#### 1. message 集合的数据读写写入逻辑
- 状态：未动
- 阻塞：D001（JSON 数组+平行剧情分支）落地
- 涉及：`ai_message` / `user_message` / `system_message` / `lives` / `meta_message` 5 个集合
- 子任务：
  - [ ] ai_message 写入：解析 AI 返回 JSON，存入 `items[]`
  - [ ] user_message 写入：选项 + 自由输入
  - [ ] system_message 写入：选中结果 + 状态更新 + 月份事件
  - [ ] lives 写入：每世开始/结束
  - [ ] meta_message 写入：时序引用
- 最近进展：—

#### 2. game.js AI 集成（替换硬编码对话）
- 状态：未动
- 阻塞：D001 prompt 落地
- 涉及：`minigame/scenes/game.js`（1367 行重写，工作树已改）
- 子任务：
  - [ ] 读 `docs/prompt.md` system 段
  - [ ] 设计 game.js 调云函数 `ai_narrate` 的流程
  - [ ] 解析 `items[]` JSON
  - [ ] 渲染 2~4 个分支按钮
  - [ ] 玩家选项 → 写 user_message
- 最近进展：—

#### 3. 跨世痕迹系统（lives 集合的读写）
- 状态：未动
- 阻塞：message 写入逻辑（D001 落地）
- 设计参考：`docs/design.md` §3.7（死亡与跨世）

#### 4. 游戏端状态追踪（年龄/金钱/地点/物品状态变化）
- 状态：未动
- 阻塞：game.js AI 集成
- 涉及：`patch` 字段（coin/health/items）

#### 5. 事件库扩展到更多朝代
- 状态：部分
- 已入库：5 张表共 ~9900 条
- 阻塞：历史事件精确性
- 子任务：
  - [ ] 跨世事件跨朝代（宋元明清已入库）
  - [ ] 各朝代事件密度（北宋 1 年/月 是否够？）
  - [ ] 城市级 vs 全国级事件分类

#### 6. 真机测试自由输入（wx.showKeyboard）
- 状态：未动
- 阻塞：game.js AI 集成

#### 7. 死亡判定逻辑
- 状态：未动
- 阻塞：状态追踪
- 涉及：`health` 字段变化（patch.health 累加）
- 系统判定，不写"你死了"

#### 8. 轮回记录与展示
- 状态：未动
- 阻塞：跨世痕迹系统
- 涉及：lives 集合的展示

### 🚧 部分完成（来自 design.md §七）

#### A. `generate_identity` 云函数有 story mode 半成品
- 状态：半成品
- 阻塞：D001 落地后整个 story mode 改写
- 涉及：`cloudfunctions/generate_identity/index.js`（+11 行，工作树已改）

#### B. `game.js` 有叙事对话框架但全是硬编码节点
- 状态：半成品
- 阻塞：D001 集成
- 涉及：`minigame/scenes/game.js`（+651/-1367 重大重写）

---

## 🚧 推进中（先生手头任务）

- **`cloudfunctions/ai_narrate/`** —— D001 的新云函数，本地有，**未部署**
- **`cloudfunctions/gen_image/`** —— 新加的 Pollinations 水墨配图云函数（97 行），**未部署**
- **`docs/design.md` §七** —— 单一事实源，先生亲自维护
- **`docs/prompt.md`** —— 已定稿（D001 格式，v10 自检 20 条）

### 先生手头未提交改动（2026-06-08 21:01 盘点）

> ⚠️ **先生白天有大动作**（vs 09:01 早档几乎没动）。D001 集成路径清晰化：
> - game.js → ui.js → identity.js → ai_narrate 一条线都在动
> - `eventsContext` 真正接入 prompt 段（v0.1.69 修 bug）
> - `gen_image` 新加的云函数（穿越日记水墨配图）
> PMO 不擅自 commit，先生亲自审。

| 文件 | 改动量 | v0.1.x 标记 | 内容推断 |
|------|--------|------------|---------|
| `minigame/scenes/game.js` | (本地独立大改，1735 行) | v0.1.70/71/74/75 | AI 叙事主场景重写，集成 `ai_narrate` |
| `minigame/engine/ui.js` | +62/-0 | — | 加 `drawCenteredText` / `drawTextInRect` 工具；`getSystemInfo` 暴露 windowWidth/Height |
| `minigame/scenes/identity.js` | +15/-0 | v0.1.70/72 | 加 `city`/`year` 字段；玉牒光点 sin 呼吸动画 |
| `cloudfunctions/ai_narrate/index.js` | +1/-1 | v0.1.69 | `eventsContext` 真正传入 prompt（修事件上下文缺失 bug） |
| `.cloudbaserc.json` | +7/-0 | — | 加 `gen_image` 云函数配置（timeout 20 / mem 256） |
| `cloudbaserc.json` | 新文件 | — | v2 格式 `ai_narrate` 配置（与 .cloudbaserc.json 并存） |
| `cloudfunctions/ai_narrate/.cloudbaserc.json` | 新文件 | — | 单函数独立部署配置 |
| `cloudfunctions/ai_narrate/.cloudbaserc.json.bak.20260603` | 新文件 | — | 先生备份（**不删**） |
| `cloudfunctions/ai_narrate/index.js.bak.20260603` | 新文件 | — | 先生备份（**不删**） |
| `cloudfunctions/ai_narrate/index.js.bak.20260604-fallback` | 新文件 | — | DeepSeek 切 M2.7 时点备份（**不删**） |
| `cloudfunctions/ai_narrate/package.json` | 新文件 | — | 含 `wx-server-sdk ~2.6.3` 依赖 |
| `cloudfunctions/ai_narrate/scf_bootstrap` | 新文件 | — | 4 行 bash 启动脚本 |
| `cloudfunctions/gen_image/` | 新目录（97 行） | — | Pollinations 水墨图生成（朝代→场景 prompt→URL） |
| `data/event_*.json` ×12 + 5 个 upsert_log + 4 个 event_backup | untracked | — | 事件 month 清洗工作文件（先生手动入库痕迹） |

**D001 链路当前状态**（PMO 视角）：
- ✅ `ai_narrate` 云函数代码完整（612 行） + DeepSeek 切换兜底为 M2.7
- ✅ `game.js` 已调用 `ai_narrate` 云函数（line 255），解析 `branches[]` JSON
- ✅ prompt v10 已定稿（20 条自检 + D007 跨世机制）
- ✅ 身份数据（city/year）已对齐（v0.1.70 双向字段）
- ⏳ `ai_narrate` 部署（先生手头）
- ⏳ 真机测试（需微信开发者工具）
- ⏳ message 集合写入（先生未动）

**`gen_image` 评估**（PMO 建议）：
- 不是 D001 关键路径（独立功能）
- Pollinations 免费 → 落地成本低
- 阻塞：未在 design.md §七 立项 → 建议先生补一条 ✅ "穿越日记水墨配图（gen_image 云函数）"

---

## ⚠️ 需先生决策（PMO 没法自己定）

1. **`gen_image` 是否立项并部署？** 当前未在 design.md §七 立项，但 `.cloudbaserc.json` 已配 97 行代码 → 已半立项状态；是穿越日记水墨配图，非 D001 关键路径
2. **`.cloudbaserc.json` vs `cloudbaserc.json` 双文件合并？** v1 + v2 并存，先生凌晨 commit 里两个都保留了，哪个是真相源？
3. **`ai_narrate` 部署？** v0.1.73（max_tokens 2500 / M2.7-highspeed / timeout 120s）已在工作树，本地未部署 → 需先生决定何时 deploy
4. **message 集合写入逻辑是否优先？** D001 关键路径，当前 game.js AI 集成已接入 `ai_narrate`，但 message 写入尚未实现

---

## 📅 PMO cron 简报历史

### 2026-06-08 21:01 · 第 3 次（周一晚）
- **重要观察**：先生白天有大动作（09:01 → 21:01 12 小时内）
- D001 集成链路清晰化：`ai_narrate` + `game.js` + `identity.js` + `ui.js` 都在动
- 关键 bug 修复：`eventsContext` 真正接入 prompt 段（v0.1.69）
- 新增：`gen_image` 水墨配图云函数（97 行 + .cloudbaserc.json 已配）
- 数据库 event 197 条（vs 09:01 提到 100+，先生今天又入了 90+ 条）
- 远端 5 天无新 commit → 先生还在堆本地改动
- 未决：先生手头 `ai_narrate` 部署 / `gen_image` 是否立项 / message 集合写入

### 2026-06-09 09:01 · 第 4 次（周二早）
- 凌晨 02:06 由 久月代 commit（D008 bugfix 包）——先生授权后操作
- 工作树：3 modified / 0 untracked（昨日 24 个 untracked 全部入库）
- 本地/远端均已同步至 `329fc56`（ai_narrate v0.1.69）
- **era_meta 新里程碑**：22 个朝代（115 切片），cron 目标 22+ 已达成
- 事件库未涨（event 197 条），`events_to_upsert.json` 已入库但未实际 upsert
- 需先生决策：`gen_image` 立项 / `.cloudbaserc.json` 双文件合并 / `ai_narrate` 部署

### 2026-06-08 21:01 · 第 3 次（周一晚）
- **重要观察**：先生白天有大动作（09:01 → 21:01 12 小时内）
- D001 集成链路清晰化：`ai_narrate` + `game.js` + `identity.js` + `ui.js` 都在动
- 关键 bug 修复：`eventsContext` 真正接入 prompt 段（v0.1.69）
- 新增：`gen_image` 水墨配图云函数（97 行 + .cloudbaserc.json 已配）
- 数据库 event 197 条（vs 09:01 提到 100+，先生今天又入了 90+ 条）
- 远端 5 天无新 commit → 先生还在堆本地改动
- 未决：先生手头 `ai_narrate` 部署 / `gen_image` 是否立项 / message 集合写入

### 2026-06-08 09:01 · 第 2 次（周一早）
- 先生本地 / 远端都停在 `9fcdaef`（prompt v10 第四期）
- 先生 5 天没 commit
- 远端无新 commit，先生本地 4 个 modified 都是先生在做 D001 落地
- 未决：先生手头 `ai_narrate/` 部署 / `game.js` 集成推进（先生亲自审）

### 2026-06-03 00:34 · 第 1 次（启动）
- 建立 PROJECT.md（PMO 工作日志）
- 建立 `thetime-pmo-push` cron（每天 9:00 + 21:00）
- 删 3 个小知也 cron（项目已叫停）
- Git 同步：远端 5273a3f 已拉到本地，工作树脏（先生手头 5 modified + 1 untracked）
- 未决：先生手头 `ai_narrate/` 部署 / `game.js` 集成推进

---

## 🔍 A 类自动修复候选（待先生授权才做）

按 cron 规则，**PMO 不擅自做 A 类修复**（包括清理先生备份文件），需先生点头：

| 候选 | 描述 | 风险 |
|------|------|------|
| 清理 `cloudfunctions/ai_narrate/*.bak*` | 删 2 个备份 + 1 个 .cloudbaserc.json.bak | 删错回不去 → 等先生 |
| 清理 `data/event_*.json` ×12 | 12 个 untracked 工作文件 | 可能是先生手动入库的中间产物 → 不删 |
| 清理 `data/upsert_log_*.json` ×4 | 上日志备份（74K~83K）| 历史审计用 → 不删 |
| 合并 `.cloudbaserc.json` + `cloudbaserc.json` | v1 v2 并存 | 改配置文件 → 需先生确认 |

→ **本轮 A 类修复 = 0 项**（先生备份/工作文件不能擅自动）

---

## 📌 PMO 推进观察（持续记录）

- **2026-06-08 21:01**：先生本地改动堆速明显加快（12 小时 4 modified → 4 modified + 24 untracked）
- **2026-06-08 21:01**：v0.1.69 ~ v0.1.75 标记分布在 game.js / identity.js（无连贯 commit 记录），推断是先生分多次保存
- **2026-06-08 21:01**：`eventsContext` v0.1.69 是关键 bug fix —— 之前 months 无事件时 prompt 段是空字符串
- **2026-06-08 21:01**：DB event 197 条 vs 先生本地 `events_to_upsert.json` 仍有工作文件 → 入库流程可能未完成

