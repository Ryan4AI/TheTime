# TheTime · 穿越日记

> **状态：已封档（2026-11-01）** —— 开发暂停，代码与云端部署保留，随时可重启。
> 重启入口：**[`docs/ARCHIVE-2026-11-01.md`](docs/ARCHIVE-2026-11-01.md)**（状态快照 / 恢复步骤 / 未完成清单 / 安全欠账）

AI 根据真实历史数据生成剧情，带你穿越到真实历史场景里活一辈子。
微信小游戏（Canvas 2D）+ 腾讯云开发（云函数 + 云数据库）+ DeepSeek LLM。

## 核心循环

```
选 3 件随身物品 + 性别
  → 按历史人口统计随机生成 年份 / 城市 / 年龄 / 阶层 / 职业
  → AI 生成剧情与 3 个选项（可自由输入）
  → AI 结算 9 项属性 / 推进时间 / 物品增减 / 死亡判定
  → 死亡 → 遗言 → 墓志铭 → 下一世
```

## 目录

| 路径 | 内容 |
|---|---|
| `minigame/` | 小游戏前端（`scenes/` 入口、选物、穿越、身份卡、主游戏、死亡、榜单） |
| `cloudfunctions/` | 云函数（核心 `ai_narrate_worker`：AI₁ 叙事 + AI₂ 打分） |
| `docs/` | 设计 / 决策 / 状态流转 / **封档说明** |
| `data/` | 历史事件、榜单、朝代数据包 |
| `scripts/` | 上传、导入、探针、运维脚本 |

## 文档

- 产品设计（单一事实源）：`docs/product-design.md`
- 决策记录：`docs/DECISIONS.md`
- 状态流转：`docs/state-flow.md`
- 改造方案 v2（定案未开工）：`docs/plan-2026-10-08-zhixiang.md`
- **封档说明：`docs/ARCHIVE-2026-11-01.md`**

## 本地运行 / 上传

```bash
# 小游戏：微信开发者工具导入 minigame/（AppID wx2fc3ba2c105c9ba2）
node scripts/upload-minigame.js <版本号> "<描述>"

# 云函数
echo -e "cloud1-d5gkbowyvbd1c85e1\ny" | npx tcb fn deploy ai_narrate_worker --force
```

> ⚠️ 仓库历史中含旧版明文 API Key（详见封档说明第 9 节）。重启前请先轮换密钥，再部署。
