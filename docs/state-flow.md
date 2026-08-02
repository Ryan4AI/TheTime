# 状态变化全流程（State Flow）v1 — 2026-08-02 凌晨梳理

> 本文档是「谁改什么、通过什么通道、双端如何一致」的基准。改代码前先对照本文档。
> 背景：本次梳理发现并修复了「AI₂ 属性结算从未生效（7/29 冻结）」重大 bug，以及物品协议 0=移除缺失、补充/修复被去重挡死等问题。

## 一、总体架构（三阶段）

```
玩家输入（选项 / 自由输入 / [使用 X]）
  ↓
【ai1 叙事】AI₁ 写剧情 content + 3 个 options（不输出属性/物品结算）
  ↓
【ai2 打分】AI₂ 读剧情+前情+属性快照+物品快照 → 输出 attrPatch（唯一状态变化来源）
  ↓
【applyPatch】worker 合并 attrPatch → 新 state → 死亡判定 → 系统消息 → saveLife 落库
  ↓
【前端】ai2 返回 newState → merge → 渲染；回合结束 autoSaveToCloud
```

## 二、state 字段 → 修改者 → 通道

| 字段 | 修改者 | 通道 | 状态 |
|---|---|---|---|
| 9 属性（声望/财富/学识/颜值/医术/战功/文采/政绩/义行） | AI₂ | attrPatch 顶层数字 | ✅ clamp 0~10000（applyPatch 3) 段） |
| month / year / age | AI₂ | attrPatch.month_delta (0~60) | ✅ applyPatch 推进；跨年 age+1 |
| eraDisplay（年号） | worker | applyPatch 跨年重算 | ✅ ERA_TABLE + computeEraDisplay |
| items | AI₂ | attrPatch.items | ✅ 协议见第三节 |
| city / location / occupation | AI₂ | attrPatch 顶层字符串 | ✅ D 类输出 |
| alive / deathReason | worker | 3 条死亡判定（runPhase2） | ✅ 见第四节 |
| epitaph | ai_write_death（独立云函数） | 玩家封笔后调用 | ✅ D010 |
| coin | 无（历史遗留） | — | ⚠️ D031 已删通道，前端不显示，固定 1000 |
| lifespan | 无（生成后固定） | — | ⚠️ 未来可加 AI 通道（中毒/折寿） |
| round | worker | preUpdate.round+1 | ✅ |
| name/gender/dynasty/socialClass | generate_identity | 仅开局 | ✅ 固定不变 |

## 三、状态变化协议（2026-08-02 11:36 先生拍板：全系统统一增量语义）

| 通道 | 语义 | 例子 |
|---|---|---|
| 9 属性 | **增量**（±，clamp 0~10000） | `声望:+10` |
| 物品数字 | **增量**（正加负减，clamp 0~100） | `干粮:-20` = 减 20；`干粮:30` = 加 30 |
| 物品字符串 | **移除** | `干粮:"lost"` = 移除 |
| 物品对象 | **新增**（durability=初始值） | `{name,icon,desc,durability:100}` |
| month_delta | **增量**（0~60） | `month_delta:3` = 推进 3 个月 |
| location/city/occupation | **目标值**（字符串替换） | `city:"汴京"` |
| death | **目标值**（对象） | `{type, reason}` |

### 物品协议（attrPatch.items）——全数字增量，零特例

| 写法 | 语义 | applyPatch 处理 |
|---|---|---|
| `{"物品名": -20}` | 磨损/消耗：耐久减 20 | durability += -20 |
| `{"物品名": 30}` | 补充/修复：耐久加 30 | durability += 30；clamp 100 |
| `{"物品名": -999}` | **移除**（被抢/丢失/毁掉/用完）= 大负数减到 ≤0 | 耐久归零 → 自动移除 |
| `{"物品名": {name,icon,desc}}` | **新增**（拾起/获赠/购买） | 去重：同名不存在才 push |
| `{"物品名": {durability:80}}` | 补充/修复 | 同名存在 → durability = 80（初始值语义） |
| 0 | 无变化 | 跳过（与属性 0 一致） |
| `"lost"` 字符串 | 旧协议移除 | 兼容保留（防御旧数据，prompt 不再教） |

规则：
- **所有数字 = 变化量（增量）**——属性/物品/时间统一，AI₂ 一条规则走天下
- **移除 = 耐久减到 ≤0**：AI₂ 写大负数（-999）表达「没了」，代码自然移除，无需特殊语法
- 玩家主动使用物品（[使用 X]）：玩家输入显式给 AI₂ + prompt 强制结算（消耗品 -20 左右、工具 -5~-15、耗尽 -999）
- 前端 patch.items 兜底与 worker 完全一致

## 四、死亡判定（worker runPhase2，3 条直接判定）

```
1) AI₂ 剧情判死：attrPatch.death = {type: 意外|寿终|社会性, reason}
   → 剧情明文致命结果才可判；玩家成功脱险不判
2) 寿限：age >= lifespan → alive=false（deathReason=寿终正寝 + epitaph 兜底）
3) 社会性：8 属性全归零（<15 岁豁免）→ alive=false + epitaph 兜底
```
前端：newState.alive=false → 封笔 → ai_write_death 生成 deathCause/epitaph → 墓碑页

## 五、前端与 worker 一致性清单

| 逻辑 | worker | 前端 | 一致 |
|---|---|---|---|
| 属性合并 clamp | applyPatch 3) | merge 直接取 newState | ✅ |
| items 0=移除 | ✅ | ✅（兜底） | ✅ |
| items 对象更新（补充） | ✅ | ✅（兜底） | ✅ |
| items 数字减耐久 | ✅ | ✅（兜底） | ✅ |
| 去重（新增同名） | ✅ | ✅ | ✅ |
| 使用物品扣耐久 | **AI₂ 单一结算**：玩家输入 `[使用 X]` 显式给 AI₂（scorePrompt 首行），强制写损耗（消耗品 -20~-30 / 工具 -5~-15 / 耗尽 0） | 不扣（只 callAI） | ✅ |
| 使用物品兜底 | **无**（11:31 先生拍板去掉——根因是上下文截断，01:30 已修前情完整给；AI₂ 漏结算概率已低，偶漏由剧情自然衔接） | — | ✅ |
| 耐久显示 | durability 字段 | **不显示数字**——AI₁ 物品列表带耐久（name(耐久X)），剧情叙事暗示（≤30 写「快用完了」） | ✅ |
| 死亡判定 | 3 条判定 | newState.alive=false | ✅ |
| month 推进 | applyPatch | merge newState.month/year | ✅ |
| eraDisplay | 跨年重算 | merge | ✅ |

## 六、已修复问题记录（2026-08-02 凌晨）

1. **AI₂ 属性结算从未生效**（🔴 最严重）：D089 两阶段化后属性合并留在死代码 finalizeTask，runPhase2 调 applyPatch 但 applyPatch 无属性合并 → 属性从 7/29 冻结至今。修复：合并搬进 applyPatch。
2. **物品 0=移除缺失**：AI₂ 写 `{"铁器":0}` 表达移除，旧协议当「耐久+0」。修复：0=移除。
3. **补充/修复被去重挡死**：同名物品永远无法恢复耐久。修复：同名存在 → 更新耐久。
4. **使用物品消耗不可预期**：修复：前端确定性 -20 + 同步云端 + AI₁ 理解 [使用 X]。
5. **耐久不可见**：修复：物品格显示「耐X」（<30 红）。
6. health 字段整体废除（04:15）、社会性死亡从死代码复活（03:44）、年号动态重算（02:51）。

## 七、遗留 / 未来可加

- coin：死字段（前端不显示），可删可不删；若做「花钱」玩法需重建通道（D031 拍板铜钱=财富，倾向不重建）
- lifespan：无 AI 通道，「被下毒减寿」类剧情无法结算；未来可加 attrPatch.lifespan_delta
- 使用物品 -20 是固定值，未来可按物品类型差异化（干粮-30、工具-10）
- AI₂ 判死质量依赖 prompt 约束，需多轮实测防乱杀
