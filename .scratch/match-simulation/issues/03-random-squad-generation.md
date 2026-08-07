# 03 — 随机队友生成 + 阵容构建

**What to build:** 为每场比赛生成完整的 16 人阵容（11 首发 + 5 替补），将玩家球员嵌入其位置。对手阵容同样随机生成。

**Blocked by:** 01 — 属性系统 0-100 迁移; 02 — 核心纯函数模块

**Status:** ready-for-agent

- [ ] 随机球员生成器：给定联赛水平和位置，生成包含完整 15 项子属性（0-100）的球员对象
- [ ] 属性服从以联赛均值为中心的正态分布，标准差 ~8-10
- [ ] 门将的 saving/jumping 单独偏置，其他位置按角色加权
- [ ] `buildTeamSquad(playerIdentity, leagueLevel, seed)` 生成完整队伍
- [ ] 玩家球员嵌入其位置（如 ST），该位置不再随机生成
- [ ] 默认 4-4-2 阵型填充 11 个首发位置
- [ ] 5 名替补覆盖不同位置（含 1 门将替补）
- [ ] `buildOpponentSquad(leagueLevel, seed)` 生成对手全队
- [ ] 生成的球员对象同时兼容 `footballsimulationengine` 的 Player JSON 格式和 `attributeMapping` 输入格式
- [ ] 输出可通过 `attributeMapping.mapToEngineSkills()` 直接转换给比赛引擎
