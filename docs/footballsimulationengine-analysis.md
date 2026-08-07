# footballsimulationengine v5.0.0 分析文档

**作者**: Aiden Gallagher  
**仓库**: https://github.com/GallagherAiden/footballSimulationEngine  
**许可证**: ISC  
**npm**: `npm install --save footballsimulationengine`

---

## 概述

一个回合制足球比赛模拟引擎。不是实时模拟，而是以"迭代"（iteration）方式运行——每次调用 `playIteration()` 推进比赛一个回合。比赛长度由调用方自行决定（建议每半场若干次迭代）。

---

## 模块结构

| 文件 | 职责 |
|------|------|
| `engine.js` | 主入口，暴露 3 个 API：`initiateGame`、`playIteration`、`startSecondHalf` |
| `lib/common.js` | 数学工具、随机数、轨迹计算、伤病判定、场地判断 |
| `lib/validate.js` | 输入校验（队伍、球员、场地、比赛状态） |
| `lib/setVariables.js` | 初始化比赛状态、球员统计、分配 playerID/teamID、开球 |
| `lib/setPositions.js` | 管理所有定位球场景（角球×4、界外球×4、球门球×2、点球×2）、进球、出界处理 |
| `lib/setFreekicks.js` | 任意球场景的球员站位布局（按场地分区） |
| `lib/actions.js` | AI 决策系统：根据位置/对手/技战术计算11种动作的权重 |
| `lib/playerMovement.js` | 球员移动、抢断执行、越位判定、动作分发、红黄牌 |
| `lib/ballMovement.js` | 球的物理运动：射门、传球、传中、解围、折射、3D轨迹计算 |

---

## 核心 API

### 1. `initiateGame(team1, team2, pitchDetails)` → Promise\<matchDetails\>

初始化比赛。校验输入，生成 matchDetails 对象，随机抽签决定开球方，将其中一队翻转到对面半场。

### 2. `playIteration(matchDetails)` → Promise\<matchDetails\>

执行一个迭代回合：
1. 记录球的位置
2. 随机伤病检查（~1/40000 概率）
3. 移动球（如果球还在飞行中，即 `ballOverIterations` 非空）
4. 找出每队离球最近的球员
5. 为每队所有球员决定动作（AI 决策）
6. 分离"球类动作"和"移动类动作"
7. 执行球员移动、抢断
8. 从合法持球者中随机选择一个执行球类动作
9. 越位检查
10. **⚠️ 打印整个 matchDetails 到 console（engine.js 第89行，生产环境需移除）**

### 3. `startSecondHalf(matchDetails)` → Promise\<matchDetails\>

下半场开始：交换双方场地、重置球员位置、重置体能、设定开球方。

---

## 数据结构

### matchDetails（核心状态对象）

```json
{
  "matchID": 78883930303030001,
  "kickOffTeam": { /* team object */ },
  "secondTeam": { /* team object */ },
  "pitchSize": [680, 1050, 90],
  "ball": {
    "position": [340, 525, 0],
    "withPlayer": true,
    "Player": "78883930303030109",
    "withTeam": "78883930303030002",
    "direction": "south",
    "ballOverIterations": [],
    "lastTouch": {
      "playerName": "Peter Johnson",
      "playerID": "78883930303030109",
      "teamID": "72464187147564590",
      "bodyPart": "shin",
      "deflection": true,
      "iterations": 0
    }
  },
  "half": 1,
  "kickOffTeamStatistics": {
    "goals": 0,
    "shots": { "total": 0, "on": 0, "off": 0 },
    "corners": 0,
    "freekicks": 0,
    "penalties": 0,
    "fouls": 0
  },
  "secondTeamStatistics": { /* 同上结构 */ },
  "iterationLog": ["...", "..."]
}
```

### Team JSON（initiateGame 输入格式）

```json
{
  "name": "Team1",
  "players": [ /* 恰好11名球员 */ ],
  "manager": "Aiden"
}
```

### Player JSON（initiateGame 输入格式）

```json
{
  "name": "Bill Johnson",
  "position": "GK",
  "rating": "75",
  "skill": {
    "passing": "20",
    "shooting": "12",
    "tackling": "20",
    "saving": "20",
    "agility": "20",
    "strength": "20",
    "penalty_taking": "43",
    "perception": "75",
    "jumping": "30",
    "control": "60"
  },
  "currentPOS": [340, 0],
  "fitness": 100,
  "height": 200,
  "injured": false
}
```

### Player JSON（playIteration 后增加字段）

```json
{
  "playerID": 78883930303030210,
  "originPOS": [440, 550],
  "intentPOS": [440, 550],
  "action": "none",
  "offside": false,
  "hasBall": false,
  "stats": {
    "goals": 0,
    "shots": { "total": 0, "on": 0, "off": 0 },
    "cards": { "yellow": 0, "red": 0 },
    "passes": { "total": 0, "on": 0, "off": 0 },
    "tackles": { "total": 0, "on": 0, "off": 0, "fouls": 0 },
    "saves": 0
  }
}
```

### Pitch JSON

```json
{
  "pitchWidth": 680,
  "pitchHeight": 1050,
  "goalWidth": 90
}
```

**注意**: pitchHeight 必须是偶数，因为半场计算依赖整除。测试范围：width 120-680，height 600-1050，goalWidth 默认 90。

---

## 球员位置类型

`GK`, `CB`, `LB`, `RB`, `CM`, `LM`, `RM`, `ST`

---

## 11种动作（Action）

| 动作 | 类型 | 说明 |
|------|------|------|
| `shoot` | 球类 | 射门 |
| `throughBall` | 球类 | 直塞 |
| `pass` | 球类 | 传球 |
| `cross` | 球类 | 传中 |
| `cleared` | 球类 | 解围 |
| `boot` | 球类 | 大脚开出 |
| `penalty` | 球类 | 点球（系统自动设置） |
| `tackle` | 移动 | 抢断 |
| `slide` | 移动 | 滑铲 |
| `intercept` | 移动 | 拦截 |
| `run` | 移动 | 跑动 |
| `sprint` | 移动 | 冲刺 |

---

## 球员技能（10项）

| 技能 | 说明 | 取值范围 |
|------|------|----------|
| `passing` | 传球精度 | 0-100 |
| `shooting` | 射门精度 | 0-100 |
| `tackling` | 抢断能力 | 0-100 |
| `saving` | 扑救能力（门将） | 0-100 |
| `agility` | 敏捷 | 0-100 |
| `strength` | 力量（影响踢球威力） | 0-100 |
| `penalty_taking` | 点球 | 0-100 |
| `perception` | 感知（争顶判断） | 0-100 |
| `jumping` | 弹跳（厘米，可超100） | 任意 |
| `control` | 控球 | 0-100 |

---

## 球员初始站位约定

- 两支队伍都按"面向屏幕下方"（攻下方球门）给出初始位置
- `currentPOS[1]`（纵向坐标）不应超过 pitchHeight 的一半
- `initiateGame()` 会自动将其中一队翻转到对面半场
- pitchHeight=0 是上方底线，pitchHeight=max 是下方底线

---

## 球员 action 外部覆盖

每轮迭代之间可以手动修改任意球员的 `action` 字段来干预 AI 决策：
- 设为 `"none"` → 引擎自动决策
- 设为一个有效动作名 → 引擎使用该动作
- 设为一个无效值 → 抛出异常
- 持球类动作要求球员必须持球，否则被替换为 `run`

**这使得在 React 前端实现玩家操控成为可能。**

---

## V5.0 新特性

- **3D 球轨迹**: 球有 z 轴（高度），抛物线轨迹（`getBallTrajectory`）
- **球飞行过程**: `ballOverIterations` 数组存储飞行路径，球在多个迭代中持续移动
- **身高+弹跳**: `height`（厘米）和 `skill.jumping` 影响能否够到高球
- **身体部位检测**: 记录触球身体部位，影响力量修正（头球×0.7，凌空×0.9）
- **折射/偏转**: 飞行中的球可被中途截断偏转
- **手球**: 根据球高度和球员身体比例判定
- **每回合仅一次球类动作**: 即使多名球员合法持球，也只随机选一个执行
- **踢球威力**: 与 `strength` 挂钩，按 pitchHeight 缩放

---

## 球运动类型映射

| 类型 | maxLoftPercent（最大飞行高度占比） |
|------|-----------------------------------|
| `pass` | 1% |
| `through` | 2% |
| `shot` | 4% |
| `cross` | 8% |
| `kick`（解围/大脚） | 12% |

---

## 典型比赛流程

```
initiateGame(team1, team2, pitch)
  → playIteration × N（上半场）
  → startSecondHalf
  → playIteration × N（下半场）
  → 结束（从 matchDetails 读取比分和统计）
```

---

## 在这个 React 项目中使用时的注意事项

1. **CommonJS 模块** — 这个包使用 `require()`/`module.exports`。项目是 ESM（`"type": "module"`）。Vite 通常能处理 CJS→ESM 转换，但注意导入方式。

2. **console.log 污染** — `engine.js` 第89行每次迭代打印完整 matchDetails JSON，生产环境必须移除或条件化。

3. **所有 API 都是 async** — 尽管内部无 await，都返回 Promise。

4. **无 TypeScript 类型定义** — 需自行编写 `.d.ts`。

5. **比赛长度自由** — 无内置时间概念，由调用方管理迭代计数。

6. **球员必须有11人** — `validate.js` 强制要求每队恰好11名球员。

7. **pitchHeight 必须是偶数** — 因为大量半场计算使用整除。

8. **`fs.readFile` 依赖** — 仅在 `common.js` 的 `readFile` 工具函数中存在，核心引擎逻辑不需要文件系统。
