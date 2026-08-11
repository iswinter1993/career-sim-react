# 引擎优化 — 实施任务单索引

> 自动生成自 `ENGINE_ARCHITECTURE_SPEC.md` 第8节  
> 最后更新: 2026-08-11

---

## 概览

| Phase | 名称 | Tickets | 状态 |
|-------|------|---------|------|
| P0 | 基础设施 | 4 | 🟡 待实施 |
| P1 | 12位置引擎改造 | 5 | 🟡 待实施 |
| P2 | 动态阵型引擎 | 5 | 🟡 待实施 |
| P3 | FM级别换人 | 5 | 🟡 待实施 |
| P4 | Three-Layer AI | 7 | 🟡 待实施 |
| P5 | FM风格评分与统计 | 3 | 🟡 待实施 |
| **总计** | | **29** | |

---

## 依赖图 (Blocking Edges)

```
P0.1 (formation矩阵)
  ├─→ P1.5 (matchEngine改造)
  ├─→ P2.1 (formation API)
  ├─→ P2.4 (TacticsPanel重构)
  └─→ P2.5 (squadGen重构)

P0.2 (tactics定义)
  ├─→ P4.1 (TeamStrategy)
  ├─→ P4.2 (PlayerRole)
  └─→ P4.3 (PlayerTraits)

P0.3 (positionGroup)
  ├─→ P1.1 (actions 12位置)
  ├─→ P1.2 (setFreekicks 12位置)
  ├─→ P1.3 (setPositions 12位置)
  ├─→ P1.4 (playerMovement增强)
  ├─→ P2.5 (squadGen)
  ├─→ P3.1 (换人核心)
  └─→ P3.4 (位置覆盖)

P0.4 (validate 12位置)
  └─→ P1.5 (matchEngine改造)

P1.1 (actions 12位置)
  ├─→ P4.4 (动作选择AI集成)
  ├─→ P5.1 (评分重构)
  └─→ P5.2 (统计追踪)

P1.2 (setFreekicks 12位置)
  └─→ (独立, 无下游)

P1.3 (setPositions 12位置)
  └─→ (独立, 无下游)

P1.4 (playerMovement增强)
  ├─→ P4.1 (策略影响移动)
  └─→ P4.5 (移动AI集成)

P1.5 (matchEngine改造)
  ├─→ P2.2 (matchEngine集成)
  ├─→ P2.3 (赛中变阵)
  ├─→ P3.1 (换人核心)
  └─→ P4.5 (移动AI集成)

P2.1 (formation API)
  ├─→ P2.2 (matchEngine集成)
  └─→ P2.4 (TacticsPanel)

P2.2 (matchEngine集成)
  └─→ P2.3 (赛中变阵)

P2.3 (赛中变阵)
  └─→ P3.1 (变阵联动换人)

P2.4 (TacticsPanel重构)
  └─→ P4.6 (战术UI)

P2.5 (squadGen重构)
  └─→ (独立, 无下游)

P3.1 (换人核心)
  ├─→ P3.2 (变阵联动换人)
  ├─→ P3.3 (换人UI)
  ├─→ P3.4 (位置覆盖)
  └─→ P3.5 (换人报告)

P3.2 (变阵联动换人)
  └─→ P3.3 (换人UI)

P3.3 (换人UI)
  └─→ (独立, 无下游)

P3.4 (位置覆盖)
  └─→ (独立, 无下游)

P3.5 (换人报告)
  └─→ P5.3 (赛后报告)

P4.1 (TeamStrategy)
  ├─→ P4.3 (Traits → actions)
  ├─→ P4.4 (动作选择AI)
  ├─→ P4.5 (移动AI)
  └─→ P4.7 (粘合层)

P4.2 (PlayerRole)
  ├─→ P4.4 (动作选择AI)
  ├─→ P4.5 (移动AI)
  ├─→ P4.6 (角色选择器UI)
  └─→ P4.7 (粘合层)

P4.3 (PlayerTraits)
  ├─→ P4.4 (动作选择AI)
  ├─→ P4.5 (移动AI)
  └─→ P4.7 (粘合层)

P4.4 (动作选择AI)
  └─→ P4.7 (粘合层)

P4.5 (移动AI)
  └─→ P4.7 (粘合层)

P4.6 (战术UI)
  └─→ P4.7 (粘合层)

P4.7 (粘合层)
  └─→ P5.1 (评分需要战术数据)

P5.1 (评分重构)
  └─→ P5.3 (赛后报告)

P5.2 (统计追踪)
  └─→ P5.3 (赛后报告)

P5.3 (赛后报告)
  └─→ (最终交付物)
```

---

## 实施顺序建议

### 波次1 — 基础设施 (预计 2-3 次会话)
```
P0.1 → P0.3 → P0.4 → P0.2
```

### 波次2 — 12位置 + 阵型核心 (预计 3-4 次会话)
```
P1.1 → P1.2 → P1.3 → P1.4 (并行)
P0.1 → P2.1 → P1.5 → P2.2 → P2.3 (串行)
P0.1 → P2.4, P2.5 (并行)
```

### 波次3 — 换人系统 (预计 2-3 次会话)
```
P3.1 → P3.2 → P3.3 (串行)
P3.4, P3.5 (可与 P3.2 并行)
```

### 波次4 — Three-Layer AI (预计 3-4 次会话)
```
P4.1 → P4.2 → P4.3 (基础定义, 可并行)
P4.4 → P4.5 → P4.6 → P4.7 (集成, 需串行)
```

### 波次5 — 评分统计 (预计 1-2 次会话)
```
P5.1 → P5.2 → P5.3 (建议串行以确保数据流正确)
```

---

## 无依赖Ticket (可随时并行实施)

这些ticket没有未完成的阻塞依赖，可以在任何时间点独立实施：

| Ticket | 描述 | 复杂度 |
|--------|------|--------|
| P0.1 | formation.js 基础矩阵 | 中 |
| P0.2 | tactics.js 基础定义 | 中 |
| P0.3 | positionGroup.js | 低 |
| P0.4 | validate 12位置 | 低 |
| P1.2 | setFreekicks 12位置 | 中 |
| P1.3 | setPositions 12位置 | 高 |
| P2.5 | squadGen 重构 | 中 |
| P3.4 | 位置覆盖逻辑 | 低 |
| P3.5 | 换人报告 | 低 |
| P4.1 | TeamStrategy | 中 |
| P4.2 | PlayerRole | 中 |
| P4.3 | PlayerTraits | 中 |

---

## 关键风险点

1. **P1.3 (setPositions)**: 依赖引擎内部数组索引，改变可能引入隐性bug。建议先写回归测试。
2. **P4.7 (粘合层)**: 多个模块的接口适配点，是所有集成的关键，如果接口不匹配会导致数据流断裂。
3. **P0.1 (formation矩阵)**: 坐标数学需要精密验证 (10+阵型 × 11位置 × 2坐标 = 220+个数据点)
4. **P1.1 (actions)**: ~100处硬编码位置引用需要逐一核对，遗漏一处就会导致运行时undefined。

---

## Ticket 目录

| # | 文件 | Phase | 描述 |
|---|------|-------|------|
| 1 | P0.1_formation_matrix.md | P0 | formation.js — 10+阵型坐标矩阵 |
| 2 | P0.2_tactics_system.md | P0 | tactics.js — Strategy/Role/Trait定义 |
| 3 | P0.3_position_group.md | P0 | positionGroup.js — 6大位置组 |
| 4 | P0.4_validate_12_positions.md | P0 | validate.js — 12位置验证 |
| 5 | P1.1_actions_12_positions.md | P1 | actions.js — 12位置动作权重 |
| 6 | P1.2_setfreekicks_12_positions.md | P1 | setFreekicks.js — 12位置定位 |
| 7 | P1.3_setpositions_12_positions.md | P1 | setPositions.js — 位置分配重构 |
| 8 | P1.4_player_movement_enhance.md | P1 | playerMovement.js — intentPOS增强 |
| 9 | P1.5_matchEngine_formation_integration.md | P1 | matchEngine.js — 阵型集成 |
| 10 | P2.1_formation_api_complete.md | P2 | formation.js — 核心API完成 |
| 11 | P2.2_matchEngine_formation_integration.md | P2 | matchEngine.js — 阵型映射 |
| 12 | P2.3_formation_change.md | P2 | matchEngine.js — 赛中变阵 |
| 13 | P2.4_tactics_panel_refactor.md | P2 | TacticsPanel — 10+阵型选择器 |
| 14 | P2.5_squadgen_formation_support.md | P2 | squadGen.js — 阵型支持 |
| 15 | P3.1_substitution_core.md | P3 | matchEngine.js — 换人核心 |
| 16 | P3.2_formation_subs_combo.md | P3 | matchEngine.js — 变阵联动换人 |
| 17 | P3.3_substitution_ui.md | P3 | MatchView — 换人UI面板 |
| 18 | P3.4_position_coverage.md | P3 | positionGroup — 熟悉度惩罚 |
| 19 | P3.5_substitution_report.md | P3 | matchEngine — 换人统计报告 |
| 20 | P4.1_team_strategy.md | P4 | tactics.js — 球队风格 |
| 21 | P4.2_player_role.md | P4 | tactics.js — 球员角色 |
| 22 | P4.3_player_traits.md | P4 | tactics.js — 球员特质 |
| 23 | P4.4_action_selection_integration.md | P4 | actions.js — 动作选择AI集成 |
| 24 | P4.5_movement_ai_integration.md | P4 | playerMovement — 移动AI集成 |
| 25 | P4.6_tactics_ui_integration.md | P4 | TacticsPanel — 战术UI |
| 26 | P4.7_tactics_engine_glue.md | P4 | matchEngine — AI粘合层 |
| 27 | P5.1_player_rating_refactor.md | P5 | playerRating.js — 角色差异化评分 |
| 28 | P5.2_match_stats_tracker.md | P5 | matchStats.js — 统计追踪 |
| 29 | P5.3_match_report.md | P5 | MatchReport — 赛后报告 |
