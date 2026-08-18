# @bleckert/football-simulator 库分析报告

> 分析对象：`D:\newgame\football-simulator`（npm 包 `@bleckert/football-simulator` v2.0.0）
> 分析目的：为 `career-sim-react`（足球模拟器项目）集成该库做比赛模拟提供依据。
> 结论先行：**新项目一律使用 `RealTimeEngine` + `RealTimeReporter`（必要时用 `SeasonSimulator`）**，旧引擎（`Engine`/`Game`/`Commentator`/`Reporter`/`Field`）仅适合极轻量原型，官方文档也明确建议弃用。

---

## 一、库概览

| 项 | 值 |
| --- | --- |
| 包名 | `@bleckert/football-simulator` |
| 版本 | 2.0.0 |
| 语言 | TypeScript（源码 `.ts`，随包发布 `dist/index.js` + `dist/index.d.ts`） |
| 模块格式 | **ESM-only**（`"type": "module"`，无 CJS 产物） |
| 运行时要求 | Node `>=18` |
| 运行时依赖 | 仅 `events ^3.3.0`（几乎零依赖） |
| 用途 | 为足球经理/文字直播类游戏提供比赛引擎 |

入口（`index.ts`）导出：

- 类：`Commentator`、`Engine`、`Field`、`Game`、`Player`、`RealTimeEngine`、`RealTimeReporter`、`Reporter`、`SeasonSimulator`、`Team`
- 枚举/常量：`Position` 及 `attackPositions` / `centerPositions` / `defencePositions` / `leftPositions` / `midfieldPositions` / `rightPositions`
- 类型：`PlayerAttributes` 系列、`RealTimeEngine` 全部类型（`Tactics`、`MatchSnapshot`、`RealTimeMatchEvent`、`PossessionContext`、`FieldZone`、`AttackPattern`、`PlayerIntent` 等）、`RealTimeReport`、`SeasonReport`、`Report`（旧引擎）

> 注意：`data/createPlayer.ts`（随机生成球员的辅助函数）**没有**从 `index.ts` 导出，只是 demo/test 的辅助脚本。集成时要么自己写球员生成器，要么把该文件拷进自己的项目。

---

## 二、两代引擎架构

库内部有两套独立的模拟引擎，互不相通：

### 2.1 旧引擎（事件驱动，已不推荐）

`Engine` → 产生 `GameEvent` 序列 → `Game`（`EventEmitter`，定时器驱动）→ `Commentator`（把事件转成英文解说句）→ `Reporter`（统计进球/控球/射门/射手榜）。

特点：

- 基于"整场回合"粗粒度推进（`gameTime=90`、`eventsPerMinute=1`、`homeTeamAdvantage=2`、`randomEffect=25` 等可调参数），每回合比较两队 rating + 随机数决定 Advane/Goal/Save/Block 等。
- **内部直接用 `Math.random()`，不可注入 seed**，因此同一场比赛每次跑结果不同，无法复现。
- 事件类型只有 `GameStart / Kickoff / Goal / Save / Block / Advance / Retreat / Defence / HalfTime / GameEnd / EventLess`，没有传球、犯规、黄牌、换人等细节。
- `Field` 用一个 5×3 的抽象网格（`FieldArea`）表示球的位置移动，不是真实坐标。

结论：细节太粗、不可复现，不适合做需要战术/数据/回放的经理游戏。**集成时忽略它。**

### 2.2 新引擎（agent-based、tick 驱动，推荐）

核心类：

- `RealTimeEngine`：逐 tick 模拟整场比赛（默认每 tick 0.25 秒），产出一系列 `MatchSnapshot`（逐帧快照）和 `RealTimeMatchEvent`（事件流）。
- `RealTimeReporter`：把一场跑完的比赛总结成结构化战报（`headline`/`summary`/`sections`/`turningPoints`）。
- `SeasonSimulator`：在 `RealTimeEngine` 之上做联赛（循环赛制），产出积分榜、射手榜、助攻榜、风格统计、赛季指标。

---

## 三、RealTimeEngine 工作机制（重点）

### 3.1 基本参数

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `tickSeconds` | `0.25` | 每 tick 的模拟秒数 |
| `matchLengthSeconds` | `90 * 60`（5400 秒） | 常规时间长度 |
| `homeTactics` / `awayTactics` | balanced 默认 | 双方战术（可部分覆盖） |
| `referee` | 默认裁判 | 裁判尺度 |
| `random` | `Math.random` | **可注入的随机函数，注入 seeded 函数即可复现比赛** |

因此一场 90 分钟比赛默认约产生 **5400 / 0.25 ≈ 21,600 个快照**。这是"逐帧回放"的代价——如果只需最终结果和事件，**不要把全部快照入库**（见第八节集成建议）。

球场坐标系：**105 × 68 米**，`goalWidth = 7.32`。x 轴为主队进攻方向，y 轴为宽度（0~68）。所有 `position`、`ball.x/y`、`target.x/y` 都是这个坐标系的米数。

### 3.2 每 tick 的模拟循环

`tick()` 内部依次执行：

1. `handleTimeBoundaries()` — 判定半场/全场结束、处理补时（见 3.5）。
2. 死球阶段结算 — 界外球 / 角球 / 球门球 / 任意球 / 点球等 `restart` 的执行。
3. `updateTacticalState()` — 赛中战术自适应（见 3.3）。
4. `updateTacticalTargetPositions()` — 根据阵型/心态更新每名球员的站位目标。
5. `decidePlayerIntents()` — 决定每名球员的意图（持球、无球、二点球、松球；`PlayerIntent` 含 `type/duration/urgency/tacticalRisk`）。
6. `resolveBallAction()` — 结算持球动作：传球（选目标→质量→路线→拦截）、射门（质量→门将/封堵/偏出/进球）、盘带、铲抢、犯规/黄红牌/受伤/有利原则。
7. `movePlayersAndBall()` — 移动球员与球。
8. `detectEvents()` / `detectSubstitutionEvents()` — 记录本 tick 产生的事件、触发自动换人。

### 3.3 赛中战术自适应（无需玩家干预）

`updateTacticalState()` 会自动做出如下反应：

- 红牌后 → 该队转防守心态。
- 60 分钟后仍落后 → 转攻击心态 + 提高 tempo/press。
- 75 分钟后领先 → 转防守心态。
- 体能下降 → 降低 press。

因此"领先稳守、落后狂攻"的剧情是引擎内置的，不需要玩家手动调用。

### 3.4 阵型与站位

- `start()` 时按 `Position` 角色进行**角色感知站位**（门将靠近本方球门、前锋在防守者前方，与 `players` 数组顺序无关——测试里专门验证过乱序传入也能正确站位）。
- 半场双方交换进攻方向（`attackDirection(side)`：主队上半场 +1，下半场 -1）。
- `Tactics.formation` 是自由字符串（如 `'4-4-2'`、`'4-3-3'`），引擎不严格按字符串人数分配，只影响站位参考；真正起作用的战术数值是 `press/width/tempo/mentality/defensiveLine/compactness/focus` 与风格预设。

### 3.5 补时与换人规则

补时（addedTime）按事件累计：进球 +25s、受伤 +35s、换人 +20s、黄牌/点球 +10s。

换人严格遵循 IFAB 规则：

- 首发 = `players` 前 11 人；第 12~26 人最多取 15 人作为"具名替补"（超过 15 截断）。
- 若未提供替补，引擎自动生成 5 名 fallback 替补。
- 每队最多 **5 人次、3 次换人机会**；同一停顿时点的多人次只算 1 次机会。
- 自动换人触发条件：体能耗尽（stamina 低）、受伤被迫换下、落后时换上前锋等；引擎会**优先用非门将的替补替换除门将外位置**。

### 3.6 公开 API

| 成员 | 说明 |
| --- | --- |
| `start()` | 开球，返回首个快照（`simulate()`/`tick()` 会自动调用） |
| `tick()` | 推进一个 tick，返回 `{ state, events, snapshot }` |
| `simulate(untilSeconds)` | 跑到指定秒数或终场，返回全部 `MatchSnapshot[]` |
| `applyTacticalChange(side, changes, reason)` | 赛中改战术（`home`/`away`），记 `tactical_change` 事件 |
| `applyRoleChange(playerId, role, reason)` | 改单个模拟球员角色，记 `role_change` 事件 |
| `state` | 当前可变比赛状态（含 `players`、`ball`、`score`、`tactics`、`possession`、`secondBall`、`substitutionOpportunitiesUsed` 等） |
| `events` | 已提交的全部事件 |
| `snapshots` | 已提交的全部快照 |
| `homeTeam` / `awayTeam` | 双方 `Team` |
| `tickSeconds` / `matchLengthSeconds` | 参数快照 |

> `applyTacticalChange` / `applyRoleChange` 是"经理决策"的入口——玩家在比赛中途的换人/变阵/换位都应通过这两个方法实现，这样战报（`RealTimeReporter`）的 "Manager impact" 章节会解释这些决策。

---

## 四、数据模型

### 4.1 Player（球员）

构造：`new Player(info, biometrics, attributes, position)`

- `info`：`{ name: string, number: number }`
- `biometrics`：`{ height: number, weight: number }`
- `position`：`Position` 枚举值
- `attributes`：**完整** `PlayerAttributes`（引擎要求每个字段都存在，缺字段会出 `NaN`）

属性体系在 **1~20 刻度**，共 **46 项**，分四组：

| 组 | 数量 | 字段 |
| --- | --- | --- |
| 心理 `MentalAttributes` | 14 | aggression, anticipation, bravery, composure, concentration, decisions, determination, flair, leadership, offTheBall, positioning, teamwork, vision, workRate |
| 身体 `PhysicalAttributes` | 8 | acceleration, agility, balance, jumpingReach, naturalFitness, pace, stamina, strength |
| 技术 `TechnicalAttributes` | 14 | corners, crossing, dribbling, finishing, firstTouch, freeKickTaking, heading, longShots, longThrows, marking, passing, penaltyTaking, tackling, technique |
| 门将 `GoalkeeperAttributes` | 10 | aerialReach, commandOfArea, communication, eccentricity, handling, oneOnOnes, reflexes, rushingOut, tendencyToPunch, throwing |

派生评分 `player.rating()`：

- 门将返回 `GoalkeeperRating`：`diving / hands / kicking / reflexes / speed / positioning`。
- 其他位置返回 `PlayerRating`：`pace / shooting / passing / dribbling / defending / physique`。
- 每项由若干底层属性取平均后映射到 **0~100**（`attributesAverage = mean / 20 * 100`）。
- 另有 `ratingAverage()`、`defenceRating()`、`possessionRating()`、`attackRating()`。

> 集成建议：在游戏数据里**保存球员的 46 项 1~20 属性**（或你自定义的属性，再用映射函数转成这 46 项），开赛时再 `new Player(...)`。不要直接序列化 `Player` 实例。

### 4.2 Position 枚举

共 26 个值（零基）：`GK, LB, LCB, CB, RCB, RB, LWB, LDM, DM, RDM, RWB, LM, LCM, CM, RCM, RM, LW, LCOM, COM, RCOM, RW, LF, CF, RF, ST`。

并导出分组数组：`defencePositions`、`midfieldPositions`、`attackPositions`、`leftPositions`、`centerPositions`、`rightPositions`（做位置匹配、按角色加属性、AI 换人判断时很有用）。

### 4.3 Team（球队）

构造：`new Team(home: boolean, name: string, players: Player[])`

- `home=true` 表示主队（决定开球方向/坐标）。
- 前 11 名 = 首发；后 15 名 = 具名替补（见 3.5）。

派生评分：`rating()`（`{goalkeeping, defense, attack}`）、`goalkeeperRating()`、`defenceRating()`、`possessionRating()`、`attackRating()`；以及 `getGoalkeepers()`、`getFieldPlayers()`。

### 4.4 Tactics（战术）

```ts
type TacticalStyle = 'balanced' | 'possession' | 'direct' | 'counter' | 'low_block' | 'high_press';
type Mentality = 'defensive' | 'balanced' | 'attacking';
type AttackingFocus = 'balanced' | 'wide' | 'central';

interface Tactics {
    formation: string;      // 如 '4-4-2'
    style: TacticalStyle;
    press: number;          // 0~100
    width: number;          // 0~100
    tempo: number;          // 0~100
    mentality: Mentality;
    defensiveLine: number;  // 0~100
    compactness: number;    // 0~100
    focus: AttackingFocus;
}
```

- 可以**只传部分字段**，缺失值由所选 `style` 预设补齐，数值会被 clamp 到 0~100。
- 六个风格预设（press/width/tempo，后三项为 mentality）：

| style | press | width | tempo | mentality |
| --- | --- | --- | --- | --- |
| balanced | 50 | 55 | 50 | balanced |
| possession | 56 | 54 | 42 | balanced（focus central） |
| direct | 46 | 52 | 72 | balanced |
| counter | 38 | 48 | 62 | defensive |
| low_block | 28 | 42 | 36 | defensive |
| high_press | 82 | 58 | 68 | attacking |

风格差异是真实生效的——测试验证了：high_press 的防线明显更靠前、`press` 意图更激进、final-third 抢断更多；direct 更愿意长传；possession 更倾向短传循环。

### 4.5 RefereeProfile（裁判）

```ts
interface RefereeProfile {
    strictness: number;        // 严格度（黄红牌倾向）
    advantagePatience: number; // 有利原则耐心
    penaltyThreshold: number;  // 判点球阈值
    bookingThreshold: number;  // 出牌阈值
}
```
数值 0~100，可部分覆盖默认值（`strictness 52 / advantagePatience 45 / penaltyThreshold 55 / bookingThreshold 55`）。

---

## 五、输出：快照、事件、战报

### 5.1 MatchSnapshot（逐帧快照，用于回放/实时画面）

关键字段：

| 字段 | 说明 |
| --- | --- |
| `time` | 比赛秒数 |
| `period` | `1` / `2` / `'ended'` |
| `phase` | `open_play` / `corner` / `throw_in` / `half_time` / `full_time` / `substitution` … |
| `score` | `{ home, away }` |
| `ball` | 球的位置、速度、`ownerId` |
| `players` | 每名球员的坐标、体能、角色、红黄牌、受伤状态、`target`、`currentIntent` |
| `events` | 本快照产生的事件 |
| `possession` | 控球上下文 |
| `fieldZones` | 当前区域（前中后三区 × 五条纵向通道等） |
| `activeAttackPattern` | 当前进攻模式标签 |
| `activePassTarget` / `activeShot` / `secondBall` | 进行中的传球目标 / 射门 / 二点球 |

### 5.2 RealTimeMatchEvent（事件流，用于文字直播/时间线/统计）

**33 种事件类型**：

`match_start, kickoff, half_time, full_time, throw_in, corner, goal_kick, free_kick, penalty, dribble, challenge, yellow_card, red_card, injury, substitution, tactical_change, role_change, advantage, aerial_duel, blocked_shot, goalkeeper_claim, goalkeeper_punch, pass, receive, second_ball, interception, tackle, shot, save, miss, foul, goal, recovery`

关键字段：`type`、`time`、`teamSide`（`'home'|'away'`）、`team`、`player`、`secondaryPlayer`、`position`（球场坐标）、`score`（事件后比分）、`outcome`（路线/死球结果/犯规原因等，如 `cross`、`through_ball`、`penalty_goal`、`penalty_foul`、`long_shot`）、`fieldZones`、`possession`、`activeAttackPattern`、`chanceQuality`、`replayWindow`（进球的回放窗口）。

统计口径（demo 里就是这么算的，可直接照搬）：

- 传球 = `pass` 事件数；传球成功 = `receive` 事件数（`passCompletion = receive / pass`）。
- 射门 = `shot`；射正 = `goal` + `save`。
- 抢断 = `tackle`；犯规 = `foul`；黄牌 = `yellow_card`；红牌 = `red_card`。
- 控球率：逐快照找 `ball.ownerId` 归属（或逐事件 `teamSide`），按持有方计数取比例。
- 传球路线 `outcome` 可取 `cross / cutback / through_ball / switch_of_play / lateral_support / backward_reset / long_kick` 等。

### 5.3 RealTimeReporter（赛后战报）

`new RealTimeReporter(engine).getReport()` 返回：

| 字段 | 说明 |
| --- | --- |
| `headline` | 比分标题 |
| `summary` | 一段总结 |
| `teams.home` / `teams.away` | 双方报告数据 |
| `sections[]` | Tactical pattern / Chance creation / Pressing / Player impact / Manager impact 五个章节 |
| `turningPoints[]` | 关键转折事件 |

---

## 六、SeasonSimulator（联赛模拟）

```ts
new SeasonSimulator(teams: SeasonTeamInput[], {
    rounds = 2,
    matchLengthSeconds = 90 * 60,
    random = Math.random,
}).simulate();
```

- `SeasonTeamInput = { name, players, tactics? }`。
- 赛制：循环赛（round-robin），每轮主客交替（`rounds` 为轮次，默认双循环）。
- 返回 `SeasonReport`：`matches`（每场摘要）、`table`（按 积分→净胜球→进球→队名 排序）、`topScorers`、`topPassers`、`styleStats`（按战术风格聚合）、`metrics`（`goalsPerMatch / shotsPerMatch / yellowCardsPerMatch / redCardsPerMatch / injuriesPerMatch / homeWinShare`）。

用途：适合"模拟一个赛季并生成积分榜/数据榜"，或用来**批量校准引擎**（跑 N 个种子看场均进球/红黄牌是否落在合理区间）。

---

## 七、随机性与可复现性

引擎所有随机性都走注入的 `random()` 函数。官方文档与测试统一使用的 seed 实现（可直接抄）：

```ts
function seededRandom(seed: number): () => number {
    let value = seed;
    return () => {
        value = (value * 16807) % 2147483647; // Park–Miller LCG
        return (value - 1) / 2147483646;
    };
}
```

- 传入同一个 seed 的同一批球员/战术，**逐帧结果完全一致**（可复现）。
- `RealTimeEngine` 用一次 seed 驱动整场；`SeasonSimulator` 用同一个 `random` 贯穿所有轮次。
- 测试里还有 `queuedRandom([...])` 这种"按序出值"的假随机，用于把引擎逼到特定分支（强制射门/犯规/点球等）做单测——集成时用不上，但说明引擎的分支完全由 `random()` 驱动，可控性很强。

---

## 八、集成到 career-sim-react 的建议

### 8.1 推荐工作流（官方文档亦如此）

1. 自建游戏数据模型：俱乐部、阵容、赛程、经理、存档。
2. 开赛时把选中的球员/战术**转换**成 `Player` / `Team` / `Tactics` 对象。
3. 在**服务端或可信 worker** 里跑 `RealTimeEngine`。
4. 只把**紧凑的事件日志 + 最终比分 + 战报文本 + seed** 存入游戏数据库。
5. 浏览器端据此渲染文字直播、时间线、战报或轻量回放。

### 8.2 数据边界（重要）

- **不要把 `RealTimeEngine` / `Team` / `Player` 的类实例直接序列化进 DB**（这些类带方法、内部可变状态、坐标数组，JSON 会爆炸或丢类型）。
- 持久化应该是：`seed`、`events`（33 种事件，字段全是普通 JSON）、可选的关键 `snapshots`（如需回放，按时间抽稀，例如每秒 1 帧而不是 0.25 秒 1 帧）、`RealTimeReporter` 生成的文本。
- 回放若需要逐帧动画，可以只存 seed，**前端重新跑一遍**（确定性保证了同 seed 同结果）。

### 8.3 性能注意

- 一场 90 分钟默认约 **21,600 个快照**、几百到上千个事件。服务端一次 `simulate()` 是同步 CPU 计算，单场很快；但**一个赛季/一个联赛几千场**会累积，注意放到 worker / 队列 / 分帧跑。
- 如果只需要结果，用 `simulate(90*60)` 一次性跑完，别用 `tick()` 逐 tick 循环（逐 tick 返回会放大对象分配）。
- 前端不要跑完整赛季；只回放单场并抽稀快照。

### 8.4 完整最小示例（可直接复制）

```ts
import {
    Player,
    Position,
    RealTimeEngine,
    RealTimeReporter,
    Team,
    type PlayerAttributes,
    type Tactics,
} from '@bleckert/football-simulator';

// 1) 可复现随机
function seededRandom(seed: number): () => number {
    let value = seed;
    return () => {
        value = (value * 16807) % 2147483647;
        return (value - 1) / 2147483646;
    };
}

// 2) 全量默认属性（1~20），再按位置叠加
const base: PlayerAttributes = {
    aggression: 12, anticipation: 12, bravery: 12, composure: 12, concentration: 12,
    decisions: 12, determination: 12, flair: 12, leadership: 12, offTheBall: 12,
    positioning: 12, teamwork: 12, vision: 12, workRate: 12,
    acceleration: 12, agility: 12, balance: 12, jumpingReach: 12, naturalFitness: 12,
    pace: 12, stamina: 12, strength: 12,
    corners: 12, crossing: 12, dribbling: 12, finishing: 12, firstTouch: 12,
    freeKickTaking: 12, heading: 12, longShots: 12, longThrows: 12, marking: 12,
    passing: 12, penaltyTaking: 12, tackling: 12, technique: 12,
    aerialReach: 12, commandOfArea: 12, communication: 12, eccentricity: 12,
    handling: 12, oneOnOnes: 12, reflexes: 12, rushingOut: 12, tendencyToPunch: 12,
    throwing: 12,
};

function attrsFor(pos: Position): PlayerAttributes {
    const a = { ...base };
    if ([Position.LF, Position.CF, Position.RF, Position.ST, Position.LW, Position.RW].includes(pos)) {
        Object.assign(a, { finishing: 18, composure: 17, offTheBall: 16, pace: 15 });
    }
    if ([Position.LCM, Position.CM, Position.RCM, Position.LM, Position.RM].includes(pos)) {
        Object.assign(a, { passing: 17, vision: 16, decisions: 16, stamina: 16 });
    }
    if ([Position.LB, Position.LCB, Position.CB, Position.RCB, Position.RB].includes(pos)) {
        Object.assign(a, { tackling: 17, marking: 16, positioning: 16, strength: 15 });
    }
    if (pos === Position.GK) {
        Object.assign(a, { handling: 17, reflexes: 17, oneOnOnes: 17, positioning: 16 });
    }
    return a;
}

const XI: Position[] = [
    Position.GK, Position.LB, Position.LCB, Position.RCB, Position.RB,
    Position.LM, Position.LCM, Position.RCM, Position.RM, Position.LF, Position.RF,
];

function makeTeam(home: boolean, name: string): Team {
    const players = XI.map((pos, i) =>
        new Player(
            { name: `${name} ${Position[pos]}`, number: i + 1 },
            { height: 180, weight: 75 },
            attrsFor(pos),
            pos,
        ));
    return new Team(home, name, players);
}

// 3) 开赛
const homeTactics: Partial<Tactics> = { formation: '4-4-2', style: 'high_press', press: 62, tempo: 66, mentality: 'attacking' };
const awayTactics: Partial<Tactics> = { formation: '4-3-3', style: 'possession', press: 48, mentality: 'balanced' };

const engine = new RealTimeEngine(makeTeam(true, 'Juventus'), makeTeam(false, 'Milan'), {
    random: seededRandom(20260505),
    homeTactics,
    awayTactics,
});

const snapshots = engine.simulate(90 * 60);   // 全部快照
const events = engine.events;                 // 全部事件

// 4) 赛后统计（照搬 demo 口径）
const finalScore = snapshots[snapshots.length - 1].score;
const goals = events.filter((e) => e.type === 'goal');
const pass = (side: string) => events.filter((e) => e.type === 'pass' && e.teamSide === side).length;
const received = (side: string) => events.filter((e) => e.type === 'receive' && e.teamSide === side).length;

// 5) 战报
const report = new RealTimeReporter(engine).getReport();
console.log(report.headline, report.summary);
console.log('比分', finalScore, '射门', events.filter((e) => e.type === 'shot').length);
console.log('主队传球成功率', (received('home') / pass('home')).toFixed(2));
```

### 8.5 经理决策（赛中交互）入口

```ts
engine.applyTacticalChange('home', { formation: '4-3-3', style: 'low_block', mentality: 'defensive', press: 24 }, 'protect_lead');
engine.applyRoleChange(playerId, Position.RB, 'protect_right_side');
```

调用后 `RealTimeReporter` 的 "Manager impact" 章节会自动解释这些决策。

---

## 九、注意事项 / 坑

1. **ESM-only**：项目需支持 ESM（Vite 没问题；若走 CommonJS 需 `import()` 动态加载或升级工具链）。Node 需 `>=18`。
2. **属性必须全量**：`PlayerAttributes` 46 项一个都不能缺，否则内部加权平均会产出 `NaN`，且不会报错——务必用"完整默认对象 + 覆盖"的模式构造。
3. **替补规则**：首发 = 前 11 人；具名替补最多 15；没给替补会自动生成 5 个兜底。若你的联赛有"7 人替补席"之类的规则，需要自己在上游裁剪 `players` 数组。
4. **换人上限写死**：5 人次 / 3 次机会，符合 IFAB，但无法配置；想自定义需改源码。
5. **旧引擎不可 seed**：`Engine`/`Game` 用 `Math.random()`，且没有传球/犯规/换人细节，仅适合一次性原型。
6. **快照量巨大**：默认 0.25s/tick → 约 21,600 帧，勿整场入 DB；只存事件 + seed + 战报，需要回放时按 seed 重跑或抽稀。
7. **`applyRoleChange` 改的是模拟状态**（`SimulatedPlayer.role`），不是底层 `Player.position`——赛后数据落库时应以你自己的球员模型为准。
8. **无内置球员生成器**：`data/createPlayer.ts` 未导出，需自备。

---

## 十、源码文件导览（速查）

| 文件 | 作用 | 是否建议集成时关注 |
| --- | --- | --- |
| `index.ts` | 出口汇总 | 是（看导出面） |
| `RealTimeEngine.ts` | 新引擎核心（~4400 行） | 是（读公开类型与方法） |
| `RealTimeReporter.ts` | 赛后战报 | 是 |
| `SeasonSimulator.ts` | 联赛模拟 | 按需 |
| `Player.ts` | 球员模型 + 评分 | 是 |
| `Team.ts` | 球队模型 + 评分 | 是 |
| `enums/Position.ts` | 位置枚举与分组 | 是 |
| `Engine.ts` / `Game.ts` | 旧引擎 | 否 |
| `Commentator.ts` | 旧引擎解说 | 否 |
| `Reporter.ts` / `types/Report.ts` | 旧引擎统计 | 否 |
| `Field.ts` / `fieldHelpers.ts` / `enums/FieldArea.ts` | 旧引擎网格球场 | 否 |
| `enums/Event.ts` / `Action.ts` / `GoalType.ts` / `AssistType.ts` / `DefenceType.ts` / `types/GameEvent.ts` / `types/GameInfo.ts` / `types/FieldColumn.ts` | 旧引擎事件/动作枚举 | 否 |
| `lib/getRandomElement.ts` | 旧引擎加权随机 | 否 |
| `data/createPlayer.ts` | 随机球员生成（demo 用，未导出） | 参考 |
| `demo/src/simulation.ts` | 完整使用示例 + 统计口径 | **强烈建议参考** |
| `test/realtime.ts` | 行为规格（~1800 行，覆盖每个分支） | 参考（理解引擎能力边界） |
| `test/calibration.ts` | 属性→效果校准断言 | 参考 |
| `test/season.ts` | 赛季冒烟测试 | 参考 |
