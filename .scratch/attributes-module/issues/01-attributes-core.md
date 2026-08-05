# 01 — 属性核心模块

**What to build:** 创建 `src/attributes.js` 纯 JS 模块，包含球员属性系统的全部数据和算法逻辑。不依赖 React，所有导出函数纯函数化（除内部状态闭包外）。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 15 项子属性的数据模型定义（技术 6：控球/传球/射门/盘带/抢断/定位球；身体 5：速度/力量/耐力/弹跳/对抗；精神 4：视野/冷静/决断/领导力，均为 0-20 整数）。
- [ ] 12 套位置权重矩阵（GK/CB/LB/RB/CDM/CM/CAM/LM/RM/LW/RW/ST），每套包含 15 项子属性权重（子属性→大类）和 3 项大类权重（大类→OVR）。权重值应体现位置特征（如 ST 射门权重高、抢断权重低）。
- [ ] `initAttributes(identity, seed)` — 基于种子确定性生成初始属性。种子驱动随机引擎（同一 seed + 同一 identity 产出一致结果），不同种子差异足够大（±4 抖动）。生成隐藏的 potential（0-20）和 devCurve（early/steady/late），比例约为 30%/50%/20%。位置权重引导初始分配（权重高的子属性起始值偏高）。
- [ ] `tickAttributes(currentOvr, age, pos, attrs)` — 基于当前引擎 OVR、年龄、位置、成长曲线类型和潜力值，逐赛季演算属性涨跌。返回更新后的 attrs。早熟型 16-22 快涨、24 见顶；平稳型匀速至 26-28 见顶；晚成型 25-32 仍涨。锚定引擎 ΔOVR 确保不脱节。
- [ ] `getAttributes()` — 返回当前球员完整属性对象。
- [ ] `getCategory(attrs, category)` — 返回某一类别（tech/phys/mental）的加权整数值。
- [ ] `getWeights(pos)` — 返回指定位置的子属性权重和大类权重。
- [ ] `getOVRFromAttributes(attrs, pos)` — 从属性反推近似 OVR（0-99），保持与引擎 OVR 趋势一致。
- [ ] `getPotential(attrs)` / `getDevCurve(attrs)` — 返回隐藏属性（仅用于内部和将来扩展）。
- [ ] 属性状态在模块内部闭包维护（`let _currentAttrs = null`），通过 `getAttributes()` 访问。
