# 穿越日记 · 数据库设计 v5

## 环境
- 云环境: `cloud1-d5gkbowyvbd1c85e1`
- 时代相关表前缀 `era_`，其他纯名

---

## 表1：era_meta — 时代通用信息

```
主键=年份，全国性数据，不与城市绑定
```

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `year` | number | **主键** | 1102 |
| `dynasty` | string | 朝代 | "宋" |
| `eraLabel` | string | 年号标签/时代名 | "崇宁元年" / "武丁中兴" |
| `emperor` | string | 在位君主名 | "宋徽宗" / "武丁" |
| `maleRatio` | number | 男性占比(%) | 55 |
| `maleLiteracy` | number | 男性识字率(%) | 18 |
| `femaleLiteracy` | number | 女性识字率(%) | 3 |
| `surnames` | string[] | 常见姓氏 | ["赵","钱","孙","李"] |
| `maleNames` | string[] | 男名池 | ["明远","子瞻","介甫"] |
| `femaleNames` | string[] | 女名池 | ["婉如","清照","幼薇"] |
| `source` | string | 出处 | "待查" |

查询：`where year≤N, orderBy year desc, limit 1`

---

## 表2：era_cities — 城市信息

```
主键=年份+城市，仅存放城市级特有数据
```

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `year` | number | **联合主键** | 1102 |
| `city` | string | **联合主键** | "汴京" |
| `popMillion` | number | 该城人口(百万) | 1.5 |
| `cityDesc` | string | 城市特征描述 | "汴京跨汴河两岸，坊市合一..." |
| `source` | string | 出处 | "待查" |

查询A：`where year≤N, orderBy year desc, limit 50` → 拿最近年份全部城市
查询B：`where year=N, city="汴京"` → 拿单个城市详细数据

---

## 表3：era_age_dist — 年龄分布

```
主键=年份+年龄，每岁一行，数据收集时从原始分段插值得到
```

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `year` | number | **联合主键** | 1102 |
| `age` | number | **联合主键**，年龄 0-80 | 30 |
| `weight` | number | 该年龄人口权重 | 1.8 |
| `source` | string | 出处 | "据A插值" |

查询：`where year≤N, orderBy year desc, limit 81` → 拿最近年份全部年龄权重
引擎：`weightedPick(rows)` → 抽年龄

---

## 表4：social_structure — 社会阶层

```
主键=年份+阶层，每行一条
```

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `year` | number | **联合主键** | 1102 |
| `class` | string | **联合主键**，阶层名 | "主户·中" |
| `weight` | number | 人群占比(%) | 20 |
| `jobs` | string[] | 职业池 | ["私塾先生","郎中","小商人","作坊主","书吏","衙役"] |
| `source` | string | 出处 | "待查" |

查询：`where year≤N, orderBy year desc, limit 20` → 拿到该年所有阶层
引擎：`weightedPick(rows)` → 抽阶层 → `pickFrom(jobs)` → 抽职业

---

## 表5：event — 历史事件

```
主键=年份+月份+城市
```

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `year` | number | 年份 | 1102 |
| `month` | number | 月份 1~12 | 3 |
| `city` | string | 发生城市 | "汴京" |
| `title` | string | 事件标题 | "立元祐党人碑" |
| `desc` | string | 事件描述 | "蔡京奏请将元祐年间反对新法者120人列为奸党..." |
| `type` | string | 类型 | "政治" |
| `scope` | string | 影响范围 | "城市" / "全国" |
| `source` | string | 出处 | "《宋史·徽宗本纪》" |

查询：`where year=N, month=M, city="汴京"` → 返回到期事件

---

## 云函数

| 函数 | 输入 | 输出 | 状态 |
|------|------|------|------|
| `init_db` | — | 创建5个集合 | 已部署 |
| `get_era_meta` | `{year}` | era_meta文档 | 已部署 |
| `get_era_cities` | `{year, city?}` | 城市列表或单个城市 | 已部署 |
| `get_era_age_dist` | `{year}` | era_age_dist行列表 | 待新建 |
| `get_social_structure` | `{year}` | social_structure行列表 | 已部署 |
| `get_events` | `{year, month, city}` | event列表 | 已部署 |
