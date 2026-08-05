# career-sim-react — Domain Glossary

Last updated: 2026-08-05

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

## UI

点击 CareerView 中的 OVRBadge 弹出属性详情面板（Modal），展示技术/身体/精神三栏及其子属性值。
