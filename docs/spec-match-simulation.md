# Spec: 比赛模拟系统 (Match Simulation System)

**Created**: 2026-08-06
**Status**: Draft
**Labels**: ready-for-agent

> **现状更新 (2026-08-13)**: 引擎现已以本地 ESM fork `src/engine/` 作为实际运行引擎（`src/matchEngine.js` 直接 import，不再依赖 npm 包）。本 spec 中的「`footballsimulationengine` 未集成」是集成前的历史背景。

---

## Problem Statement

当前游戏（career-sim-react）通过抽象事件选择推进生涯——玩家在"事件/转会/青训"等选项中做决策，但从未真正踏上球场。`footballsimulationengine` v5.0.0 已安装但未集成。玩家需要一个完整的比赛模拟系统，包含战术决策、2D 动画可视化、技术统计、赛后成长反馈和联赛上下文。

## Solution

在现有生涯循环中新增"比赛日"步骤，将 `footballsimulationengine` 作为后端引擎驱动每场关键比赛。玩家赛前设置战术，比赛中可随时暂停介入（换人、调整战术），赛后获得表现评分和属性成长。比赛以完整 2D 俯视动画渲染，配合实时播报、技术统计侧栏和联赛积分榜。

## User Stories

1. As a 玩家, I want 在赛季生涯中遇到比赛日（非抽象事件），so that 我能真正参与比赛而非只在文本选项中推进游戏。

2. As a 玩家, I want 我的自建球员作为首发参加每场比赛，so that 我的角色是比赛的真正参与者而非旁观者。

3. As a 玩家, I want 赛前设置战术（阵型、心态、首发名单），so that 我能用策略影响比赛走向。

4. As a 玩家, I want 观看 2D 俯视动画中的比赛实时推进，so that 我能直观看到场上发生的事情。

5. As a 玩家, I want 比赛中随时可以暂停并修改指令（换人、战术调整），so that 我能对场上局势做出反应。

6. As a 玩家, I want 最多 3 次换人机会用于伤病或战术换人，so that 换人决策具有真正的博弈重量。

7. As a 玩家, I want 场上球员受伤时自动暂停并提示换人，so that 我不会在不知情的情况下以少打多。

8. As a 玩家, I want 实时滚动文字播报展示场上动态，关键时刻（进球、红牌、伤病）弹出醒目提示，so that 我不会错过重要事件。

9. As a 玩家, I want 查看技术统计面板（控球率、射门、传球、抢断、角球、犯规、牌、跑动距离、传球成功率），so that 我能从数据层面理解比赛局势。

10. As a 玩家, I want 查看我所在联赛的积分榜（侧边栏），so that 我知道每场比赛在联赛格局中的意义。

11. As a 玩家, I want 比赛结束后看到我的球员获得 0-10 分的表现评分，so that 我能量化自己在这场比赛中发挥如何。

12. As a 玩家, I want 赛后良好表现带来属性增长（与赛季训练叠加），so that 每场比赛的好发挥都有即时奖励反馈。

13. As a 玩家, I want 选择"自动模拟"跳过动画直接看到比赛结果，so that 当我不想手动介入时能快速推进。

14. As a 玩家, I want 比赛页面采用上下布局，Canvas 动画占据主要空间，统计/积分榜/播报以 Tab 切换，so that 画面和信息的展示比例合理。

15. As a 玩家, I want 球员能力以 0-100 的尺度展示，so that 数值和我对足球游戏的直觉一致。

16. As a 开发者, I want 比赛引擎迭代与 Canvas 渲染帧完全分离，so that 引擎性能和画面流畅度互不影响。

17. As a 开发者, I want 赛后评分计算是纯函数，so that 它易于测试且行为完全可预测。

18. As a 开发者, I want 联赛积分榜逻辑独立于 UI，so that 积分榜计算可以被单独测试和验证。

## Implementation Decisions

### 1. 比赛引擎封装 (`matchEngine` 模块)

将 `src/engine/` 引擎 fork 的 API 包装为浏览器友好的 facade：

- **`createMatch(homeTeam, awayTeam, pitch, userTactics)`** → matchSession 对象
- **`runIteration(matchSession)`** → 更新后的 matchSession（单次迭代）
- **`runAutoSimulation(matchSession)`** → 快速连续调用迭代直到比赛结束
- **`applySubstitution(matchSession, playerOut, playerIn)`** → 更新阵容
- **`applyTactics(matchSession, tactics)`** → 更新 team.intent 和 formation

引擎迭代在自动模拟时不等待渲染。手动介入模式下每轮迭代完成后交出控制权。引擎 `engine.js` 第 89 行的 `console.log` 在构建时移除或通过 monkey-patch 条件化。

### 2. 球员属性映射 (`attributeMapping` 模块)

纯函数模块，实现双向映射：

**15 子属性 → 10 引擎技能**（加权映射，权重由位置决定）：
- 盘带 → control
- 传球 → passing
- 射门 → shooting
- 控球 → control（与盘带取位置加权均值）
- 抢断 → tackling
- 定位球 → penalty_taking（附加 shooting 加成）
- 速度 → agility
- 力量 → strength
- 耐力 → 映射为 fitness（0-100%）
- 弹跳 → jumping
- 对抗 → strength（与力量取位置加权均值）
- 视野 → perception
- 冷静 → penalty_taking（与定位球加权）
- 决断 → perception（与视野加权）
- 领导力 → 影响 team.intent 权重，无直接技能映射

**逆向映射（赛后评分 → 子属性增长）**：
- 赛后评分 > 7.0 触发增长
- 增长量 = f(评分, 位置权重, 潜力剩余空间)
- 与赛季 `tickAttributes` 叠加（加法）

### 3. 赛后评分系统 (`playerRating` 模块)

纯函数评分计算：
```
finalRating = 6.0 + Σ(eventValue × outcomeMultiplier) + resultBonus
```

- **起评分**: 6.0（首发）；替补登场同样 6.0
- **大幅加分 (+0.5 ~ +1.5)**: 进球、助攻、造点、关键传球、创造绝佳机会
- **小幅加分 (+0.05 ~ +0.2)**: 成功过人、抢断、拦截、解围、传球成功、赢得空中争顶
- **小幅扣分 (-0.05 ~ -0.2)**: 被过、丢失球权、传球失误、犯规、越位
- **大幅扣分 (-0.5 ~ -2.0)**: 红黄牌、乌龙球、送点、低级失误
- **赢球红利**: 获胜球队全体 +0.15
- **零封红利**: 门将/后卫/防守型中场获额外 +0.2

评分输出纯数值，UI 层负责转换为星级/文字描述。

### 4. `GameContext` Reducer 新增 Actions

```
START_MATCH     → 从 identity + 随机生成队友构建两队阵容，初始化 matchSession
PAUSE_MATCH     → 标记 matchState.paused = true，引擎停止迭代
RESUME_MATCH    → 标记 matchState.paused = false，恢复迭代
SUBSTITUTE      → 在暂停状态下执行换人（检查剩余换人次数 ≤ 3）
AUTO_SIM        → 快速连续运行迭代，跳过动画，直接产出最终 matchDetails
TICK_ITERATION  → 执行单次 playIteration，更新 matchState
MATCH_COMPLETE  → 计算评分，应用增长，产出 pendingResult 供 CONTINUE 消费
```

matchState 形状：

```javascript
{
  homeTeam: team,           // 含 16 名球员（11 首发 + 5 替补）
  awayTeam: team,           // 同上
  matchDetails: object,     // 引擎快照
  paused: boolean,
  substitutionsLeft: 3,
  iterationLog: string[],   // 聚合的迭代日志
  events: event[],          // 结构化比赛事件列表
  stats: {                  // 聚合技术统计
    possession: number,     // %
    shots: { total, on, off },
    passes: { total, on, off },
    tackles: { total, on, off },
    corners: number,
    fouls: number,
    yellowCards: number,
    redCards: number,
    distanceCovered: number, // 估算
    passAccuracy: number     // %
  },
  result: null | { score: [number, number], rating: number, deltas: [] }
}
```

### 5. Canvas 2D 渲染层 (`MatchRenderer`)

- **场地**: Canvas 内绘制完整足球场（草皮、中线、中圈、禁区、球门等），宽度适应容器，高度按 pitchHeight/pitchWidth 比例缩放
- **球员**: 带号码的圆形图标 + 姓名缩写，按 `currentPOS` 坐标渲染。玩家球员用特殊颜色高亮
- **球**: 小圆点，按 `ball.position` 坐标渲染
- **补间动画**: 当收到新的 matchDetails 快照时，球员/球从旧位置平滑过渡到新位置（使用 `requestAnimationFrame` + 线性插值，时长 ~400ms）
- **箭头指示**: 带球球员显示运动方向箭头
- **迭代与帧分离**: 引擎更新快照（~100ms/迭代），渲染层独立以 60fps 读取快照并补间。引擎不阻塞渲染循环

### 6. 比赛 UI 组件 (`MatchView`)

**上区**：Canvas 比赛动画（占视窗高度 ~60%）
**下区**：Tab 切换面板（占视窗高度 ~40%）
- Tab 1: 技术统计（双方对比表格）
- Tab 2: 积分榜（嵌入侧栏）
- Tab 3: 播报日志（滚动文字流）

**叠加层**：
- 暂停遮罩（半透明 + "比赛暂停"文字 + 战术面板）
- 换人面板（列出替补 + 当前位置 + 换人次数）
- 关键时刻弹出提示（进球、红牌、伤病等，2 秒后自动消失）

**赛前面板**（比赛开始前显示）：
- 阵型选择（4-4-2, 4-3-3, 3-5-2 等）
- 心态选择（全力进攻 / 进攻 / 平衡 / 防守 / 全力防守 → 映射为 team.intent）
- 首发阵容确认（可拖拽调整站位）

### 7. 联赛积分榜 (`leagueTable` 模块)

- 预设联赛赛程表（双循环，如 20 队 × 38 轮）
- 玩家比赛嵌入赛程，其他比赛用引擎快速自动模拟
- 积分规则: 胜 3 分、平 1 分、负 0 分
- 排名规则: 积分 → 净胜球 → 进球数
- 数据在单次生涯会话中维护（内存），不跨会话持久化

### 8. 队友随机生成

为每场比赛的对手和队友生成 15 名随机球员（除玩家的 1 个位置外）：
- 能力值以联赛水平均值为中心的正态分布
- 标准差 ~8-10（0-100 尺度），保证有差异但不荒谬
- 位置按 4-4-2 默认阵型填充
- 门将的 saving/jumping 单独偏置

### 9. 属性系统值域迁移 (0-20 → 0-100)

- `attributes.js` 中所有范围常量更新
- `initAttributes`: 基础值 = `positionWeight × 7.5`（原 `× 1.5`），随机波动 `±20`（原 `±4`）
- `tickAttributes`: 增长量缩放 ×5
- 位置权重矩阵保持不变（比例不变，只是输出缩放）
- 3 层分类 UI 保持不变，条形图长度按 0-100 比例渲染
- 现有存档通过种子驱动重新生成自动获得新值域——玩家无感知

### 10. 比赛触发时机

引擎 `pending.type === 'match'` 时，`CareerView` 渲染 `MatchView` 而非事件面板。首次触发需在引擎中注册或模拟匹配逻辑。作为 MVP，用简单规则决定：当前赛季阶段不是转会窗且不是赛季初/末时，穿插比赛日。

## Testing Decisions

### 测试原则

- 只测试外部行为（给定输入，验证输出），不测试实现细节
- 纯函数模块优先测试
- Canvas 渲染层用 mock canvas 验证绘制调用

### 测试覆盖模块

| 模块 | 测试类型 | 关键测试用例 |
|------|----------|-------------|
| `playerRating.js` | 单元 | 进球+1.0、乌龙-1.5、赢球+0.15、零封+0.2 累加正确 |
| `attributeMapping.js` | 单元 | ST 射门权重正确、CB 抢断权重正确、0→0/100→100 边界 |
| `leagueTable.js` | 单元 | 胜3平1负0、同分比净胜球、完整赛季排名正确 |
| `GameContext` reducer | 单元 | START_MATCH 构建状态、PAUSE/RESUME 切换、SUBSTITUTE 次数限制 |
| `matchEngine` | 集成 | CJS→ESM 正确加载、initiateGame 返回有效 matchDetails、auto simulation 完成 |
| `MatchRenderer` | 单元 | mock canvas 上下文验证 drawImage/strokeRect 等调用次数和参数 |
| `attributes.js` | 单元 | initAttributes 输出值域 0-100、tickAttributes + applyMatchGrowth 叠加正确 |

### 参照现有测试模式

- `GameContext` reducer 测试参照已有 reducer action 测试风格
- 纯函数模块测试参照 `attributes.js` 的测试结构

## Out of Scope

- 真实球员数据接入（队友/对手后期用真实数据）
- 3D 渲染（当前决策为完整 2D 俯视）
- 多人在线/对战
- 跨赛季持久化积分榜（单次会话）
- 语音解说
- 视频回放系统
- 移动端适配（先做桌面端）

## Further Notes

- 引擎已 vendored 为 `src/engine/` 的 ESM fork，`src/matchEngine.js` 直接 import，无需 CJS→ESM 转换，也不再依赖 npm 包。
- 比赛 MVP 建议先实现自动模拟模式（快速验证所有流程打通），再叠加手动暂停介入，最后做 Canvas 动画。
- 积分榜 + 赛程的预设计在后期切换真实数据时只需替换数据源，接口不变。
- 评分公式的 >200 种事件映射在 MVP 中可精简为核心 20-30 种事件，后续扩展。
