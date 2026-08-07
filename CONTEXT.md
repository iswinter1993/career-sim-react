# career-sim-react — Domain Glossary

Last updated: 2026-08-07

## State Machine (状态机)

Top-level phases: INTRO → IDENTITY → CAREER → MATCH → SUMMARY

CAREER sub-states (derived in `src/stateMachine.js`, consumed by `GameContext`):
| State | Meaning |
|---|---|
| `career.idle` | No pending event — auto-advance after 100ms |
| `career.event_choice` | Player must choose an event option (event/random) |
| `career.spinning` | Slot-machine probability animation playing |
| `career.event_result` | Event resolved, showing result — "继续" → MATCH |
| `career.academy_choice` | Pick academy club |
| `career.transfer_choice` | Pick transfer destination / stay / retire |
| `career.recap` | Season recap — "继续" → MATCH |
| `career.end` | Career forcibly ended |

MATCH sub-states: `match.init` → `match.tactics` → `match.playing` ↔ `match.paused` → `match.finished`

Components now dispatch simple events (`CHOOSE`, `CONTINUE`); the reducer delegates to `stateMachine.js` which routes based on current sub-state. No more implicit field combinations or scattered if-else chains.

## Core Concepts

- **OVR**: 球员综合能力评分 (0-99)，由引擎 (`window.SIM`) 产出。
- **属性（Attributes）**: 球员能力细分模块，在 bridge 层独立维护，不依赖引擎。分为技术（Technical）、身体（Physical）、精神（Mental）三大类，每类包含若干子属性，值域 0-20。
- **属性权重（Weights）**: 每个位置（GK/CB/LB/RB/CDM/CM/CAM/LM/RM/LW/RW/ST）各有一套权重表，决定子属性 → 三大类 → OVR 的加权映射。
- **潜力值（Potential）**: 0-20，由种子确定，决定球员理论峰值。对玩家不可见（设计意图）。
- **成长曲线（Development Curve）**: 三种类型——早熟型（early，18-22 岁快速成长，24 岁见顶）、平稳型（steady，26-28 岁见顶）、晚成型（late，25 岁后爆发，30 岁仍在成长）。
- **种子（Seed）**: 玩家选择或系统生成的字符串，驱动整局游戏的随机数序列。同一种子 + 同一位置/出身 → 完全相同的初始属性和成长轨迹。

## Attribute Categories

### Technical (技术)
控球、传球、射门、盘带、抢断、定位球

### Physical (身体)
速度、力量、耐力、弹跳、对抗

### Mental (精神)
视野、冷静、决断、领导力

## Module Contract

属性系统位于 `src/attributes.js`，通过 `SIM.getAttributes()` / `SIM.initAttributes()` 等便捷方法暴露。状态内部维护，不进入 GameContext 数据流。

- **Query**: `getAttributes()`, `getCategory(attrs, cat)`, `getOVRFromAttributes(attrs, pos)`, `getWeights(pos)`
- **Lifecycle**: `initAttributes(identity, seed)`, `tickAttributes(currentOvr, age, pos, attrs)`
- `tickAttributes` 调用时机：`NEXT_STEP` reducer 中，引擎 `nextStep()` 之后。

## Match Simulation (比赛模拟)

- **比赛日（Match Day）**: 新增的 pending 类型 `match`，与现有事件（event/transfer/academy）交替出现。每赛季约5场关键比赛。
- **比赛引擎**: `footballsimulationengine` v5.0.0，回合制离散迭代。每场比赛调用多次 `playIteration()`。
- **迭代与渲染分离**: 引擎快速独立运行迭代，Canvas 渲染层通过 `requestAnimationFrame` 从当前 matchDetails 快照独立绘制，不等待引擎。
- **球员映射**: 玩家的 15 项子属性（技术/身体/精神）→ `footballsimulationengine` 10 项技能。队友随机生成。
- **比赛阵容**: 每队 16 人（首发 11 人 + 替补 5 人）。玩家球员占据首发对应位置。
- **战术介入**: 赛前设置战术（阵型、心态、首发）。比赛中可随时暂停，修改战术/换人/指定动作后继续。3 次换人名额。
- **暂停机制**: 暂停时引擎停止迭代，玩家修改后点击继续恢复迭代。
- **伤病**: 引擎内置伤病判定。伤病触发自动暂停并弹出换人界面。战术换人也可主动触发。
- **积分榜**: 预设联赛赛程表，所有球队间比赛按计划推进，玩家比赛嵌入其中，其他比赛自动模拟比分。显示为比赛页面侧边栏。
- **技术统计**: 控球率、射门(射正/射偏)、传球、抢断、角球、犯规、黄牌/红牌、跑动距离、传球成功率。
- **比赛播报**: 实时滚动文字流 + 关键时刻弹出醒目提示（进球、红牌、伤病等）。
- **赛后评分**: 6.0 起评分 ± 比赛事件加权 ± 赛果/零封红利。评分驱动子属性增长，与赛季 `tickAttributes` 叠加（非替代）。
- **比赛 UI 布局**: 上下布局——上半部分 Canvas 比赛动画，下半部分 tab 切换（技术统计/积分榜/播报日志）。
- **属性值域**: 子属性从 0-20 改为 0-100，与 footballsimulationengine 技能值域对齐。

## UI

点击 CareerView 中的 OVRBadge 弹出属性详情面板（Modal），展示技术/身体/精神三栏及其子属性值。
