# v3.0.0 开工清单 — 二维无限网格墓园

> **状态：** 骨架待审。先生睡醒后拍 ① ② ③ 三个数字才正式开工。
> **作者：** 久月，2026-06-21 05:22 备好（先生已在线 27 小时，强制收工）。

---

## 核心设计（先生 05:18-05:30 拍板）

1. **二维网格布局**：横（左右划）= 切换主碑；纵（远近）= 排数层次
2. **⚠️ 主碑 = 远景，没有特例**（先生 05:27 修正"主碑要变，谁说不渐变的"）
   - 所有墓碑（含主碑）都用 `(col - camX, row - camY) * slotW` 公式
   - 主碑会渐变退下、新主碑会渐变进来
   - 划动时**整片网格一起滑**，每块按距离渐变
3. **浮点偏移驱动整片网格**：`cameraX, cameraY` 双浮点
4. **点击某格 → 平滑插值** cameraX/Y → 那格滑到屏幕中央（300-500ms 缓动）
5. **双向无限循环**：列方向已实现（v2.5.7+）；行方向待加（`(row % M + M) % M`）
6. **drawMainStone 删掉**——统一用 drawFarStones 公式渲染所有墓碑

## 关键交互

| 操作 | 触发 | 行为 |
|---|---|---|
| 左右划 | touchX 偏移为主 | cameraX 增减 |
| 上下划 | touchY 偏移为主 | cameraY 增减 |
| 点击 | tap | 找最近格 → cameraX/Y 缓动过去 |
| 拖拽中 | touchmove | cameraX/Y 实时跟随手指 |

## 待先生拍板（明早第一件事）

### ① 网格规模
- A: 5×3（小，15 块，视野里 ~9 块可见）
- **B: 9×5（标准，45 块，视野里 ~25 块）** — 我推荐
- C: 13×7（大网格，91 块，视野里 ~50 块）

### ② 纵向（远近）层数
- A: 3 排（前/中/远，节奏快）
- **B: 5 排（标准纵深）** — 我推荐
- C: 7 排（接近无限延伸感）

### ~~③ 主碑永不渐变（已确认）~~ → 取消
- 05:27 先生修正："主碑要变，谁说不渐变的"
- 主碑 = 远景，没特例

---

## 代码改造点

### 1. 数据结构（一维 → 二维）

**旧（v2.5.9）：**
```js
var otherStones = []  // 一维数组
var mainIdx = ((Math.round(cameraX) % N) + N) % N
var stone = otherStones[mainIdx]
```

**新（v3.0.0）：**
```js
var otherStones = []  // 二维：otherStones[row][col]
var mainIdxX = ((Math.round(cameraX) % COLS) + COLS) % COLS
var mainIdxY = ((Math.round(cameraY) % ROWS) + ROWS) % ROWS
var stone = otherStones[mainIdxY][mainIdxX]
```

### 2. 双浮点相机

```js
var cameraX = 0  // 横（左右划）
var cameraY = 0  // 纵（上下划）
var targetCameraX = 0  // 缓动目标
var targetCameraY = 0

// 每帧缓动
cameraX += (targetCameraX - cameraX) * 0.10
cameraY += (targetCameraY - cameraY) * 0.10
```

### 3. 触摸方向判定（横 vs 纵）

```js
function onTouchMove(dx, dy) {
  // 横向偏移更大 → 横向划
  if (Math.abs(dx) > Math.abs(dy)) {
    targetCameraX += dx * SENSITIVITY
  } else {
    targetCameraY += dy * SENSITIVITY
  }
}
```

### 4. 点击 → 平滑滑到目标格

```js
function onTap(touchX, touchY) {
  // 把屏幕坐标转成网格坐标
  var gridX = Math.round((touchX - l.cx) / slotW + cameraX)
  var gridY = Math.round((touchY - l.cy) / slotW + cameraY)
  
  // targetCameraX/Y 是浮点 → camera 缓动过去
  targetCameraX = gridX
  targetCameraY = gridY
}
```

### 5. 远景二维渲染

```js
function drawFarStones(ctx, l, op) {
  var COLS = 9, ROWS = 5  // ① ② 先生拍
  var slotW = l.w * 0.32
  var mainIdxX = ((Math.round(cameraX) % COLS) + COLS) % COLS
  var mainIdxY = ((Math.round(cameraY) % ROWS) + ROWS) % ROWS
  
  // 渲染以主碑为中心的 3×3 邻域（-1 ~ +1）
  for (var drow = -1; drow <= 1; drow++) {
    for (var dcol = -1; dcol <= 1; dcol++) {
      // 跳过主碑（单独 draw）
      if (drow === 0 && dcol === 0) continue
      
      var realCol = ((mainIdxX + dcol) % COLS + COLS) % COLS
      var realRow = ((mainIdxY + drow) % ROWS + ROWS) % ROWS
      var stone = otherStones[realRow][realCol]
      if (!stone) continue
      
      var floatX = cameraX - mainIdxX
      var floatY = cameraY - mainIdxY
      var pX = l.cx + (dcol - floatX) * slotW
      var pY = l.cy + (drow - floatY) * slotW * 0.6  // 纵深压缩 0.6 倍
      
      // 渐变：横距 + 纵距双重
      var dist = Math.sqrt(dcol*dcol + drow*drow)
      var alpha = Math.max(0, 1 - dist / 2.5)
      
      drawSingleStone(ctx, stone, pX, pY, alpha * op)
    }
  }
}
```

### 6. 主碑固定位置 + 内容随浮点走

```js
function drawMainStone(ctx, l, op) {
  var mainIdxX = ((Math.round(cameraX) % COLS) + COLS) % COLS
  var mainIdxY = ((Math.round(cameraY) % ROWS) + ROWS) % ROWS
  var stone = otherStones[mainIdxY][mainIdxX]
  
  // 位置固定（不跟浮动）
  drawSingleStone(ctx, stone, l.mainX, l.mainY, op)
}
```

### 7. buildOtherStones 改二维

```js
function buildOtherStones(mainStone) {
  var grid = []
  for (var r = 0; r < ROWS; r++) {
    grid[r] = []
    for (var c = 0; c < COLS; c++) {
      if (r === centerRow && c === centerCol) {
        grid[r][c] = mainStone
      } else {
        grid[r][c] = makeRandomStone(r, c)
      }
    }
  }
  return grid
}
```

### 8. 死亡页字段同步

v3.0.0 影响：`scenes/death.js` 一整个文件（1193 行）。重点改造：
- L16 `var otherStones = []` → 改二维
- L21 `var cameraX = 0` → 加 `cameraY`
- L223 init: `cameraX = 0` → 加 `cameraY = 0`
- L389-391 缓动 → 加 Y
- L499-660 drawFarStones → 二维循环 + 双重渐变
- L679-? drawMainStone → 主碑内容 = `otherStones[mainIdxY][mainIdxX]`
- L903-? drawEpitaphContent → 主碑内容同步
- L1009-? header 标签 → 显示当前坐标
- onTouch: 加方向判定 + 点击切换

---

## 测试 checklist（明早先生拍板后）

- [ ] 网格规模（①）已选
- [ ] 纵向层数（②）已选
- [ ] 主碑永不渐变只换内容（③）已确认
- [ ] Node mock: Proxy 模拟 wx + ctx
- [ ] 括号平衡检查
- [ ] 触摸方向判定（横 vs 纵）
- [ ] 点击平滑插值（300-500ms）
- [ ] 横向循环 + 纵向循环
- [ ] 主碑内容随浮点变（不"咔"切换）
- [ ] 远景双重渐变（横距 + 纵距）

---

## 历史教训（v3.0.0 必须规避）

1. **改 draw 函数时，所有读 layout 字段的 draw 函数要一起改**（v2.5.9 教训）
2. **patch 时 grep `^function` 确认所有引用都有定义**
3. **scale 类变量必须 limit**
4. **patch 函数内部时重新 mock render 跑一次**
5. **3D 透视改 5 个 draw 函数范围太大——一次只改一个·验证后再改下一个**（v2.6.0 教训）
6. **默认值要符合"打开就有内容"的预期**
7. **"自然划动"= 主碑内容 = otherStones[roundX][roundY]·不 swap·camX 连续**（v2.5.3 教训）
8. **patch 时 sed 多行替换容易出错**
9. **划动不归位——松手停在新位置**（v2.5.4 教训）
10. **远景/主碑视觉一致**（v2.5.5 教训）
11. **连续变换必须用浮点位置**（v2.5.9 教训）
12. **patch 时用 grep 确认变量所有使用处**
13. **UI 列表循环——用 `(idx % N + N) % N`**
14. **patch 多个函数时·确保它们用同一个公式**
15. **patch 后 grep 改后文件——确认旧变量名无残留**
16. **远景位置公式必须含 `floatOffset = cameraX - mainIdx`——不能只用整数 di**（v2.5.9 教训）
17. **⚠️ 新增（v3.0.0）：触摸方向判定要看 dx vs dy 绝对值，避免横向划时 Y 也跟着动**
18. **⚠️ 新增（v3.0.0）：点击 → 平滑滑到目标格，必须缓动而非直接 snap**
19. **⚠️ 新增（v3.0.0）：grid 二维化后，所有读 otherStones[idx] 的地方都要改成 otherStones[y][x]**

---

## 时间戳

- 先生 05:18 提议"二维网格 + 主碑随划动"
- 先生 05:20 确认"主碑随划动变化"= 浮点跟随
- 久月 05:22 写完本骨架，先生已 27 小时在线，强制收工

**明早第一件事：先生拍 ① ② ③ → 久月开干。**