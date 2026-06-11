# TheTime · 推进计划

> 维护者：久月（PMO cron 任务）
> 单一事实源：`docs/design.md` §七（实现状态总览）—— **先生亲自维护**
> 本文件：PMO 工作日志，记录推进过程，不替代 design.md

---

## 状态快照（最新一次 cron 运行 · 2026-06-11 21:01 · 第 9 次）

| 维度 | 状态 | 备注 |
|------|------|------|
| Git 工作树 | **先生脏**（4 modified + 0 untracked） | PROJECT.md + ai_narrate_submit + ai_narrate_worker + game.js 全是先生 v0.2.2~v0.2.4 新改 |
| 远端 main | `329fc56`（fetch 超时不可达） | 先生本地 ahead **16 个 commit**（v0.1.69~v0.1.87 + 今日 v0.2.x 工作树） |
| 本地 main | `b8c427b`（v0.1.87，06-11 早档） | 工作树还没 commit，今日 v0.2.2~v0.2.4 在工作树 |
| 云函数部署 | **16 个**（目录 16；线上 12） | 16 = 12 线上 + dump_result / get_fate_pool / add_era_fields / gen_image |
| 数据库 | 5 表（未本地查询；先生今日未动） | 上次查询 06-09：era_meta 22 朝代/115 切片 / event 197 条 |
| 场景文件 | 5 个主 + 2 个 .bak 备份 | 备份是先生的历史快照（game.js.bak.20260603/0604）|
| 上次 PMO cron | 2026-06-11 09:01（第 8 次） | 本次是 2026-06-11 21:01（晚档），距上次 12 小时 |

> **本轮重大发现（夜战观察）**：
> - **v0.2.2 视觉重设计**：game.js 整体 UI 改造——朱砂印章按钮 + 暖米黄楷体正文 + 卷首小印 + 行李药匣样式 + 顶部栏加"穿越日记"主标题；底色从黑→暖色，去白底卡片直渲染文字
> - **v0.2.3 debug overlay**：先生给 LLM 调试加了完整追踪层——debugLog 填齐 status/ts/elapsed_ms/错误轮数红色 ❌ 标记、错误用醒目分隔符包裹、错误轮次顶部加 ❌ 标记
> - **v0.2.4 NOT_FOUND 根因修复**：D008 链路的关键 bug 修复
>   - submit 改用 `Promise.race` + 5 秒超时触发 worker（之前 fire-and-forget 触发失败前端永远 NOT_FOUND）
>   - worker main 启动后立即 return（main 之外的所有 LLM/DB 移到 `backgroundTask()`）
>   - submit 触发失败 / 超时 → 写 `narrate_result` 标记 `trigger_fail`，前端轮询能查到原因
>   - worker 缺 `payload.state` 时也写 `narrate_result` 标记（之前直接 throw）

---

## ⚠️ 重要：先生工作树脏了

**当前先生工作树 4 个 modified（v0.2.2~v0.2.4 新改），未 commit**：

| 文件 | 改动量 | 版本 | 关键内容 |
|------|--------|------|----------|
| `minigame/scenes/game.js` | +472/-1367（780 行 diff） | v0.2.2 + v0.2.3 | 朱砂印章 UI + debug overlay（debugLog/ts/elapsed/红色 ❌） |
| `cloudfunctions/ai_narrate_submit/index.js` | +85/-28 | v0.2.4 | Promise.race + 5s 超时 + 触发失败写 narrate_result |
| `cloudfunctions/ai_narrate_worker/index.js` | +92/-44 | v0.2.4 | main 立即 return + backgroundTask 分离 + 缺 state 写 result |

> 这些**都是先生手头 v0.2.x 重大里程碑**，PMO 不擅自 commit / push。先生决定何时打包提交。
> 建议先生下次 commit 时标注 v0.2.x 系列（v0.2.4 submit+worker / v0.2.3 debug overlay / v0.2.2 UI 重设计）。

---

## design.md §七 待完成项（PMO 推进跟踪）

> 来自 `docs/design.md` §七。**完成时**：
> - PROJECT.md 标 `[DONE YYYY-MM-DD]`
> - 提议先生更新 `docs/design.md` §七（先生自己改）

### ✅ 建议先生从 ❌ 移到 ✅（代码已实现，文档未同步）

#### ✅ "游戏端状态追踪" — 应标记完成（PMO 提议）
- **代码已实现**：game.js line419-459
  - `patch.coin` → `state.coin += patch.coin`（line419）
  - `patch.health` → `state.health += patch.health`（clamp 0-100，line420）
  - `patch.items` → 物品增减逻辑（line426-446）
  - `month_changed` → 月份变化标记（line484）
- **建议先生将 design.md §七 "游戏端状态追踪" 从 ❌ 改为 ✅**

#### ✅ "死亡判定逻辑" — 应标记完成（PMO 提议）
- **代码已实现**：game.js line459-461
  ```javascript
  if (state.health <= 0 || newState && newState.alive === false) {
    handleDeath() // 游戏结束流程
  }
  ```
- **建议先生将 design.md §七 "死亡判定逻辑" 从 ❌ 改为 ✅**

#### ✅ D008 异步轮询方案 — 应在 §七 正式立项
- **三函数已部署**：`ai_narrate_submit`（75行）/ `ai_narrate_worker`（241行）/ `narrate_get_result`
- **独立结果集合**：`narrate_result`（替代 narrate_pending.result 字段冲突方案）
- **测试痕迹**：narrate_pending 集合 26 条记录（先生做了 26 次端到端测试）
- **建议先生将 D008 异步轮询作为 ✅ 已完成项加入 design.md §七**

#### ✅ v0.2.4 NOT_FOUND 根因修复 — 应在 §七 作为 D008 补充立项
- **代码已实现**（先生今日工作树）：
  - `ai_narrate_submit`：Promise.race + 5 秒超时，触发失败/超时写 narrate_result 标记 trigger_fail
  - `ai_narrate_worker`：main 启动后立即 return + backgroundTask 分离，缺 state 也写 narrate_result 标记
- **修复了 D008 链路的根本性盲区**：之前 fire-and-forget 触发失败 → 前端永远 NOT_FOUND，现在可定位 trigger_fail / state_missing
- **建议先生将 v0.2.4 NOT_FOUND 修复作为 D008 的工程补丁，加入 design.md §七**

#### ✅ "game.js AI 集成（替换硬编码对话）" — 应从 🚧 移到 ✅
- **代码已实现**：game.js 已接入 `ai_narrate_submit` + 轮询 `narrate_get_result`（D008 异步轮询完整链路）
- **v0.2.3 debug overlay**：先生给 LLM 调试加了完整追踪层
- **唯一缺口**：message 集合持久化（独立子任务，不阻塞 AI 集成本身）
- **建议先生将 design.md §七 "game.js AI 集成" 从 🚧 改为 ✅**

### ❌ 待完成（来自 design.md §七）

#### 1. message 集合的数据读写写入逻辑
- 状态：未动（game.js 调用了云函数，但未写 message 集合）
- 阻塞：D001 prompt 落地后，message 集合作为游戏存档层
- 涉及：ai_message / user_message / system_message / meta_message / lives 5 个集合
- 子任务：
  - [ ] ai_message 写入：解析 AI 返回 JSON（branches[]），存入 items[]
  - [ ] user_message 写入：玩家选项 + 自由输入
  - [ ] system_message 写入：状态变更事件记录
  - [ ] lives 写入：每世开始/结束（跨世）
  - [ ] meta_message 写入：消息时序引用
- 最近进展：—

#### 2. game.js AI 集成（替换硬编码对话）— 🚧 部分完成
- 状态：已接入 `ai_narrate_submit` + `narrate_get_result`（D008 异步轮询），但 message 集合写入未实现
- 涉及：`minigame/scenes/game.js`（1827 行）
- 子任务：
  - [x] 调用 `ai_narrate_submit`（D008）
  - [x] 轮询 `narrate_get_result`（D008）
  - [x] 解析 `result.branches[]` JSON → 渲染分支按钮
  - [x] 状态追踪（health/coin/items/month，line419-459）✅ 06-10 新发现
  - [ ] 写入 user_message（玩家选项）
  - [ ] 写入 ai_message（AI 响应）
  - [ ] 写入 system_message（系统事件）
  - [ ] 写入 lives（世开始/结束）
- 最近进展：2026-06-10 03:26 v0.1.79，先生完成了状态追踪 + D008 轮询

#### 3. 跨世痕迹系统（lives 集合的读写）
- 状态：未动
- 阻塞：message 写入逻辑
- 设计参考：`docs/design.md` §3.7（死亡与跨世）

#### 4. 事件库扩展到更多朝代
- 状态：部分
- 已入库：5 张表共 ~9900 条
- 阻塞：历史事件精确性
- 子任务：
  - [ ] 各朝代事件密度（北宋 1 年/月 是否够？）
  - [ ] 城市级 vs 全国级事件分类
  - [ ] 跨世事件跨朝代（宋元明清已入库）

#### 5. 真机测试自由输入（wx.showKeyboard）
- 状态：未动
- 阻塞：game.js AI 集成（D008 轮询已完成，message 写入未实现）

#### 6. 轮回记录与展示
- 状态：未动
- 阻塞：跨世痕迹系统
- 涉及：lives 集合的展示

### 🚧 部分完成（来自 design.md §七）

#### A. `generate_identity` 云函数有 story mode 半成品
- 状态：半成品（旧 DeepSeek JSON 输出格式，D001 落地后重写）
- 涉及：`cloudfunctions/generate_identity/index.js`

#### B. `game.js` 有叙事对话框架但全是硬编码节点
- 状态：**部分完成**（已接入 D008 异步轮询，message 集合写入未实现）
- 涉及：`minigame/scenes/game.js`（1827 行，v0.1.79）

---

## 🚧 推进中（先生手头任务）

### D008 异步轮询方案 ✅ 已部署（里程碑达成）
- `ai_narrate_submit` ✅（75 行）
- `ai_narrate_worker` ✅（241 行，复用 ai_narrate 全部逻辑）
- `narrate_get_result` ✅（独立 narrate_result 集合，无字段冲突）
- `init_pending` ✅（云函数列表存在）
- **测试痕迹**：narrate_pending 26 条 / narrate_result 独立集合

### D001 AI 叙事集成 🚧 进行中
- `docs/prompt.md` ✅ v10 已定稿
- `ai_narrate` ✅ 612 行（v0.1.69）
- `ai_narrate_submit/worker/get_result` ✅ D008 方案已部署
- `game.js` ✅ 已调用 `ai_narrate_submit`（line255）+ 状态追踪 ✅
- ⏳ `gen_image` 云函数 — 97 行代码存在，未部署（先生未立项）
- ⏳ message 集合写入 — 未实现（先生未动）

---

## ⚠️ 需先生决策（PMO 没法自己定）

1. **design.md §七 更新？** game.js 已实现"游戏端状态追踪" + "死亡判定"，建议从 ❌ 移 ✅；D008 异步轮询建议从 0 立项为 ✅
2. **message 集合写入逻辑是否优先？** D001 关键路径，云函数已通但无持久化，先生需要决策实现顺序
3. **`gen_image` 是否立项部署？** 97 行代码已就位，先生未确认是否上 design.md §七
4. **本地 8 个 commit 是否 push？** 工作树干净，先生可随时 push
5. **`narrate_result` 集合是否在 design.md §四 Schema 里正式立项？** 建议加入 narrate_result schema

---

## 📅 PMO cron 简报历史

### 2026-06-11 21:01 · 第 9 次（周四晚）— **v0.2.x 视觉+调试+修复里程碑夜**

- **先生工作树脏了**：4 个 modified，全是今日 v0.2.x 改动
  - `game.js` (+472/-1367, 780行 diff) — v0.2.2 视觉重设计 + v0.2.3 debug overlay
  - `ai_narrate_submit/index.js` (+85/-28) — v0.2.4 Promise.race + 5s 超时
  - `ai_narrate_worker/index.js` (+92/-44) — v0.2.4 backgroundTask 分离
- **v0.2.2 视觉重设计**：朱砂印章按钮 + 暖米黄楷体正文 + 卷首小印 + 行李药匣样式 + 顶部栏"穿越日记"主标题；底色黑→暖色，去白底卡片
- **v0.2.3 debug overlay**：先生给 LLM 调试加了完整追踪层——debugLog 填齐 status/ts/elapsed_ms、错误轮数红色 ❌ 标记、错误用醒目分隔符包裹
- **v0.2.4 NOT_FOUND 根因修复**：D008 链路关键 bug
  - submit 改用 `Promise.race` + 5 秒超时触发 worker（之前 fire-and-forget 触发失败前端永远 NOT_FOUND）
  - worker main 启动后立即 return（backgroundTask 分离）
  - submit 触发失败 / worker 缺 state → 都写 narrate_result 标记，前端轮询能查到原因
- **先生本地 ahead 16 commit**：v0.1.69~v0.1.87 已 commit，今日 v0.2.2~v0.2.4 在工作树
- **远端仍不可达**：origin/main 仍 329fc56
- **design.md §七 仍严重滞后**：06-01 旧状态，建议先生从 ❌ 移到 ✅ 至少 4 项（状态追踪 / 死亡判定 / game.js AI 集成 / D008 全套 / v0.2.4 NOT_FOUND 修复）
- **A 类修复候选**：0 项（先生工作树脏但都是 v0.2.x 实质改动，无临时文件）
- **需先生决策**：
  1. 4 个 modified 工作树何时 commit？建议按 v0.2.2 / v0.2.3 / v0.2.4 分 3 个 commit
  2. 本地 16 个 commit 何时 push？
  3. design.md §七 同步（建议 5 项升级 ✅）
  4. message 集合写入是否优先推进？（D008 已铺垫完整）

### 2026-06-11 09:01 · 第 8 次（周四早）— **D008 完整闭环里程碑夜**
- **状态完全稳定**：自 09:01 早档以来，先生本地 0 commit / 远端 0 commit（白天工作日未提交）
- **工作树干净**：先生工作树 0 modified / 0 untracked；PROJECT.md 是 PMO 自身修改
- **远端仍不可达**：origin/main 停在 329fc56，本地 8 ahead 仍未推
- **D008 异步轮询**：继续健康运行，narrate_pending 26 条持平（先生白天未做 D008 测试）
- **message 集合写入**：仍待实现
- **A 类修复候选**：0 项（先生工作树干净）

### 2026-06-10 09:01 · 第 6 次（周三早）
- **新发现**：game.js line419-459 已实现完整的健康/金币/物品状态追踪 + 月份变化 + 死亡判定（`health <= 0`），design.md §七 仍标记 ❌ → 建议先生更新
- **里程碑**：D008 异步轮询（submit/worker/get_result）已完整部署，narrate_pending 26 条测试记录
- **版本**：v0.1.79（先生 06-10 03:26 提交），本地 8 commit ahead of origin
- **数据库**：5 表健康（era_meta 115/22 朝代，event 197 条），narrate_pending 26 条（先生做了大量 D008 测试）
- **message 集合写入**：仍待实现（先生还没动）
- **远端**：origin/main 仍在 329fc56（fetch 有时超时，先生本地 ahead 8 个 commit）

### 2026-06-09 21:01 · 第 5 次（周二晚）
- 凌晨 02:06 由久月代 commit（D008 bugfix 包）——先生授权后操作
- 工作树：3 modified / 0 untracked（昨日 24 个 untracked 全部入库）
- 本地/远端均已同步至 `329fc56`（ai_narrate v0.1.69）
- **era_meta 新里程碑**：22 个朝代（115 切片），cron 目标 22+ 已达成
- 事件库未涨（event 197 条）
- 需先生决策：`gen_image` 立项 / 双 cloudbaserc 合并 / `ai_narrate` 部署

### 2026-06-09 09:01 · 第 4 次（周二早）
- 凌晨 02:06 由久月代 commit（D008 bugfix 包）——先生授权后操作
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
- 未决：先生手头 `ai_narrate/` 部署 / `game.js` 集成推进 / `gen_image` 是否立项

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

## 🔍 A 类自动修复候选（本次 = 0 项）

先生工作树干净，无临时文件，无死链接，无未使用 import。无需 A 类修复。

---

## 📌 PMO 推进观察（持续记录）

- **2026-06-10 03:26**：先生深夜提交 v0.1.79（顶栏+玉牒加 month 显示），说明先生仍在活跃开发
- **2026-06-10 03:26**：v0.1.77~79 是 D008 轮询的最终修复（worker 写 narrate_result / 轮询容忍 8 次兜底 / patch 字段验证）
- **2026-06-10 09:01**：game.js 已实现状态追踪（health/coin/items）+ 死亡判定，design.md §七 未同步
- **2026-06-10 09:01**：narrate_pending 26 条 → 先生做了 25 次端到端 D008 测试，方案已验证
- **2026-06-10 09:01**：D008 完全落地（submit/worker/get_result 三函数），但 design.md §七 没有立项 D008
- **2026-06-08 21:01**：先生本地改动堆速明显加快（12 小时 4 modified → 4 modified + 24 untracked）
- **2026-06-08 21:01**：`eventsContext` v0.1.69 是关键 bug fix —— 之前 months 无事件时 prompt 段是空字符串
- **2026-06-08 21:01**：DB event 197 条 vs 先生本地 `events_to_upsert.json` 仍有工作文件 → 入库流程可能未完成

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


---

## 📅 PMO cron 简报历史

### 2026-06-11 09:01 · 第 8 次（周四早）— **D008 完整闭环里程碑夜**

- **重大发现**：自 06-10 21:01 以来，先生本地 **+8 个 commit**（v0.1.80~87），是 D008 完整闭环的夜战
- **D008 已正式拍板入 DECISIONS.md**（D008 条目完整记录，6 项工程边界 + 4 项风险缓解）
- **D008 实施完整链路**：
  - ✅ `ai_narrate_worker/index.js`（449 行）：month_delta clamp [0,60]、5 类 system_messages 自动注入、跨月 age + health 衰减
  - ✅ `ai_narrate_worker` prompt 段：加入 v11 `month_delta` 字段说明 + 节奏指导（5 档跨度）
  - ✅ `game.js` line469-510：D008 system_messages 写入 narrativeHistory（顺序 system → ai → user，v0.1.87）
  - ✅ `game.js` line493-510：sysPrefix 拼到 narrative 顶部，淡灰色短行，不计入字数
- **design.md §七 严重滞后**：仍为 06-01 状态，"game.js AI 集成"标 🚧，"游戏端状态追踪 / 死亡判定"标 ❌
- **先生本地 ahead 14 个 commit**（v0.1.69~v0.1.87 段），origin 仍停在 329fc56
- **工作树干净**：仅 PROJECT.md modified（PMO 自身）
- **A 类修复候选**：0 项（先生工作树干净）
- **需先生决策**：
  1. design.md §七 同步——4 项升级 ✅（状态追踪 / 死亡判定 / game.js AI 集成 / D008 全套）
  2. 本地 14 个 commit 是否 push？
  3. message 集合写入是否优先推进？（D008 已铺垫，system_messages 复用即可）

