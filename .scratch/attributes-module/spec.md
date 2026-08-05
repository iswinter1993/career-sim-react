# Spec: 球员属性细分模块

**Feature:** Player Sub-Attributes Module
**Created:** 2026-08-05
**Source:** Grill-with-docs session (CONTEXT.md, ADR-0001)
**Triage:** ready-for-agent

---

## Problem Statement

当前引擎只暴露一个 `ovr` 整数值作为球员能力的唯一指标，玩家无法了解球员在技术、身体、精神等方面的具体构成。这降低了游戏的深度感——玩家无法感知不同位置球员的能力差异（如 ST 的射门 vs CB 的抢断），也无法观察到能力在不同年龄阶段的涨跌细节。

## Solution

在 bridge 层构建一套独立的属性系统，将 OVR 细分为技术（6 项）、身体（5 项）、精神（4 项）共 15 项子属性（值域 0-20）。每种球员位置有独立的权重矩阵用于加权计算，属性值由种子驱动确定性生成、随赛季推移按成长曲线独立演化。UI 通过点击 OVR 徽章弹出面板查看。

## User Stories

1. 作为玩家，我想在生涯界面点击 OVR 徽章查看技术/身体/精神细分属性，以便了解我的球员在各维度的长短板。
2. 作为玩家，我希望不同位置的球员属性分布不同，比如前锋射门高、后卫抢断高，以体现位置特点的真实性。
3. 作为玩家，我希望年轻球员属性逐年增长、老将逐年衰退，让我感受到年龄的作用。
4. 作为玩家，我希望同一个种子生成相同的初始属性和成长轨迹，以便复盘时获得一致性体验。
5. 作为玩家，我希望不同种子生成差异足够大的初始属性，让每局游戏都有新鲜感。
6. 作为玩家，我希望有些球员早熟（年轻时涨得快）、有些晚年爆发，增加游戏性。
7. 作为开发者，我希望属性模块完全独立于 GameContext 状态管理，任何组件只需 `import SIM` 即可查询属性。
8. 作为开发者，我希望属性模块提供清晰的公共接口，未来多个模块（如球探、训练）可以无缝接入。

## Implementation Decisions

### Module Architecture

- **新模块 `src/attributes.js`**：包含所有属性逻辑（权重矩阵、生成、演算、查询），作为纯 JS 模块，不依赖 React。
- **桥接在 `src/simEngine.js`**：`SIM.init()` 调用属性模块的初始化，新增 `getAttributes()`、`initAttributes()`、`tickAttributes()` 等便捷方法。
- 属性状态在 attributes.js 内部闭包维护，不进入 GameContext reducer。

### Data Model

- 15 项子属性，值为 0-20 的整数：

| 大类 | 子属性 | 值域 |
|------|--------|------|
| 技术 (Technical) | 控球、传球、射门、盘带、抢断、定位球 | 0-20 |
| 身体 (Physical) | 速度、力量、耐力、弹跳、对抗 | 0-20 |
| 精神 (Mental) | 视野、冷静、决断、领导力 | 0-20 |

- 每个大类值 = 该大类子属性的加权平均（权重由位置矩阵决定），圆整到整数。
- OVR 由三大类值加权合成。
- 每个球员有隐藏的 `potential`（0-20，由种子确定）和 `devCurve`（enum: `early`/`steady`/`late`，由种子确定）。

### Position Weight Matrices

- 12 个位置（GK, CB, LB, RB, CDM, CM, CAM, LM, RM, LW, RW, ST）各一套权重，决定 15 项子属性的相对重要性。
- 权重分为三个层次：子属性 → 大类 → OVR。

### Public Interface

```typescript
// Query
getAttributes()                    // → { technical: {...}, physical: {...}, mental: {...} }
getCategory(attrs, category)       // → number (0-20), category ∈ {tech, phys, mental}
getWeights(pos)                    // → { subWeights, catWeights }
getOVRFromAttributes(attrs, pos)   // → number (0-99)

// Lifecycle
initAttributes(identity, seed)     // → fresh attributes object
tickAttributes(currentOvr, age, pos, attrs)  // → updated attributes object
getPotential(attrs)                // → number (0-20) — hidden
getDevCurve(attrs)                 // → 'early' | 'steady' | 'late'
```

### Growth & Decline Rules

- **早熟型 (early, ~30%)**：16-22 岁快速增长，24 岁见顶，之后衰退加速
- **平稳型 (steady, ~50%)**：匀速成长，26-28 岁见顶，平稳衰退
- **晚成型 (late, ~20%)**：24 岁前缓慢，25-32 岁持续上涨，32 岁后衰退

- 潜力值上限 = 引擎 OVR 可达的峰值（potential 18 ≈ OVR 90）
- `tickAttributes` 锚定引擎 OVR 的逐年变化（ΔOVR），确保属性模块与引擎 OVR 不脱节

### Lifecycle Hook

- `tickAttributes` 在 GameContext `NEXT_STEP` reducer 中，`SIM.nextStep()` 之后调用
- 继承引擎的事件链路：`nextStep()` → 引擎产出 ΔOVR → `tickAttributes()` 同步属性

### UI Integration

- 点击 CareerView 中的 `OVRBadge` 组件 → 触发 Modal 弹窗
- Modal 展示三栏布局：技术（左）、身体（中）、精神（右），每栏列出子属性及柱状条
- Modal 内置一个简化的 OVR 计算示意（三大类平均加权 → 总 OVR）
- 新增组件 `src/components/AttributesModal.jsx`（名称 TBD）

## Testing Decisions

### What makes a good test

- 测试模块的公共接口，不测试内部实现细节
- 属性生成和演算是纯函数，天然可测试（输入确定 → 输出确定）

### Modules to test

- `attributes.js`：所有导出函数的单元测试（生成、演算、查权）
- `AttributesModal.jsx`：渲染测试（快照）、交互测试（点击 OVRBadge → 弹窗）

### Prior art

- 代码库暂无测试先例，本模块可以作为 Jest/React Testing Library 的试点

## Out of Scope

- 属性相关的图形展示（雷达图、趋势图）—— 后续迭代
- 训练系统 — 后续迭代
- 球探/选秀系统 — 后续迭代
- 属性影响具体比赛事件 — 引擎不暴露此接口
- OVR 计算公式与引擎的完全一致 —— 允许近似

## Further Notes

- ADR-0001 记录了选型理由和替代方案
- CONTEXT.md 记录了领域术语
- 引擎事件中的 `aN()`（伤病）和 `aQ()`（红黄牌）可能影响身体/精神属性，后续可扩展 `tickAttributes` 的调用点
