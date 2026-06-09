# D008 — 异步轮询方案

**日期：** 2026-06-09  
**版本：** v0.1.74  
**问题：** 客户端 callFunction 15s 超时 → -504003（凌晨实测 M2.7 推理 28+ 秒）  
**方案：** 拆 ai_narrate 为 submit + worker + get_result，前端 5s 轮询

---

## 架构

```
前端 callAI(userInput)
  │
  ├─→ ai_narrate_submit  (timeout 15s，立即返回)
  │     ├─ 写 narrate_pending._id = request_id
  │     └─ 异步触发 ai_narrate_worker（不 await）
  │
  │     返回 { success: true, request_id: "narrate_xxx" }
  │
  └─→ 每 5 秒调一次 narrate_get_result（最多 24 次 = 120 秒）
        ├─ status: processing → 显示"史官正在落笔…（已等 X 秒）"
        ├─ status: done → 调用 handleAIResponse(result)
        └─ status: error → 显示史官错误文案
```

## 文件清单

| 文件 | 角色 | timeout |
|---|---|---|
| `cloudfunctions/ai_narrate_submit/index.js` | 立即返回 request_id | 15s |
| `cloudfunctions/ai_narrate_worker/index.js` | 实际推理（复用 ai_narrate 全部逻辑） | 120s |
| `cloudfunctions/narrate_get_result/index.js` | 前端轮询端点 | 10s |
| `cloudfunctions/init_pending/index.js` | 集合初始化测试 | 10s |
| `minigame/scenes/game.js` | 前端 callAI + pollNarrateResult | - |

## narrate_pending 集合 schema

```json
{
  "_id": "narrate_<ts>_<rand>",         // request_id
  "status": "processing | done | error",
  "payload": {                          // 完整传给 worker 的数据
    "state": {...},
    "input": "...",
    "history": [...],
    "is_retry": false
  },
  "result": {...} | null,               // AI 返回的完整 result（done 时）
  "error": "..." | null,
  "created_at": <ms timestamp>,
  "finished_at": <ms timestamp> | null
}
```

**手动建表：** 微信云开发控制台 → 数据库 → 新建集合 `narrate_pending`（无需 schema）

## 前端 UX

- 轮询期间：loading bar 显示"史官正在落笔…（已等 X 秒）"
- 成功：handleAIResponse 应用 patch + 显示 narrative
- 超时（120s）：显示"史官落笔太久没回音。点此重试。"
- 连续 5 次轮询失败：显示"网络不稳，点此重试。"

## 风险与兜底

| 风险 | 兜底 |
|---|---|
| worker 异步触发失败 | pending 状态保持 processing → 前端 120s 后提示重试 |
| pending 集合膨胀 | 后续加定时清理（created_at < now-24h 自动删） |
| 轮询 SDK 调用失败 | 单次失败继续，连续 5 次失败放弃 |
| submit 失败（DB 写不进去） | 立即报错"提交失败"，不进入轮询 |

## 验收测试（先生明天起床后）

1. 进游戏 → 选身份 → 进游戏页
2. 第一轮（init）应该 5-15 秒出图（轮询中能看到等待时长）
3. 后续每轮（continue）应该 5-20 秒出图
4. 故意等 60 秒以上：验证轮询仍能拿到结果（不超时）
5. v0.1.74 上传命令：`cd /home/admin/workspace/TheTime && node scripts/upload.js 0.1.74 "D008 异步轮询"`
