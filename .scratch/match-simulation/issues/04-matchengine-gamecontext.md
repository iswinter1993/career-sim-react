# 04 — matchEngine 封装 + GameContext 集成

**What to build:** 将 `footballsimulationengine` 的 CJS API 封装为浏览器可用的模块，在 GameContext 中新增 matchState 和所有相关 reducer actions。

**Blocked by:** 02 — 核心纯函数模块; 03 — 随机队友生成 + 阵容构建

**Status:** ready-for-agent

### matchEngine 封装
- [ ] CJS → ESM wrapper：`import { initiateGame, playIteration, startSecondHalf } from 'footballsimulationengine'`
- [ ] `createMatch(homeTeam, awayTeam, pitch)` → 返回初始化的 matchSession
- [ ] `runIteration(matchSession)` → 执行一次 `playIteration()`，返回更新后的 matchSession
- [ ] `runAutoSimulation(matchSession)` → 快速连续运行所有迭代直到比赛结束
- [ ] `applySubstitution(matchSession, playerOut, playerIn)` → 替换球员
- [ ] `applyTactics(matchSession, tactics)` → 更新 team.intent
- [ ] 移除或 monkey-patch `engine.js:89` 的 `console.log(JSON.stringify(matchDetails))`
- [ ] 验证 Vite 正确处理 CJS → ESM 转换

### GameContext Reducer
- [ ] `START_MATCH` action：接收 identity + 球队阵容，构建 matchState 初始状态
- [ ] `TICK_ITERATION` action：调用 `runIteration` 更新 matchDetails 快照
- [ ] `PAUSE_MATCH` action：设置 matchState.paused = true
- [ ] `RESUME_MATCH` action：设置 matchState.paused = false
- [ ] `SUBSTITUTE` action：检查换人次数 ≤ 3，执行替换
- [ ] `AUTO_SIM` action：设置 autoMode，快速完成所有迭代
- [ ] `MATCH_COMPLETE` action：计算评分，产生 pendingResult
- [ ] matchState 形状包含：homeTeam、awayTeam、matchDetails、paused、substitutionsLeft、iterationLog、events、stats、result
- [ ] 在现有 reducer 中集成，不破坏现有 actions
