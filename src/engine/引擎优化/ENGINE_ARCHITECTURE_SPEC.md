# FM风格引擎改造 — 架构设计规范

> **项目**: career-sim-react 比赛引擎优化
> **文档类型**: 架构设计规范 (Architecture Specification)
> **创建日期**: 2026-08-11
> **状态**: Draft — 待审批后拆分为实现任务

---

## 目录

1. [概述与目标](#1-概述与目标)
2. [现状分析](#2-现状分析)
3. [模块一：12位置完整差异化](#3-模块一12位置完整差异化)
4. [模块二：FM级别换人系统](#4-模块二fm级别换人系统)
5. [模块三：动态阵型引擎](#5-模块三动态阵型引擎)
6. [模块四：三层AI架构](#6-模块四三层ai架构)
7. [数据流与接口约定](#7-数据流与接口约定)
8. [分阶段实施计划](#8-分阶段实施计划)

---

## 1. 概述与目标

### 1.1 总体目标

在现有 `footballsimulationengine` v5.0.0 基础上，将比赛引擎从"基本可用的足球模拟"升级到"接近FM系列深度的战术模拟"。改造涵盖四个核心模块，按依赖关系分阶段实施。

### 1.2 核心设计原则

- **引擎内聚，外观解耦**：核心引擎改造在 `engine/lib/` 内完成，新增 `engine/lib/formation.js` 和 `engine/lib/tactics.js` 模块负责阵型和战术逻辑。`matchEngine.js` 外观层仅做数据适配和React集成
- **渐进增强，不破坏现有逻辑**：所有改造通过"新增模块+最小侵入修改"实现。已有API（`initiateGame`, `playIteration`）保持兼容
- **每队严格11人，换人在迭代间完成**：遵守引擎的硬约束
- **Position定域是阵型的基础**：FM的核心思想——位置决定活动范围，阵型决定位置坐标，角色(Role)决定行为偏好

### 1.3 关键架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| originPOS管理 | 新模块 `formation.js` 集中管理 | 解耦位置与引擎逻辑 |
| 动作权重系统 | 基于位置分组(PositionGroup)的权重表 | 12个位置可归为6组减少重复 |
| 换人时机 | 迭代间同步替换 | 引擎不原生支持迭代中换人 |
| 新增位置处理 | 扩展位置分组到所有引擎模块 | CDM/CAM/LW/RW需要全模块感知 |
| AI架构 | Team → PositionGroup → Player 三层 | FM的 Style → Role → Individual 映射 |

---

## 2. 现状分析

### 2.1 引擎架构概览

```
engine.js
├── initiateGame()       — 初始化，设置originPOS
├── playIteration()      — 单次模拟迭代
│   ├── moveBall()       — 球物理
│   ├── decideMovement() — 球员AI决策
│   │   └── findPossActions() → selectAction()
│   ├── movePlayers()    — 移动执行
│   ├── executeBallAction() — 球事件
│   └── checkOffside()   — 越位检查
└── startSecondHalf()    — 下半场切换

lib/
├── actions.js           — 动作权重表 (核心改造点)
├── ballMovement.js      — 球的物理
├── playerMovement.js    — 球员移动和AI
├── setPositions.js      — 定位球位置 (核心改造点)
├── setFreekicks.js      — 任意球定位 (核心改造点)
├── setVariables.js      — 比赛状态初始化
├── common.js            — 工具函数
└── validate.js          — 输入校验
```

### 2.2 位置处理现状

| 文件 | 原生支持 | CDM/CAM/LW/RW 处理情况 |
|------|---------|----------------------|
| `actions.js` | GK, CB, LB, RB, CM, LM, RM, ST | 部分支持：在 `topTeamPlayerHasBall`, `bottomTeamPlayerHasBall` 等函数中有 `=== 'CDM'/'CAM'/'LW'/'RW'` 分支 |
| `setPositions.js` | 同上8个 | **无特殊处理**：定位球站位(`keepInBoundaries`, `setPlayerPositions`, 角球/界外球等)只用通用分组(`['CB','LB','RB']` / `['CM','LM','RM']`) |
| `setFreekicks.js` | 同上8个 | **完全缺失**：任意球站位硬编码引用 `['CB','LB','RB']` / `['CM','LM','RM']`，CDM/CAM/LW/RW不会被正确分配 |
| `validate.js` | 同上8个 | **不支持**：校验逻辑不识别CDM/CAM/LW/RW |
| `playerMovement.js` | 不区分位置 | 仅通过originPOS判断进攻方向(`> pitchHeight/2`)，不依赖位置字符串 |

### 2.3 阵型系统现状

- `POSITION_PLACES` (matchEngine.js) — 12个位置的静态坐标表，通过`_placementFor()`映射为originPOS
- `PAIRED_OFFSET_X` — 双位置(CB×2, CM×2, ST×2, CDM×2)的X偏移
- **问题**：阵型变化不改变originPOS。4-3-3和4-4-2中的CM具有相同的originPOS坐标
- 战术面板(Frontend)的阵型视觉坐标与引擎实际使用的坐标**完全独立**

### 2.4 换人系统现状

- `applySubstitution()` (matchEngine.js) 在迭代间交换球员
- 替补球员的originPOS由 `_placementFor()` 静态生成，**不受阵型影响**
- 替补席固定5人，位置池为 `[GK, CB, CM, LM, ST]`
- **问题**：CDM替补上场后的originPOS是CDM的通用坐标，而非当前阵型中CDM应处的位置

---

## 3. 模块一：12位置完整差异化

### 3.1 位置分组体系 (PositionGroup)

将12个位置归为6个战术分组，引擎内部逻辑按分组处理，动作权重按具体位置精细调节：

| 分组 | 成员 | 战术角色 | 定位球角色 |
|------|------|---------|-----------|
| **GK** | GK | 守门员 | 守门员 |
| **FB** (Full Back) | LB, RB | 边后卫 | 防守球员 — 边路 |
| **CB** | CB | 中后卫 | 防守球员 — 中路 |
| **DM** (Defensive Mid) | CDM | 防守中场 | 防守中场 |
| **CM** (Central Mid) | CM, CAM | 中场组织 | 中场 — CAM更靠前 |
| **WM** (Wide Mid) | LM, RM, LW, RW | 边路球员 | 中场/前锋 — LW/RW比LM/RM更靠前 |

### 3.2 引擎改造清单

#### 3.2.1 `engine/lib/validate.js` — 校验扩展

```javascript
// 当前: 校验8个位置
// 改造: 扩展到12个位置

const VALID_POSITIONS = [
  'GK', 'CB', 'LB', 'RB',  // 后防线 (4)
  'CDM',                      // 防守中场 (1)
  'CM', 'CAM',                // 组织中场 (2)
  'LM', 'RM', 'LW', 'RW',    // 边路 (4)
  'ST'                        // 前锋 (1)
];
```

#### 3.2.2 `engine/lib/actions.js` — 动作权重扩展

**现有代码分析**：4个新位置(CDM/CAM/LW/RW)已在持球动作函数中有分支，但在以下函数中缺失：

- `playerDoesNotHaveBall()` — 仅使用GK vs 非GK二分法，不区分位置
- `noBallNotGK2CloseBall()` 和 `noBallNotGK4CloseBall()` — 无位置区分
- 禁区附近的动作权重不支持新位置

**改造方案**：新增位置分组辅助函数 + 补全缺失分支

```javascript
// 新增: 位置分组判断工具
function getPositionGroup(position) {
  if (position === 'GK') return 'GK';
  if (['CB'].includes(position)) return 'CB';
  if (['LB', 'RB'].includes(position)) return 'FB';
  if (['CDM'].includes(position)) return 'DM';
  if (['CM', 'CAM'].includes(position)) return 'CM';
  if (['LM', 'RM'].includes(position)) return 'WM';
  if (['LW', 'RW'].includes(position)) return 'WG'; // Wingers
  if (['ST'].includes(position)) return 'ST';
  return 'CM';
}

function isDefensivePosition(position) {
  return ['GK', 'CB', 'LB', 'RB', 'CDM'].includes(position);
}

function isAttackingPosition(position) {
  return ['ST', 'LW', 'RW', 'CAM'].includes(position);
}

function isWidePosition(position) {
  return ['LB', 'RB', 'LM', 'RM', 'LW', 'RW'].includes(position);
}
```

**动作权重差异化策略**：

| 位置 | 射门 | 直塞 | 传球 | 传中 | 盘带 | 抢断 | 跑动冲刺 |
|------|------|------|------|------|------|------|---------|
| CDM | 很低 | 低 | 高 | 低 | 低 | 高 | 中 |
| CAM | 高 | 很高 | 高 | 中 | 高 | 很低 | 中 |
| LW/RW | 高 | 中 | 中 | 很高 | 很高 | 很低 | 很高 |
| ST | 很高 | 低 | 低 | 低 | 中 | 很低 | 很高 |

#### 3.2.3 `engine/lib/setFreekicks.js` — 任意球站位改造

**核心问题**：现有代码硬编码位置数组 `['CB', 'LB', 'RB']`, `['CM', 'LM', 'RM']`, `['GK']`，不包含新增4个位置。

**改造方案**：将所有位置分类引用替换为分组函数调用

```javascript
// 替换模式:
// 旧: if (['CB', 'LB', 'RB'].includes(player.position))
// 新: if (getPositionGroup(player.position) === 'CB' 
//      || getPositionGroup(player.position) === 'FB')

// 旧: if (['CM', 'LM', 'RM'].includes(player.position))
// 新: if (['CM', 'WM'].includes(getPositionGroup(player.position)))
```

需要修改的函数列表 (~20处)：
- `setTopOneHundredYPos` — 进攻/防守球员分配
- `setBottomOneHundredYPos` — 同上
- `setTopOneHundredToHalfwayYPos` — 同上
- `setBottomOneHundredToHalfwayYPos` — 同上
- `setTopHalfwayToBottomQtrYPos` — 同上
- `setBottomHalfwayToTopQtrYPos` — 同上
- `setTopBottomQtrCentreYPos` — 同上
- `setBottomUpperQtrCentreYPos` — 同上
- `setTopLowerFinalQtrBylinePos` — 同上
- `setBottomLowerFinalQtrBylinePos` — 同上

**站位分配规则**：

| 任意球位置 | 防守方CDM | 防守方CAM | 防守方LW/RW | 进攻方CDM | 进攻方CAM | 进攻方LW/RW |
|-----------|----------|----------|------------|----------|----------|------------|
| 禁区附近 (lowerFinalQtr) | 同CB/边卫，参与人墙 | 随机禁区站位 | 随机禁区站位 | 随机禁区站位 | 随机禁区站位 | 随机禁区站位 |
| 靠近禁区 (upperFinalQtr) | 同CB/边卫 | 同CM/LM/RM | 同ST/前锋位 | 同CM/LM/RM | 同ST/前锋位 | 同ST/前锋位 |
| 中后场 | 与防线同列 | 与中场同列 | 与中场同列 | 位置不变 | 位置不变 | 位置不变 |

#### 3.2.4 `engine/lib/setPositions.js` — 定位球全站位改造

类似于 setFreekicks，将角球、界外球、球门球的位置分组引用替换为分组函数。

#### 3.2.5 移动和intentPOS增强

在 `setIntentPosition()`, `setDefenceRelativePos()`, `setAttackRelativePos()`, `setLooseintentPOS()` 中引入位置分组意识：

- 防守球员(CB/FB/DM)的回退距离更大
- 边路球员(LB/RB/LM/RM/LW/RW)的X方向移动权重更高
- 进攻球员(ST/CAM/LW/RW)的Y方向前插幅度更大

---

## 4. 模块二：FM级别换人系统

### 4.1 设计目标

- 支持比赛进行中暂停换人（已有UI基础）
- 替换后的替补球员**继承被换下球员的originPOS**（保持阵型）
- 支持赛中**阵型切换联动换人**（换人+变阵二合一）
- 替补席从5人扩展到7人，支持位置多样化的替补席
- **合理换人规则**：最多3次换人窗口 + 中场休息，最多5人

### 4.2 数据模型変更

```javascript
// 替补球员数据扩展
const SUB_POSITION_POOL_V2 = [
  'GK',   // 1x 替补门将
  'CB',   // 1x 替补中卫
  'LB',   // 1x 边后卫 (可打两边)
  'CM',   // 1x 替补中场
  'LM',   // 1x 边前卫/边锋 (多功能)
  'ST',   // 1x 替补前锋
  'CAM',  // 1x 前腰/多功能进攻球员
];
```

### 4.3 换人逻辑改造

```javascript
// matchEngine.js 中的改造
export function applySubstitutionV2(matchDetails, teamKey, playerOutID, playerIn, formation) {
  const team = matchDetails[teamKey];
  const idx = team.players.findIndex((p) => p.playerID === playerOutID);
  if (idx === -1) return matchDetails;

  // 1. 获取被换下球员的 originPOS
  const outPlayer = team.players[idx];
  const inheritedOriginPOS = [...outPlayer.originPOS];
  
  // 2. 如果同时变阵，重新计算所有球员的 originPOS
  let newOriginPOS = inheritedOriginPOS;
  if (formation) {
    const formationPositions = computeFormationPositions(formation);
    // 找到替补球员位置对应的新originPOS
    const posKey = playerIn.position; // e.g. 'CDM'
    newOriginPOS = formationPositions[posKey] || inheritedOriginPOS;
  }
  
  // 3. 构建替补球员，使用继承的originPOS
  const subPlayer = buildPlayerJson({...playerIn, _originOverride: newOriginPOS});
  team.players[idx] = subPlayer;
  
  // 4. 记录换人事件
  matchDetails.iterationLog.push(
    `Substitution: ${playerIn.name} (${playerIn.position}) replaces ${outPlayer.name}`
  );
  
  return matchDetails;
}
```

### 4.4 赛中变阵的originPOS更新

当玩家在暂停期间切换阵型（如从4-4-2变为4-3-3），执行：

```javascript
export function applyFormationChange(matchDetails, newFormation) {
  // 1. 根据新阵型计算每个位置的 originPOS
  const formationMap = formationEngine.getFormationPositions(newFormation);
  
  // 2. 对场上所有球员，重新分配 originPOS 和 intentPOS
  for (const teamKey of ['kickOffTeam', 'secondTeam']) {
    for (const player of matchDetails[teamKey].players) {
      const pos = player.position;
      const newPos = formationMap[pos] || player.originPOS;
      player.originPOS = newPos;
      player.intentPOS = newPos.map(x => x); // 重置意图位置
    }
  }
  
  matchDetails._homeFormation = newFormation;
  return matchDetails;
}
```

### 4.5 换人规则实现

```javascript
const SUBSTITUTION_RULES = {
  maxWindows: 3,     // 最多3次换人窗口(不含中场休息)
  maxPlayers: 5,     // 最多换5人
  halfTimeBonus: true, // 中场换人不计入窗口
};

function canSubstitute(matchState, isHalfTime) {
  if (!isHalfTime && matchState.subWindowsUsed >= SUBSTITUTION_RULES.maxWindows) {
    return { allowed: false, reason: '换人次数已用完' };
  }
  if (matchState.subsUsed >= SUBSTITUTION_RULES.maxPlayers) {
    return { allowed: false, reason: '换人名额已用完' };
  }
  return { allowed: true };
}
```

---

## 5. 模块三：动态阵型引擎

### 5.1 设计目标

- **新增 `engine/lib/formation.js`** — 阵型的唯一真理源
- 支持 **10+种标准阵型**，每种提供精确的11个位置坐标
- 提供 **`computeFormationPositions(formationName, pitchSize)`** — 返回11个位置的 [x, y] 映射
- 支持 **进攻/防守状态下坐标的微调** — 基于FM的阵型流动性(Fluid)概念
- 阵型数据被**matchEngine.js和引擎核心共用**，消除前后端坐标不一致

### 5.2 阵型坐标系统

基于 `pitchWidth=680, pitchHeight=1050` 的球场坐标系：

```javascript
// engine/lib/formation.js

/**
 * Formation definitions — the single source of truth for position coordinates.
 * Each formation maps position → { x, y, role } for all 11 outfield slots.
 *
 * Coordinates are in pitch units (x: 0-680, y: 0-1050).
 * Home team attacks UP (y decreasing), Away team attacks DOWN (y increasing).
 *
 * Y-coordinate philosophy:
 *   0-100:    GK area
 *   100-200:  Defensive line
 *   200-350:  Defensive midfield / deep midfield
 *   350-500:  Central midfield
 *   500-650:  Attacking midfield / wingers
 *   650-850:  Forward line
 *   850-1050: Opposition GK area (striker pressing)
 */

const FORMATION_MATRIX = {
  // ===== 4-4-2 =====
  '4-4-2': {
    GK:  { x: 340, y: 50 },
    LB:  { x: 80,  y: 150 },
    CBL: { x: 240, y: 150 },
    CBR: { x: 440, y: 150 },
    RB:  { x: 600, y: 150 },
    LM:  { x: 80,  y: 350 },
    CML: { x: 240, y: 350 },
    CMR: { x: 440, y: 350 },
    RM:  { x: 600, y: 350 },
    STL: { x: 280, y: 600 },
    STR: { x: 400, y: 600 },
  },
  
  // ===== 4-3-3 =====
  '4-3-3': {
    GK:  { x: 340, y: 50 },
    LB:  { x: 80,  y: 150 },
    CBL: { x: 240, y: 150 },
    CBR: { x: 440, y: 150 },
    RB:  { x: 600, y: 150 },
    CML: { x: 200, y: 380 },
    CM:  { x: 340, y: 360 },  
    CMR: { x: 480, y: 380 },
    LW:  { x: 140, y: 650 },
    ST:  { x: 340, y: 680 },
    RW:  { x: 540, y: 650 },
  },

  // ===== 4-2-3-1 =====
  '4-2-3-1': {
    GK:  { x: 340, y: 50 },
    LB:  { x: 80,  y: 150 },
    CBL: { x: 240, y: 150 },
    CBR: { x: 440, y: 150 },
    RB:  { x: 600, y: 150 },
    CDML:{ x: 280, y: 280 },
    CDMR:{ x: 400, y: 280 },
    RM:  { x: 120, y: 480 },
    CAM: { x: 340, y: 460 },
    LM:  { x: 560, y: 480 },
    ST:  { x: 340, y: 680 },
  },

  // ===== 3-5-2 =====
  '3-5-2': {
    GK:  { x: 340, y: 50 },
    CBL: { x: 180, y: 150 },
    CB:  { x: 340, y: 130 },
    CBR: { x: 500, y: 150 },
    RM:  { x: 40,  y: 340 },
    CML: { x: 220, y: 340 },
    CM:  { x: 340, y: 320 },
    CMR: { x: 460, y: 340 },
    LM:  { x: 640, y: 340 },
    STL: { x: 280, y: 600 },
    STR: { x: 400, y: 600 },
  },

  // ===== 5-3-2 =====
  '5-3-2': {
    GK:  { x: 340, y: 50 },
    LWB: { x: 40,  y: 150 },
    CBL: { x: 180, y: 130 },
    CB:  { x: 340, y: 120 },
    CBR: { x: 500, y: 130 },
    RWB: { x: 640, y: 150 },
    CML: { x: 200, y: 360 },
    CM:  { x: 340, y: 340 },
    CMR: { x: 480, y: 360 },
    STL: { x: 280, y: 600 },
    STR: { x: 400, y: 600 },
  },

  // ===== 新增阵型 =====
  
  // 4-1-4-1: 防守反击经典
  '4-1-4-1': {
    GK:  { x: 340, y: 50 },
    LB:  { x: 80,  y: 150 },
    CBL: { x: 240, y: 150 },
    CBR: { x: 440, y: 150 },
    RB:  { x: 600, y: 150 },
    CDM: { x: 340, y: 280 },  // 单后腰
    LM:  { x: 80,  y: 420 },
    CML: { x: 240, y: 420 },
    CMR: { x: 440, y: 420 },
    RM:  { x: 600, y: 420 },
    ST:  { x: 340, y: 680 },
  },

  // 3-4-3: 全攻全守
  '3-4-3': {
    GK:  { x: 340, y: 50 },
    CBL: { x: 160, y: 150 },
    CB:  { x: 340, y: 130 },
    CBR: { x: 520, y: 150 },
    LM:  { x: 60,  y: 340 },
    CML: { x: 240, y: 360 },
    CMR: { x: 440, y: 360 },
    RM:  { x: 620, y: 340 },
    LW:  { x: 120, y: 620 },
    ST:  { x: 340, y: 660 },
    RW:  { x: 560, y: 620 },
  },

  // 4-4-1-1: 影锋战术
  '4-4-1-1': {
    GK:  { x: 340, y: 50 },
    LB:  { x: 80,  y: 150 },
    CBL: { x: 240, y: 150 },
    CBR: { x: 440, y: 150 },
    RB:  { x: 600, y: 150 },
    LM:  { x: 80,  y: 350 },
    CML: { x: 240, y: 350 },
    CMR: { x: 440, y: 350 },
    RM:  { x: 600, y: 350 },
    CAM: { x: 340, y: 520 },  // 影锋
    ST:  { x: 340, y: 680 },
  },
};
```

### 5.3 阵型API

```javascript
// engine/lib/formation.js

/**
 * Get [x, y] originPOS for every position in the formation.
 *
 * @param {string} formation — formation key (e.g. '4-3-3')
 * @param {object} [pitchSize] — { pitchWidth, pitchHeight }
 * @param {string} [mentality] — 'attack'|'balanced'|'defend' (adjusts line depth)
 * @returns {object} { GK: [x,y], CB: [x,y], ... } (11+ entries)
 */
export function getFormationPositions(formation, pitchSize, mentality) {
  const [pw, ph] = pitchSize ? [pitchSize.pitchWidth, pitchSize.pitchHeight] : [680, 1050];
  const matrix = FORMATION_MATRIX[formation] || FORMATION_MATRIX['4-4-2'];
  
  // Apply mentality-based line adjustments
  const depthMod = mentality === 'ultra_attack' ? 1.15 
    : mentality === 'attack' ? 1.07
    : mentality === 'defend' ? 0.93
    : mentality === 'ultra_defend' ? 0.85
    : 1.0;
  
  const positions = {};
  for (const [slot, coord] of Object.entries(matrix)) {
    // slot e.g. "CBL", "CBR" → position key e.g. "CB"
    const posKey = slot.replace(/[LR\d]$/, ''); // strip L/R/number suffix
    const adjustedY = Math.round(coord.y * depthMod);
    positions[posKey] = [coord.x, adjustedY];
  }
  
  return positions;
}

/**
 * Compute originPOS array for a squad's starters based on the formation.
 * Handles paired positions (CB×2, CM×2, etc.) with alternating x-coordinates.
 *
 * @param {Array} starters — array of { position, ... }
 * @param {string} formation — formation key
 * @param {object} [pitchSize]
 * @returns {Array<[number, number]>} originPOS array matching starter order
 */
export function computeOriginPOSForStarters(starters, formation, pitchSize) {
  const matrix = FORMATION_MATRIX[formation] || FORMATION_MATRIX['4-4-2'];
  const slots = Object.values(matrix);
  
  // Group slots by position type for L/R alternation
  const posSlots = {};
  for (let i = 0; i < slots.length; i++) {
    const slotKey = Object.keys(matrix)[i];
    const posKey = slotKey.replace(/[LR\d]$/, '');
    if (!posSlots[posKey]) posSlots[posKey] = [];
    posSlots[posKey].push(slots[i]);
  }
  
  // Assign originPOS to each starter
  const originPOSArray = [];
  const slotUsage = {}; // track which slot we're on per position
  
  for (const starter of starters) {
    const pos = starter.position;
    const available = posSlots[pos] || posSlots['CM']; // fallback
    const idx = slotUsage[pos] || 0;
    const slot = available[idx % available.length];
    slotUsage[pos] = (idx + 1);
    originPOSArray.push([slot.x, slot.y]);
  }
  
  return originPOSArray;
}

/**
 * Get the adjusted position when mentality affects defensive line depth.
 * FM concept: deeper defensive line in 'defend' mentality, higher in 'attack'.
 */
export function getAdjustedLineY(baseY, mentality, pitchHeight) {
  const depthFactor = mentalityToDepthFactor(mentality);
  // Defensive mentality: defensive players sit deeper
  if (baseY < pitchHeight * 0.3) {
    // Defensive third: compress toward goal
    return Math.max(0, baseY * (1 - (1 - depthFactor) * 0.3));
  }
  if (baseY > pitchHeight * 0.6) {
    // Attacking third: push forward
    return Math.min(pitchHeight, baseY * (1 + (depthFactor - 1) * 0.3));
  }
  return baseY;
}
```

---

## 6. 模块四：三层AI架构

### 6.1 FM映射到引擎实现

| FM层 | 引擎实现 | 影响范围 |
|------|---------|---------|
| **Layer 1: Team Style** | `teamStrategy` 对象（集成为 `team.intent` 的增强版） | 全队攻防节奏、阵型流动性、压迫强度 |
| **Layer 2: Role** | `positionRole` 对象（每个位置的 Action 权重 + 移动行为） | 单个球员的动作选择、位置偏移容忍度 |
| **Layer 3: Individual** | `playerTraits` 对象 + 现有 `player.skill` / `player.action` 字段 | 习惯动作覆盖、特定技能的权重加成 |

### 6.2 Layer 1 — Team Style（球队策略）

新建 `engine/lib/tactics.js`：

```javascript
/**
 * Team Strategy — the container for team-level tactical instructions.
 * Maps to FM's Team Instructions + Style.
 */
const TeamStrategy = {
  mentality: 'balanced',       // ultra_defend | defend | balanced | attack | ultra_attack
  tempo: 'normal',             // slow | normal | fast | very_fast
  pressing: 'balanced',        // low | balanced | high | extreme
  defensiveLine: 'normal',     // deep | normal | high
  width: 'balanced',           // narrow | balanced | wide
  passingStyle: 'mixed',       // short | mixed | direct | long
  fluidity: 'structured',      // very_structured | structured | flexible | fluid | very_fluid
  creativeFreedom: 'normal',   // low | normal | high
};

/**
 * Apply team strategy to all players' behavior parameters.
 * This runs once before match start and on formation/strategy changes.
 *
 * Effect on engine:
 * - mentality → skill modifiers (existing: applyMentalityToTeam)
 * - tempo → risk tolerance in Action selection
 * - pressing → defensive intentPOS bias toward ball
 * - width → X-coordinate spread in formation positions
 * - fluidity → tolerance for players leaving originPOS zone (formationCheck looseness)
 */
export function applyTeamStrategy(team, strategy, pitchSize) {
  // 1. Mentality → skill modifiers (existing logic)
  applyMentalityModifiers(team, strategy.mentality);
  
  // 2. Pressing → defensive aggression (new)
  applyPressingModifiers(team, strategy.pressing, pitchSize);
  
  // 3. Tempo → action risk profile (new)
  applyTempoModifiers(team, strategy.tempo);
  
  // 4. Width → formation X spread (new)
  applyWidthModifiers(team, strategy.width, pitchSize);
  
  // 5. Fluidity → position discipline (new)
  team._fluidityFactor = fluidityToFactor(strategy.fluidity);
  
  return team;
}
```

### 6.3 Layer 2 — Role（球员角色）

**核心思想**：每个位置有多个可选角色，角色影响Action权重和移动行为：

```javascript
/**
 * Player Roles — FM-style position-specific role definitions.
 *
 * Each role defines:
 * - actionProfile: modifies the base position action weights
 * - movementBias: influences how the player moves relative to formation
 * - zoneTolerance: how far from originPOS the player can roam
 */

const POSITION_ROLES = {
  // ===== Defenders =====
  GK: {
    'goalkeeper_defend': {
      actionProfile: { rush: 1.0, distribute: 0.8, sweep: 0.5 },
    },
    'sweeper_keeper': {
      actionProfile: { rush: 2.0, distribute: 1.5, sweep: 2.5 },
      movementBias: { y: 80 }, // pushes higher up
    },
  },
  
  CB: {
    'central_defender_defend': {
      actionProfile: { shoot: 0.1, pass: 1.0, tackle: 2.0, clear: 2.0 },
      zoneTolerance: 0.2, // stay tight to position
    },
    'ball_playing_defender': {
      actionProfile: { shoot: 0.2, pass: 2.0, dribble: 1.2, tackle: 1.5 },
      movementBias: { y: 40 }, // steps into midfield
      zoneTolerance: 0.4,
    },
    'libero_support': {
      actionProfile: { pass: 2.0, dribble: 1.5, shoot: 0.5, tackle: 1.5 },
      movementBias: { y: 120 }, // pushes into midfield
      zoneTolerance: 0.8, // free roaming when in possession
    },
  },
  
  LB: {
    'full_back_defend': {
      actionProfile: { cross: 0.8, pass: 1.2, tackle: 1.8, run: 0.6 },
      zoneTolerance: 0.3,
    },
    'full_back_attack': {
      actionProfile: { cross: 1.8, pass: 1.5, run: 1.5, tackle: 1.0 },
      movementBias: { y: 100 }, // overlaps into attacking third
      zoneTolerance: 0.6,
    },
    'wing_back_support': {
      actionProfile: { cross: 1.5, pass: 1.3, run: 1.8, tackle: 1.2 },
      movementBias: { y: 130, x: 30 }, // pushes wide and forward
      zoneTolerance: 0.5,
    },
    'inverted_wing_back': {
      actionProfile: { pass: 1.8, shoot: 0.8, cross: 0.3, run: 0.8 },
      movementBias: { x: -40 }, // drifts inside
      zoneTolerance: 0.5,
    },
  },
  
  // ===== Defensive Midfield =====
  CDM: {
    'defensive_midfielder_defend': {
      actionProfile: { tackle: 2.5, pass: 1.0, shoot: 0.1, run: 0.3 },
      movementBias: { y: -20 }, // sits deep
      zoneTolerance: 0.2,
    },
    'deep_lying_playmaker_support': {
      actionProfile: { pass: 3.0, throughBall: 1.5, tackle: 1.2, shoot: 0.3 },
      movementBias: { y: 30 },
      zoneTolerance: 0.4,
    },
    'anchor_man': {
      actionProfile: { tackle: 3.0, clear: 2.5, pass: 0.6, shoot: 0.05 },
      movementBias: { y: -40 }, // stays very deep between CBs
      zoneTolerance: 0.1,
    },
  },
  
  // ===== Central Midfield =====
  CM: {
    'central_midfielder_support': {
      actionProfile: { pass: 1.5, shoot: 0.8, tackle: 1.2, run: 1.0 },
      zoneTolerance: 0.4,
    },
    'box_to_box_midfielder': {
      actionProfile: { run: 2.5, tackle: 1.5, shoot: 1.2, pass: 1.2 },
      movementBias: { y: 200 }, // huge roaming range
      zoneTolerance: 0.9,
    },
    'advanced_playmaker_support': {
      actionProfile: { pass: 2.5, throughBall: 2.0, dribble: 1.5, shoot: 0.8 },
      movementBias: { y: 80 },
      zoneTolerance: 0.6,
    },
    'mezzala_attack': {
      actionProfile: { dribble: 2.0, shoot: 1.5, pass: 1.5, cross: 1.2 },
      movementBias: { y: 120, x: 60 }, // drifts wide and forward
      zoneTolerance: 0.7,
    },
    'carrilero': {
      actionProfile: { pass: 2.0, tackle: 1.5, run: 1.2 },
      movementBias: { x: 80 }, // stays wide in half-spaces
      zoneTolerance: 0.5,
    },
  },
  
  CAM: {
    'attacking_midfielder_attack': {
      actionProfile: { shoot: 1.8, pass: 1.5, throughBall: 2.0, dribble: 2.0 },
      movementBias: { y: 80 }, // pushes into the box
      zoneTolerance: 0.6,
    },
    'shadow_striker': {
      actionProfile: { shoot: 2.5, run: 2.0, pass: 0.8, tackle: 0.5 },
      movementBias: { y: 150 }, // plays almost as a second striker
      zoneTolerance: 0.5,
    },
    'enganche': {
      actionProfile: { pass: 3.0, throughBall: 2.5, shoot: 0.5, run: 0.2 },
      movementBias: { y: 10 }, // stays in the hole, doesn't run much
      zoneTolerance: 0.2,
    },
  },
  
  // ===== Wide Players =====
  LM: {
    'winger_support': {
      actionProfile: { cross: 2.0, dribble: 1.8, run: 1.5, pass: 1.0 },
      movementBias: { y: 100 },
      zoneTolerance: 0.5,
    },
    'wide_midfielder_support': {
      actionProfile: { pass: 1.8, cross: 1.2, tackle: 1.0, run: 1.0 },
      zoneTolerance: 0.4,
    },
    'defensive_winger': {
      actionProfile: { tackle: 1.8, cross: 1.2, run: 1.5, pass: 1.0 },
      zoneTolerance: 0.3,
    },
  },
  // RM inherits LM roles
  
  LW: {
    'inside_forward_attack': {
      actionProfile: { shoot: 2.2, dribble: 2.0, pass: 1.0, cross: 0.3 },
      movementBias: { x: -80, y: 100 }, // cuts inside toward goal
      zoneTolerance: 0.6,
    },
    'winger_attack': {
      actionProfile: { cross: 2.5, dribble: 2.0, run: 1.8, shoot: 0.5 },
      movementBias: { x: -40, y: 120 }, // stays wider
      zoneTolerance: 0.5,
    },
    'raumdeuter': {
      actionProfile: { shoot: 2.0, run: 2.5, pass: 0.8, cross: 0.2, dribble: 1.0 },
      movementBias: { x: -60, y: 100 }, // finds space in the box
      zoneTolerance: 0.8, // roams freely to find space
    },
  },
  // RW inherits LW roles (mirrored)
  
  // ===== Strikers =====
  ST: {
    'advanced_forward_attack': {
      actionProfile: { shoot: 2.5, run: 2.0, pass: 0.5, dribble: 1.5 },
      movementBias: { y: 120 }, // plays on the shoulder
      zoneTolerance: 0.5,
    },
    'target_man_support': {
      actionProfile: { pass: 1.5, shoot: 1.2, hold: 2.0, head: 3.0 },
      movementBias: { y: 20 }, // stays central, receives ball
      zoneTolerance: 0.3,
    },
    'poacher': {
      actionProfile: { shoot: 3.0, run: 1.5, pass: 0.2, dribble: 0.5 },
      movementBias: { y: 30 }, // stays in the box
      zoneTolerance: 0.2,
    },
    'deep_lying_forward_support': {
      actionProfile: { pass: 2.0, throughBall: 1.5, shoot: 1.2, dribble: 1.5 },
      movementBias: { y: -40 }, // drops deep
      zoneTolerance: 0.6,
    },
    'complete_forward_attack': {
      actionProfile: { shoot: 2.0, pass: 1.5, dribble: 1.8, run: 1.8, head: 2.0 },
      movementBias: { y: 100 },
      zoneTolerance: 0.7, // does everything
    },
  },
};

/**
 * Apply a role to a player's action profile.
 *
 * The role modifies the base position action weights multiplicatively.
 * For example, a Box-to-Box Midfielder gets 2.5× run weight vs a standard CM.
 *
 * This runs in selectAction phase — the agent score is multiplied by the
 * role's actionProfile modifier for the chosen action.
 */
export function getRoleModifier(action, position, role) {
  const roles = POSITION_ROLES[position] || {};
  const roleDef = roles[role] || {};
  return roleDef.actionProfile?.[action] || 1.0;
}

/**
 * Get the movement bias for a player based on their role.
 * Movement bias shifts the player's effective intentPOS by [dx, dy] pixels,
 * making them naturally drift in their role-specific direction.
 */
export function getRoleMovementBias(position, role) {
  const roles = POSITION_ROLES[position] || {};
  const roleDef = roles[role] || {};
  return roleDef.movementBias || { x: 0, y: 0 };
}

/**
 * Get the zone tolerance for a player's role.
 * Multiplied by fluidityFactor, determines how far a player can stray from
 * their originPOS before formationCheck pulls them back.
 */
export function getRoleZoneTolerance(position, role) {
  const roles = POSITION_ROLES[position] || {};
  const roleDef = roles[role] || {};
  return roleDef.zoneTolerance || 0.4;
}
```

### 6.4 Layer 3 — Individual（个人习惯/特质）

```javascript
/**
 * Player Traits — individual playing habits that override AI decisions.
 * Each trait has a % chance to override the normal action selection.
 */

const PLAYER_TRAITS = {
  // Shooting traits
  'shoots_from_distance': { action: 'shoot', overrideChance: 0.25, condition: 'outside_box' },
  'places_shots':       { action: 'shoot', modifier: { accuracy: 1.15, power: 0.9 } },
  'tries_first_time_shots': { action: 'shoot', overrideChance: 0.20, condition: 'in_box' },
  
  // Passing traits
  'tries_killer_balls':     { action: 'throughBall', overrideChance: 0.30 },
  'plays_short_simple_passes': { action: 'pass', modifier: { range: 0.6 } },
  'tries_long_range_passes': { action: 'pass', modifier: { range: 1.5 } },
  'dictates_tempo':         { teamEffect: { tempoBias: 1.2 } },
  
  // Movement traits
  'gets_forward_whenever_possible': { action: 'sprint', overrideChance: 0.35 },
  'stays_back_at_all_times': { action: 'run', overrideChance: 0.40, condition: 'ball_in_own_half' },
  'hugs_line':              { movementBias: { x: 60 } },
  'cuts_inside':            { movementBias: { x: -60 } },
  'comes_deep_to_get_ball': { movementBias: { y: -80 } },
  'beats_offside_trap':     { movementBias: { y: 60 }, condition: 'ball_in_final_third' },
  'arrives_late_in_opposition_area': { action: 'sprint', overrideChance: 0.25, condition: 'attacking_third' },
  
  // Defensive traits
  'dives_into_tackles':     { action: 'slide', overrideChance: 0.30 },
  'marks_opponent_tightly': { action: 'tackle', overrideChance: 0.25 },
  'does_not_dive_into_tackles': { action: 'slide', overrideChance: -0.20 }, // negative = reduces chance
  
  // Technical traits
  'tries_tricks':           { action: 'sprint', modifier: { dribbleBoost: 1.5 } },
  'knocks_ball_past_opponent': { action: 'sprint', overrideChance: 0.20, condition: 'opponent_near' },
  'runs_with_ball_often':   { action: 'run', overrideChance: 0.30 },
  'runs_with_ball_rarely':  { action: 'run', overrideChance: -0.20 },
};

/**
 * Evaluate whether a trait should fire this iteration.
 * Each trait has an independent check per player per iteration.
 */
export function evaluateTraitOverride(player, trait, matchContext) {
  const traitDef = PLAYER_TRAITS[trait];
  if (!traitDef) return null;
  
  const roll = Math.random();
  let chance = Math.abs(traitDef.overrideChance);
  
  // Check conditions
  if (traitDef.condition) {
    if (!evaluateCondition(traitDef.condition, player, matchContext)) return null;
  }
  
  if (roll < chance) {
    return {
      action: traitDef.action,
      modifier: traitDef.modifier || {},
      movementBias: traitDef.movementBias || null,
    };
  }
  
  return null;
}
```

### 6.5 三层AI在引擎中的集成点

当前引擎的AI流程：

```
decideMovement() {
  for each player:
    findPossActions()       // Layer 3: 获取11项动作的基础权重
    selectAction()          // Layer 2: 按权重随机选择，Role会影响权重
    getMovement()           // Layer 1: 根据Team Style计算移动量
}
```

改造后的AI流程：

```
decideMovementV2() {
  // Layer 1: Team Style — 计算一次，全队共享
  const styleModifiers = computeStyleModifiers(team.strategy);
  
  for each player:
    // Layer 3: Traits — 检查习惯动作覆盖
    const traitOverride = evaluateTraits(player.traits, matchContext);
    if (traitOverride?.action) return { action: traitOverride.action, ... };
    
    // Layer 2: Role — 按位置+角色计算11项动作的权重
    const baseActions = findPossActions(player, ...);
    const roleModifiers = getRoleActionModifiers(player.position, player.role);
    const adjustedActions = applyRoleModifiers(baseActions, roleModifiers);
    
    // Layer 1: Style — 按球队策略调整动作权重
    const styledActions = applyStyleModifiers(adjustedActions, styleModifiers);
    
    const action = selectAction(styledActions);
    
    // Layer 2 + Layer 1: 移动计算
    const movement = getMovementV2(player, action, 
      getRoleMovementBias(player.position, player.role),
      styleModifiers.formationTolerance);
}
```

---

## 7. 数据流与接口约定

### 7.1 数据流图

```
React UI (MatchView)
  │
  ├── TacticsPanel → { formation, mentality, roles, strategy }
  │     │
  │     ▼
  ├── matchEngine.js (Facade)
  │     │
  │     ├── formation.js → originPOS for each player
  │     ├── tactics.js   → team strategy application
  │     │
  │     ▼
  │   buildPlayerJson() — with position-aware originPOS + role assignment
  │   buildTeamJson()    — with strategy settings
  │   createMatch()      — applyMentalityToTeam → applyTeamStrategy
  │     │
  │     ▼
  │   engine.js (Core)
  │     │
  │     ├── playIteration()
  │     │   ├── actions.js → findPossActions() + role modifiers
  │     │   ├── playerMovement.js → getMovement() + style modifiers
  │     │   ├── setPositions.js → position-group aware
  │     │   └── setFreekicks.js → position-group aware
  │     │
  │     ▼
  │   matchDetails (mutable state object)
  │     │
  │     ▼
  ├── MatchView → PitchCanvas (render)
  │
  └── match completion → playerRating.js → result panel
```

### 7.2 引擎初始化时的数据注入

```javascript
// matchEngine.js — createMatch() 增强

export async function createMatch(homeTeam, awayTeam, pitch, tactics) {
  // tactics now includes:
  // - formation (string)
  // - mentality (string)
  // - roles (object: { playerID: roleName, ... })
  // - strategy (object: { tempo, pressing, width, ... })
  // - traits (object: { playerID: [traitName, ...], ... })
  
  // 1. Compute originPOS from formation
  const formationPos = formationEngine.getFormationPositions(
    tactics.formation, pitch, tactics.mentality
  );
  
  // 2. Assign originPOS to each player based on their position
  for (const player of homeTeam.players) {
    player.originPOS = formationPos[player.position] || [340, 350];
    player.role = tactics.roles?.[player.playerID] || getDefaultRole(player.position);
    player.traits = tactics.traits?.[player.playerID] || [];
  }
  
  // 3. Apply Team Strategy
  homeTeam = tacticsEngine.applyTeamStrategy(homeTeam, tactics.strategy, pitch);
  
  // ... rest of existing logic
}
```

### 7.3 球员对象扩展

```javascript
// 引擎层球员对象扩展字段
{
  // === 原有字段 ===
  playerID, name, position, rating,
  skill: { passing, shooting, tackling, saving, agility, strength,
           penalty_taking, perception, jumping, control },
  currentPOS, originPOS, intentPOS,
  fitness, height, injured, action, offside, hasBall,
  stats: { goals, shots, cards, passes, tackles, saves },

  // === 新增字段 ===
  role: 'box_to_box_midfielder',    // FM-style role name
  traits: ['tries_killer_balls'],   // individual player traits
  stamina: 85,                      // separate from fitness (short-term vs long-term)
  morale: 'good',                   // morale state
  
  // === 引擎运行时字段（引擎内部使用，不持久化） ===
  _zoneTolerance: 0.5,             // computed from role + fluidity
  _actionProfile: { ... },         // computed action modifiers
  _movementBias: { x: 0, y: 0 },  // computed movement bias
}
```

---

## 8. 分阶段实施计划

### Phase 0: 基础设施 (预估: 基础准备)

| 任务 | 描述 | 涉及文件 |
|------|------|---------|
| P0.1 | 创建 `engine/lib/formation.js` — 阵型坐标矩阵(10+阵型) | 新文件 |
| P0.2 | 创建 `engine/lib/tactics.js` — TeamStrategy + PlayerRole + Trait系统 | 新文件 |
| P0.3 | 创建位置分组工具函数 `getPositionGroup()` | 新文件或common.js |
| P0.4 | 在 `engine/lib/validate.js` 中扩展位置校验到12个 | validate.js |

### Phase 1: 12位置引擎改造 (预估: 核心重构)

| 任务 | 描述 | 涉及文件 |
|------|------|---------|
| P1.1 | 改造 `actions.js` — 补全CDM/CAM/LW/RW在无球/禁区/中场的所有动作分支 | actions.js |
| P1.2 | 改造 `setFreekicks.js` — 所有10个函数的位置分组引用替换 | setFreekicks.js |
| P1.3 | 改造 `setPositions.js` — 角球/界外球/球门球的站位分组替换 | setPositions.js |
| P1.4 | 改造 `playerMovement.js` — intentPOS计算引入位置分组差异 | playerMovement.js |
| P1.5 | 改造 `matchEngine.js` — 使用formation.js计算originPOS，移除静态POSITION_PLACES | matchEngine.js |

### Phase 2: 动态阵型引擎 (预估: 阵型系统)

| 任务 | 描述 | 涉及文件 |
|------|------|---------|
| P2.1 | 实现 `formation.js` 核心API: `getFormationPositions()`, `computeOriginPOSForStarters()` | formation.js |
| P2.2 | 在 `matchEngine.js` 中集成阵型→originPOS映射 | matchEngine.js |
| P2.3 | 实现 `applyFormationChange()` 赛中变阵功能 | matchEngine.js |
| P2.4 | 更新 `TacticsPanel.jsx` — 扩展阵型选择到10+种，带视觉预览 | TacticsPanel.jsx |
| P2.5 | 更新 `squadGen.js` — 生成适配新阵型的16人阵容(含新替补池) | squadGen.js |

### Phase 3: FM级别换人 (预估: 换人系统)

| 任务 | 描述 | 涉及文件 |
|------|------|---------|
| P3.1 | 实现 `applySubstitutionV2()` — 继承originPOS + 支持变阵联动 | matchEngine.js |
| P3.2 | 扩展替补席到7人，新替补位置池 | squadGen.js |
| P3.3 | 实现换人规则（3次窗口/5人限制/中场免费） | matchEngine.js |
| P3.4 | 更新 `SubstitutionPanel` UI — 显示剩余换人窗口和名额 | TacticsPanel.jsx |
| P3.5 | 更新 `MatchView.jsx` — 赛中变阵按钮和逻辑 | MatchView.jsx |

### Phase 4: 三层AI集成 (预估: AI系统)

| 任务 | 描述 | 涉及文件 |
|------|------|---------|
| P4.1 | 在 `decideMovement()` 中集成Layer 3 Trait覆盖检查 | playerMovement.js |
| P4.2 | 在 `findPossActions()` 中集成Layer 2 Role动作权重修改 | actions.js |
| P4.3 | 在 `getMovement()` 中集成Layer 1 Style移动参数调整 | playerMovement.js |
| P4.4 | 实现 `tactics.js` 的完整TeamStrategy应用逻辑 | tactics.js |
| P4.5 | 更新 `matchEngine.js` — 在createMatch时注入roles和strategy | matchEngine.js |
| P4.6 | 更新 `TacticsPanel.jsx` — 增加球队策略设置UI（节奏、压迫、宽度等） | TacticsPanel.jsx |
| P4.7 | 更新 `PitchCanvas.jsx` — 渲染时考虑球员role的视觉标识 | PitchCanvas.jsx |

### Phase 5: FM评分+统计 (预估: 赛后系统)

| 任务 | 描述 | 涉及文件 |
|------|------|---------|
| P5.1 | 增强 `playerRating.js` — 按位置/角色的差异化评分权重 | playerRating.js |
| P5.2 | 实现完整的事件→统计数据映射（传球成功率、关键传球等） | matchEngine.js |
| P5.3 | 赛后报告面板增强 — 显示球员角色、热图预览 | MatchView.jsx |

---

## 附录：文件变更摘要

| 类别 | 文件 | 变更程度 |
|------|------|---------|
| **新建** | `engine/lib/formation.js` | 全新 — 阵型坐标矩阵 + API |
| **新建** | `engine/lib/tactics.js` | 全新 — TeamStrategy + PlayerRole + Traits |
| **新建** | `engine/lib/positionGroup.js` | 全新 — 位置分组工具 |
| **大幅改造** | `engine/lib/actions.js` | 补全~20处位置分支 + Role集成 |
| **大幅改造** | `engine/lib/setFreekicks.js` | ~10个函数的位置引用替换 |
| **大幅改造** | `engine/lib/setPositions.js` | 定位球站位分组引用替换 |
| **中等改造** | `engine/lib/playerMovement.js` | intentPOS + movement增强 |
| **中等改造** | `engine/lib/validate.js` | 位置校验扩展 |
| **大幅改造** | `src/matchEngine.js` | originPOS管理、换人V2、Strategy注入 |
| **中等改造** | `src/components/TacticsPanel.jsx` | 扩展阵型、Strategy UI |
| **中等改造** | `src/components/MatchView.jsx` | 变阵按钮、换人规则 |
| **小改** | `src/squadGen.js` | 新阵型生成、7人替补池 |
| **小改** | `src/playerRating.js` | 按位置差异化的评分 |
| **小改** | `src/components/PitchCanvas.jsx` | 角色可视化 |
