# 02 — 核心纯函数模块

**What to build:** 三个独立纯函数模块，奠定比赛系统的计算基础。全部可独立单元测试，不依赖 UI 或引擎。

**Blocked by:** 01 — 属性系统 0-100 迁移

**Status:** ready-for-agent

### attributeMapping 模块
- [ ] 15 项子属性 → 10 项引擎技能的正向映射函数
- [ ] 映射权重由位置决定（如 ST 射门权重高、CB 抢断权重高、GK saving 权重高）
- [ ] 多对一映射取位置加权均值（如 control 由盘带+控球加权）
- [ ] `mapToEngineSkills(attrs, position)` 返回 `{ passing, shooting, tackling, saving, agility, strength, penalty_taking, perception, jumping, control }`，全部 0-100
- [ ] 领导力 → `team.intent` 权重的转换函数

### playerRating 模块
- [ ] 评分计算纯函数 `calculateRating(matchDetails, playerID)` 返回 0-10 数值
- [ ] 起评分 6.0
- [ ] 正向事件加分：进球 +1.0、助攻 +0.5、抢断成功 +0.1、拦截 +0.1、传球成功 +0.05
- [ ] 负向事件扣分：红牌 -2.0、黄牌 -0.5、乌龙 -1.5、丢球权 -0.1
- [ ] 赢球红利 +0.15
- [ ] 零封红利 +0.2（门将/后卫/防守中场）
- [ ] MVP 覆盖 20-30 种核心事件，后期可扩展至 200+ 种
- [ ] 边界情况：无事件球员 = 6.0、全场最差不低于 0、全场最佳不超过 10

### leagueTable 模块
- [ ] 预设联赛赛程生成（双循环，N 队 × N轮）
- [ ] `simulateOtherMatch(teamA, teamB)` 随机生成比分
- [ ] `updateTable(table, matchResult)` 更新积分（胜3平1负0）
- [ ] `getRankings(table)` 按积分→净胜球→进球数排序
- [ ] 玩家比赛嵌入赛程，自动模拟其余比赛
- [ ] 数据在内存中维护（单次会话），不跨会话持久化
